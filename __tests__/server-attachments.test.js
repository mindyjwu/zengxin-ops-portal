/** 申請單附件：型別與內容檢查、誰能傳／看／刪、稽核紀錄、雜湊驗證、軟刪除與保存、資料庫不可改。 */
const request = require('supertest');
const { createDb } = require('../server/db');
const { createApp } = require('../server/app');
const { createStorage } = require('../server/storage');
const { seed } = require('../server/seed');
const { saveAttachment } = require('../server/attachments');

let db, app, storage;
const MAX = 1024 * 1024;
beforeAll(async () => {
  db = await createDb(); await seed(db);
  await db.query("INSERT INTO employees (id,name,email,unit_id,role,manager_id,hired_at) VALUES ('J020010','員工乙','b@example.test','J02','employee','J020001','2026-06-01')");
  storage = createStorage({ storageDriver: 'memory' });
  app = createApp({ db, verifyGoogle: async () => ({}), storage, config: { sessionSecret: 'test-secret-test-secret-test-secret-00', devLogin: true, maxUploadBytes: MAX } });
});
afterAll(async () => { await db.close(); });

const as = async email => { const a = request.agent(app); expect((await a.post('/auth/dev-login').send({ email })).status).toBe(200); return a; };
const PDF = (extra = '') => Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n' + extra);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('rest')]);
let day = 0;
/** 員工甲送一張請假單（每次用不同日期，避免重疊），回傳單號 id */
async function newLeave(a) {
  day += 1; const d = `2031-03-${String(day + 1).padStart(2, '0')}`;
  const r = await a.post('/api/leave').send({ leaveType: 'personal', start: `${d}T08:00:00+08:00`, end: `${d}T17:00:00+08:00`, hours: 8, reason: '測試' });
  expect(r.status).toBe(201); return r.body.id;
}
const up = (a, id, name, buf, type = 'application/octet-stream') => a.post(`/api/requests/${id}/attachments`).set('x-filename', encodeURIComponent(name)).set('content-type', type).send(buf);
const audits = async action => (await db.query('SELECT target, detail FROM audit_log WHERE action=$1 ORDER BY id', [action])).rows;

