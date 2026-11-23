/** 檔案儲存層：三種實作（記憶體、本機資料夾、Google Cloud Storage 用假的 client）都要通過同一組測試，
 *  這樣之後只換環境變數就能從本機換到雲端；另外檢查鍵的規則（擋路徑穿越）與本機實作的細節。 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStorage, validKey } = require('../server/storage');

/** 假的 Cloud Storage client：只實作我們用到的方法，行為照官方文件（ifGenerationMatch:0 已存在回 412、讀不到回 404） */
function fakeGcs() {
  const objs = new Map(), err = code => Object.assign(new Error('gcs ' + code), { code });
  const file = key => ({
    async save(buf, o = {}) { if (o.preconditionOpts && o.preconditionOpts.ifGenerationMatch === 0 && objs.has(key)) throw err(412); objs.set(key, { buf: Buffer.from(buf), contentType: o.contentType }); },
    async download() { const x = objs.get(key); if (!x) throw err(404); return [Buffer.from(x.buf)]; },
    async getMetadata() { const x = objs.get(key); if (!x) throw err(404); return [{ contentType: x.contentType }]; },
    async exists() { return [objs.has(key)]; },
    async delete(o = {}) { if (!objs.has(key) && !o.ignoreNotFound) throw err(404); objs.delete(key); return []; }
  });
  return { objs, bucket: () => ({ file, async getFiles({ prefix }) { return [[...objs.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name }))]; } }) };
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zx-storage-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
const makers = {
  memory: () => createStorage({ storageDriver: 'memory' }),
  local: () => createStorage({ storageDriver: 'local', storageDir: fs.mkdtempSync(path.join(tmp, 'd-')) }),
  gcs: () => createStorage({ storageDriver: 'gcs', storageBucket: 'zengxin-test-files' }, { client: fakeGcs() })
};

describe.each(Object.keys(makers))('storage contract: %s', name => {
  let s; beforeEach(() => { s = makers[name](); });
  const all = Buffer.from(Array.from({ length: 256 }, (_, i) => i));

  test('what goes in comes out byte for byte, with its type, size and sha256', async () => {
    const put = await s.put('attachments/request/12/2026/a.pdf', all, { contentType: 'application/pdf' });
    expect(put).toMatchObject({ key: 'attachments/request/12/2026/a.pdf', size: 256, contentType: 'application/pdf' });
    expect(put.sha256).toBe(require('crypto').createHash('sha256').update(all).digest('hex'));
    const got = await s.get('attachments/request/12/2026/a.pdf');
    expect(got.buffer.equals(all)).toBe(true); expect(got.contentType).toBe('application/pdf'); expect(got.size).toBe(256);
  });
  test('a stored file is never silently replaced', async () => {
    await s.put('x/a.pdf', Buffer.from('one'));
    await expect(s.put('x/a.pdf', Buffer.from('two'))).rejects.toMatchObject({ code: 'exists' });
    expect((await s.get('x/a.pdf')).buffer.toString()).toBe('one');
    await s.put('x/a.pdf', Buffer.from('two'), { overwrite: true });                                   // 要覆蓋得明講
    expect((await s.get('x/a.pdf')).buffer.toString()).toBe('two');
  });
  test('missing files read as null, exists tells the truth, delete can be repeated', async () => {
    expect(await s.get('x/none.pdf')).toBeNull(); expect(await s.exists('x/none.pdf')).toBe(false);
    await s.put('x/b.pdf', Buffer.from('b')); expect(await s.exists('x/b.pdf')).toBe(true);
    await s.delete('x/b.pdf'); await s.delete('x/b.pdf');
    expect(await s.exists('x/b.pdf')).toBe(false); expect(await s.get('x/b.pdf')).toBeNull();
  });
  test('list returns the keys under a prefix, sorted, and nothing else', async () => {
    for (const k of ['a/2.pdf', 'a/1.pdf', 'b/1.pdf', 'a/sub/3.pdf']) await s.put(k, Buffer.from(k));
    expect(await s.list('a/')).toEqual(['a/1.pdf', 'a/2.pdf', 'a/sub/3.pdf']);
    expect(await s.list('')).toHaveLength(4); expect(await s.list('zzz/')).toEqual([]);
  });
  test('keys that could escape or hide are refused before anything is touched', async () => {
    for (const k of ['../x', '/abs/x', 'a//b', 'A/B.pdf', '.hidden/x', 'a/../b', 'a/./b', 'a/b/', '', 'x.meta.json', 'a b/c', 'é/x', 'a/' + 'x'.repeat(300), null, 42]) {
      expect(validKey(k)).toBe(false);
      await expect(s.put(k, Buffer.from('x'))).rejects.toMatchObject({ code: 'bad_key' });
      await expect(s.get(k)).rejects.toMatchObject({ code: 'bad_key' });
      await expect(s.delete(k)).rejects.toMatchObject({ code: 'bad_key' });
    }
    expect(await s.list('')).toEqual([]);
  });
  test('only buffers can be stored', async () => {
    await expect(s.put('x/a.pdf', 'text')).rejects.toMatchObject({ code: 'bad_data' });
  });
});