describe('uploading', () => {
  test('the applicant can attach a file; it is stored under a system-made key, with its hash, and the request points at it', async () => {
    const a = await as('a@example.test'), id = await newLeave(a);
    const r = await up(a, id, '診斷證明（正本）.pdf', PDF(), 'application/pdf');
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ filename: '診斷證明（正本）.pdf', contentType: 'application/pdf', size: PDF().length });
    expect(r.body.sha256).toMatch(/^[0-9a-f]{64}$/); expect(r.body.key).toBeUndefined();            // 鍵是內部細節，不給前端
    const row = (await db.query('SELECT * FROM attachments WHERE id=$1', [r.body.id])).rows[0];
    expect(row.storage_key).toMatch(new RegExp(`^attachments/request/${id}/\\d{4}/[0-9a-f-]{36}\\.pdf$`));   // 沒有使用者給的檔名
    expect(await storage.exists(row.storage_key)).toBe(true);
    expect((await db.query('SELECT attachment_key FROM requests WHERE id=$1', [id])).rows[0].attachment_key).toBe(row.storage_key);
    expect(new Date(row.keep_until).toISOString().slice(0, 4)).toBe(String(new Date().getUTCFullYear() + 5));      // 保存五年
    expect((await audits('attachment_upload')).some(x => x.target === 'L' + id)).toBe(true);
  });
  test('a path in the file name cannot reach the storage key', async () => {
    const a = await as('a@example.test'), id = await newLeave(a);
    const r = await up(a, id, '../../etc/passwd.pdf', PDF());
    expect(r.status).toBe(201); expect(r.body.filename).toBe('etcpasswd.pdf');
    expect((await db.query('SELECT storage_key FROM attachments WHERE id=$1', [r.body.id])).rows[0].storage_key).not.toMatch(/passwd|\.\./);
  });
  test('only allowed types, and the content must match the extension', async () => {
    const a = await as('a@example.test'), id = await newLeave(a);
    expect((await up(a, id, 'run.exe', Buffer.from('MZ....'))).status).toBe(415);
    expect((await up(a, id, 'noext', PDF())).status).toBe(415);
    expect((await up(a, id, 'fake.pdf', Buffer.from('#!/bin/sh\nrm -rf /'))).body.error).toBe('content_does_not_match_extension');   // 程式改名成 .pdf
    expect((await up(a, id, 'photo.png', PDF())).status).toBe(415);                                  // 副檔名說是圖片，內容是 PDF
    expect((await up(a, id, 'empty.pdf', Buffer.alloc(0))).status).toBe(400);
    expect((await up(a, id, 'ok.png', PNG)).status).toBe(201);
    expect((await up(a, id, 'sheet.xlsx', Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('zip')]))).status).toBe(201);
    expect((await up(a, id, 'old.doc', Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.from('ole')]))).status).toBe(201);
    expect((await up(a, id, 'cam.heic', Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic')]))).status).toBe(201);
  });
  test('size limit is enforced while the body is being read', async () => {
    const a = await as('a@example.test'), id = await newLeave(a);
    const big = await up(a, id, 'big.pdf', PDF('x'.repeat(MAX)));
    expect(big.status).toBe(413); expect(big.body.error).toBe('file_too_large');
    expect((await up(a, id, 'fits.pdf', PDF('x'.repeat(MAX - 100)))).status).toBe(201);
  });
  test('at most five files per request', async () => {
    const a = await as('a@example.test'), id = await newLeave(a);
    for (let i = 0; i < 5; i++) expect((await up(a, id, `f${i}.pdf`, PDF(String(i)))).status).toBe(201);
    const r = await up(a, id, 'six.pdf', PDF('6')); expect(r.status).toBe(409); expect(r.body).toMatchObject({ error: 'too_many_attachments', max: 5 });
  });
  test('only the applicant can upload, and only while the request is open', async () => {
    const a = await as('a@example.test'), mgr = await as('manager@example.test'), hr = await as('hr@example.test'), id = await newLeave(a);
    expect((await up(mgr, id, 'x.pdf', PDF())).status).toBe(403);                                    // 主管也不能替員工傳
    expect((await up(await as('b@example.test'), id, 'x.pdf', PDF())).status).toBe(403);
    expect((await request(app).post(`/api/requests/${id}/attachments`).send(PDF())).status).toBe(401);
    expect((await up(a, 999999, 'x.pdf', PDF())).status).toBe(404);
    expect((await up(a, id, 'ok.pdf', PDF())).status).toBe(201);
    await mgr.post(`/api/requests/${id}/approve`).send({}); await hr.post(`/api/requests/${id}/approve`).send({});   // 核准之後
    expect((await up(a, id, 'late.pdf', PDF('late'))).body.error).toBe('not_open');
  });
  test('no storage configured means a clear 503, not a silent save somewhere that disappears', async () => {
    const bare = createApp({ db, verifyGoogle: async () => ({}), storage: null, config: { sessionSecret: 'test-secret-test-secret-test-secret-00', devLogin: true } });
    const a = request.agent(bare); await a.post('/auth/dev-login').send({ email: 'a@example.test' });
    const id = await newLeave(await as('a@example.test'));
    expect((await up(a, id, 'x.pdf', PDF())).body.error).toBe('storage_not_configured');
  });
  test('the size limit also holds when the function is called directly (later owners: approval forms, insurance notices)', async () => {
    const s = createStorage({ storageDriver: 'memory' });
    const r = await saveAttachment({ db, storage: s, ownerKind: 'request', ownerId: 1, user: { id: 'J020003' }, rawName: 'x.pdf', buffer: PDF('y'.repeat(100)), maxBytes: 50 });
    expect(r).toMatchObject({ code: 413, error: 'file_too_large', maxBytes: 50 }); expect(await s.list('')).toEqual([]);
  });
  test('if the database cannot record the file, the stored copy is taken back (no orphan files)', async () => {
    const s = createStorage({ storageDriver: 'memory' });
    await expect(saveAttachment({ db, storage: s, ownerKind: 'request', ownerId: 1, user: { id: 'NOBODY' }, rawName: 'x.pdf', buffer: PDF() })).rejects.toThrow();
    expect(await s.list('')).toEqual([]);
  });
});

describe('downloading and listing', () => {
  test('the applicant, the manager and HR can read it; other employees cannot; every download is logged', async () => {
    const a = await as('a@example.test'), id = await newLeave(a), body = PDF('secret');
    const aid = (await up(a, id, '證明.pdf', body)).body.id, url = `/api/requests/${id}/attachments/${aid}`;
    for (const who of ['a@example.test', 'manager@example.test', 'hr@example.test']) {
      const r = await (await as(who)).get(url).buffer(true).parse((res, cb) => { const c = []; res.on('data', d => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
      expect(r.status).toBe(200); expect(Buffer.compare(r.body, body)).toBe(0);
      expect(r.headers['content-type']).toContain('application/pdf'); expect(r.headers['content-disposition']).toMatch(/^attachment;.*filename\*=UTF-8''%E8%AD%89%E6%98%8E\.pdf/);
      expect(r.headers['content-security-policy']).toContain('sandbox'); expect(r.headers['x-content-type-options']).toBe('nosniff');
    }
    expect((await (await as('b@example.test')).get(url)).status).toBe(403);
    expect((await request(app).get(url)).status).toBe(401);
    expect((await a.get(`/api/requests/${id}/attachments/999999`)).status).toBe(404);
    expect((await audits('attachment_download')).filter(x => x.target === 'L' + id)).toHaveLength(3);
  });
  test('the list shows metadata only (no storage key) and only to people who can see the request', async () => {
    const a = await as('a@example.test'), id = await newLeave(a);
    await up(a, id, 'one.pdf', PDF('1')); await up(a, id, 'two.png', PNG);
    const l = (await a.get(`/api/requests/${id}/attachments`)).body;
    expect(l.map(x => x.filename)).toEqual(['one.pdf', 'two.png']); expect(l[0]).toEqual(expect.objectContaining({ sha256: expect.any(String), size: expect.any(Number) })); expect(l[0].storage_key).toBeUndefined();
    expect((await (await as('b@example.test')).get(`/api/requests/${id}/attachments`)).status).toBe(403);
    expect((await (await as('manager@example.test')).get(`/api/requests/${id}/attachments`)).body).toHaveLength(2);
  });
  test('a file that was changed in storage is refused and the problem is logged', async () => {
    const a = await as('a@example.test'), id = await newLeave(a);
    const aid = (await up(a, id, 'real.pdf', PDF('real'))).body.id, key = (await db.query('SELECT storage_key FROM attachments WHERE id=$1', [aid])).rows[0].storage_key;
    await storage.put(key, PDF('tampered'), { overwrite: true });
    const r = await a.get(`/api/requests/${id}/attachments/${aid}`);
    expect(r.status).toBe(500); expect(r.body.error).toBe('integrity_check_failed');
    expect((await audits('attachment_error')).some(x => x.target === 'L' + id)).toBe(true);
  });
  test('a file that is missing in storage is reported, not served as empty', async () => {
    const a = await as('a@example.test'), id = await newLeave(a);
    const aid = (await up(a, id, 'gone.pdf', PDF('gone'))).body.id, key = (await db.query('SELECT storage_key FROM attachments WHERE id=$1', [aid])).rows[0].storage_key;
    await storage.delete(key);
    expect((await a.get(`/api/requests/${id}/attachments/${aid}`)).body.error).toBe('file_missing_in_storage');
  });
});

describe('deleting is only a mark', () => {
  test('the applicant can remove a file while the request is open; it disappears from lists and downloads but is kept until the retention date', async () => {
    const a = await as('a@example.test'), id = await newLeave(a);
    const keep = (await up(a, id, 'keep.pdf', PDF('k'))).body.id, drop = (await up(a, id, 'drop.pdf', PDF('d'))).body.id;
    const key = (await db.query('SELECT storage_key FROM attachments WHERE id=$1', [drop])).rows[0].storage_key;
    expect((await a.delete(`/api/requests/${id}/attachments/${drop}`)).status).toBe(200);
    expect((await a.get(`/api/requests/${id}/attachments`)).body.map(x => x.id)).toEqual([keep]);
    expect((await a.get(`/api/requests/${id}/attachments/${drop}`)).status).toBe(404);
    expect(await storage.exists(key)).toBe(true);                                                    // 檔案還在：保存與刪除政策待確認，不立刻抹掉
    const row = (await db.query('SELECT deleted_at, deleted_by FROM attachments WHERE id=$1', [drop])).rows[0]; expect(row.deleted_at).not.toBeNull(); expect(row.deleted_by).toBe('J020003');
    expect((await db.query('SELECT attachment_key FROM requests WHERE id=$1', [id])).rows[0].attachment_key).toContain(`/`);   // 還有一個，指向它
    await a.delete(`/api/requests/${id}/attachments/${keep}`);
    expect((await db.query('SELECT attachment_key FROM requests WHERE id=$1', [id])).rows[0].attachment_key).toBeNull();
    expect((await a.delete(`/api/requests/${id}/attachments/${drop}`)).status).toBe(404);          // 不能重複刪
    expect((await audits('attachment_delete')).filter(x => x.target === 'L' + id)).toHaveLength(2);
  });
  test('others cannot delete, and nobody can delete once the request is decided', async () => {
    const a = await as('a@example.test'), mgr = await as('manager@example.test'), hr = await as('hr@example.test'), id = await newLeave(a);
    const aid = (await up(a, id, 'x.pdf', PDF('x'))).body.id;
    expect((await mgr.delete(`/api/requests/${id}/attachments/${aid}`)).status).toBe(403);
    await mgr.post(`/api/requests/${id}/approve`).send({}); await hr.post(`/api/requests/${id}/approve`).send({});
    expect((await a.delete(`/api/requests/${id}/attachments/${aid}`)).body.error).toBe('not_open');
    expect((await a.get(`/api/requests/${id}/attachments`)).body).toHaveLength(1);
  });
});

describe('the database keeps the record honest', () => {
  test('rows cannot be removed or rewritten; only a deletion mark can be set, once', async () => {
    const a = await as('a@example.test'), id = await newLeave(a);
    const aid = (await up(a, id, 'x.pdf', PDF('guard'))).body.id;
    await expect(db.query('DELETE FROM attachments WHERE id=$1', [aid])).rejects.toThrow(/cannot be deleted/);
    await expect(db.query("UPDATE attachments SET filename='y.pdf' WHERE id=$1", [aid])).rejects.toThrow(/immutable/);
    await expect(db.query("UPDATE attachments SET sha256=repeat('0',64) WHERE id=$1", [aid])).rejects.toThrow(/immutable/);
    await db.query("UPDATE attachments SET deleted_at=now(), deleted_by='J020003' WHERE id=$1", [aid]);
    await expect(db.query("UPDATE attachments SET deleted_at=NULL WHERE id=$1", [aid])).rejects.toThrow(/already deleted/);
  });
  test('bad values are refused by the table itself', async () => {
    const base = ['request', '1', 'attachments/request/1/2031/z.pdf', 'z.pdf', 'application/pdf', 10, '0'.repeat(64), 'J020003', '2036-01-01'];
    const ins = o => db.query('INSERT INTO attachments (owner_kind, owner_id, storage_key, filename, content_type, size_bytes, sha256, uploaded_by, keep_until) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', o);
    await expect(ins(['other', ...base.slice(1)])).rejects.toThrow();
    await expect(ins([...base.slice(0, 5), 0, ...base.slice(6)])).rejects.toThrow();
    await expect(ins([...base.slice(0, 6), 'abc', ...base.slice(7)])).rejects.toThrow();
    await ins(base); await expect(ins(base)).rejects.toThrow();                                     // 同一個儲存位置只能記一次
  });
});