describe('local folder details', () => {
  test('files survive a restart (a new instance on the same folder sees them) and no temp files are left', async () => {
    const dir = fs.mkdtempSync(path.join(tmp, 'r-')), a = createStorage({ storageDriver: 'local', storageDir: dir });
    await a.put('k/one.pdf', Buffer.from('hello'), { contentType: 'application/pdf' });
    const b = createStorage({ storageDriver: 'local', storageDir: dir });
    expect((await b.get('k/one.pdf')).buffer.toString()).toBe('hello'); expect((await b.get('k/one.pdf')).contentType).toBe('application/pdf');
    expect(fs.readdirSync(path.join(dir, 'k')).filter(f => f.endsWith('.tmp'))).toEqual([]);
    expect(await b.list('')).toEqual(['k/one.pdf']);                                                    // 旁檔（.meta.json）不會被當成檔案列出
  });
  test('everything stays inside the folder', async () => {
    const dir = fs.mkdtempSync(path.join(tmp, 's-')), s = createStorage({ storageDriver: 'local', storageDir: dir });
    await s.put('a/b/c.pdf', Buffer.from('x'));
    const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
    expect(walk(dir).every(f => f.startsWith(dir + path.sep))).toBe(true);
    expect(fs.existsSync(path.join(dir, '..', 'c.pdf'))).toBe(false);
  });
});

describe('choosing and configuring the storage', () => {
  test('driver settings are checked with clear messages', () => {
    expect(() => createStorage({ storageDriver: 'local' })).toThrow(/STORAGE_DIR/);
    expect(() => createStorage({ storageDriver: 'gcs' })).toThrow(/STORAGE_BUCKET/);
    expect(() => createStorage({ storageDriver: 'ftp' })).toThrow(/STORAGE_DRIVER/);
    expect(createStorage({}).name).toBe('memory');
  });
  test('the real Google client is installed and can be constructed without any network call', () => {
    expect(createStorage({ storageDriver: 'gcs', storageBucket: 'zengxin-test-files' }).name).toBe('gcs');   // 還沒碰雲端：只建 client，拿到憑證與儲存桶才會真的連線
  });
  test('a gcs write refuses to replace an existing object (the precondition is sent)', async () => {
    const c = fakeGcs(), s = createStorage({ storageDriver: 'gcs', storageBucket: 'b' }, { client: c });
    await s.put('k/a.pdf', Buffer.from('1')); await expect(s.put('k/a.pdf', Buffer.from('2'))).rejects.toMatchObject({ code: 'exists' });
    expect(c.objs.get('k/a.pdf').buf.toString()).toBe('1');
  });
});
