/**
 * 檔案儲存層：程式其他地方只認這一個介面，不知道檔案實際放在哪裡。
 * 三種實作，換一個環境變數就切換，其他程式不用改：
 *   memory  只存在記憶體（自動化測試、本機試跑；重啟就消失）
 *   local   存在本機資料夾（STORAGE_DIR，本機開發用；Cloud Run 的磁碟重啟就消失，所以正式環境不能用）
 *   gcs     Google Cloud Storage（STORAGE_BUCKET；正式環境用）
 *
 * 介面（全部 async）：
 *   put(key, buffer, { contentType, overwrite }) → { key, size, sha256, contentType }   已經存在就拒絕（附件不可被覆蓋），除非 overwrite:true
 *   get(key) → { buffer, contentType, size } 或 null
 *   exists(key) → boolean
 *   delete(key)  不存在也不報錯
 *   list(prefix) → [key, ...]
 *
 * 鍵（key）規則：小寫英數、底線、連字號、點，用斜線分層；每一層都不能以點開頭（擋掉 ..），不能放使用者輸入的檔名。
 */
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const KEY_RE = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/;
const META = '.meta.json';                                                         // 本機實作的旁檔後綴；保留，不能當鍵的結尾
const validKey = k => typeof k === 'string' && k.length <= 300 && KEY_RE.test(k) && !k.endsWith(META);
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
const badKey = k => Object.assign(new Error('bad_storage_key: ' + String(k).slice(0, 60)), { code: 'bad_key' });
const exists_ = key => Object.assign(new Error('storage_key_exists: ' + key), { code: 'exists' });

/** 共同的檢查與雜湊；實際讀寫交給各驅動 */
function wrap(driver) {
  return {
    name: driver.name,
    async put(key, buffer, opts = {}) {
      if (!validKey(key)) throw badKey(key);
      if (!Buffer.isBuffer(buffer)) throw Object.assign(new Error('storage_put_needs_a_buffer'), { code: 'bad_data' });
      const contentType = String(opts.contentType || 'application/octet-stream').slice(0, 120);
      await driver.write(key, buffer, { contentType, overwrite: !!opts.overwrite });
      return { key, size: buffer.length, sha256: sha256(buffer), contentType };
    },
    async get(key) { if (!validKey(key)) throw badKey(key); return driver.read(key); },
    async exists(key) { if (!validKey(key)) throw badKey(key); return driver.has(key); },
    async delete(key) { if (!validKey(key)) throw badKey(key); await driver.remove(key); },
    async list(prefix = '') {
      if (prefix && !/^[a-z0-9][a-z0-9._/-]*$/.test(prefix)) throw badKey(prefix);
      return (await driver.keys(prefix)).sort();
    }
  };
}

function memoryDriver() {
  const m = new Map();
  return {
    name: 'memory',
    async write(key, buffer, { contentType, overwrite }) { if (!overwrite && m.has(key)) throw exists_(key); m.set(key, { buffer: Buffer.from(buffer), contentType }); },
    async read(key) { const e = m.get(key); return e ? { buffer: Buffer.from(e.buffer), contentType: e.contentType, size: e.buffer.length } : null; },
    async has(key) { return m.has(key); },
    async remove(key) { m.delete(key); },
    async keys(prefix) { return [...m.keys()].filter(k => k.startsWith(prefix)); }
  };
}

function localDriver(dir) {
  if (!dir) throw new Error('STORAGE_DRIVER=local 需要 STORAGE_DIR（存放檔案的資料夾）');
  const root = path.resolve(dir);
  const file = key => { const p = path.resolve(root, ...key.split('/')); if (!p.startsWith(root + path.sep)) throw badKey(key); return p; };   // 雙重保險：算出來的路徑一定在資料夾裡面
  return {
    name: 'local',
    async write(key, buffer, { contentType, overwrite }) {
      const p = file(key); await fs.mkdir(path.dirname(p), { recursive: true });
      if (!overwrite && await this.has(key)) throw exists_(key);
      const tmp = p + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';                // 先寫暫存檔再改名：寫到一半當機不會留下殘缺的檔案
      await fs.writeFile(tmp, buffer); await fs.rename(tmp, p);
      await fs.writeFile(p + META, JSON.stringify({ contentType }));
    },
    async read(key) {
      try { const p = file(key), buffer = await fs.readFile(p); let contentType = 'application/octet-stream';
        try { contentType = JSON.parse(await fs.readFile(p + META, 'utf8')).contentType || contentType; } catch (e) { /* 沒有旁檔就用預設 */ }
        return { buffer, contentType, size: buffer.length };
      } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    },
    async has(key) { try { await fs.access(file(key)); return true; } catch (e) { return false; } },
    async remove(key) { const p = file(key); await fs.rm(p, { force: true }); await fs.rm(p + META, { force: true }); },
    async keys(prefix) {
      const out = [];
      const walk = async d => { let ents; try { ents = await fs.readdir(d, { withFileTypes: true }); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
        for (const e of ents) { const p = path.join(d, e.name); if (e.isDirectory()) await walk(p); else if (!e.name.endsWith(META) && !e.name.endsWith('.tmp')) out.push(path.relative(root, p).split(path.sep).join('/')); } };
      await walk(root); return out.filter(k => k.startsWith(prefix));
    }
  };
}

/** Google Cloud Storage。client 預設用官方套件（用 Cloud Run 執行用服務帳號的身分，不需要金鑰檔）；測試時可以傳假的 client 進來。 */
function gcsDriver({ bucket, client }) {
  if (!bucket) throw new Error('STORAGE_DRIVER=gcs 需要 STORAGE_BUCKET（Cloud Storage 儲存桶名稱）');
  const b = (client || new (require('@google-cloud/storage').Storage)()).bucket(bucket);
  const notFound = e => e && (e.code === 404 || e.code === '404');
  return {
    name: 'gcs',
    async write(key, buffer, { contentType, overwrite }) {
      try { await b.file(key).save(buffer, { contentType, resumable: false, ...(overwrite ? {} : { preconditionOpts: { ifGenerationMatch: 0 } }) }); }   // ifGenerationMatch:0 ＝ 只有「還不存在」才寫入
      catch (e) { if (e && (e.code === 412 || e.code === '412')) throw exists_(key); throw e; }
    },
    async read(key) {
      try { const f = b.file(key), [buffer] = await f.download(), [meta] = await f.getMetadata(); return { buffer, contentType: meta.contentType || 'application/octet-stream', size: buffer.length }; }
      catch (e) { if (notFound(e)) return null; throw e; }
    },
    async has(key) { const [x] = await b.file(key).exists(); return !!x; },
    async remove(key) { try { await b.file(key).delete({ ignoreNotFound: true }); } catch (e) { if (!notFound(e)) throw e; } },
    async keys(prefix) { const [files] = await b.getFiles({ prefix }); return files.map(f => f.name); }
  };
}

/** 依設定（loadConfig 的結果）建立儲存層；opts.client 只給測試用 */
function createStorage(cfg = {}, opts = {}) {
  const d = cfg.storageDriver || 'memory';
  if (d === 'memory') return wrap(memoryDriver());
  if (d === 'local') return wrap(localDriver(cfg.storageDir));
  if (d === 'gcs') return wrap(gcsDriver({ bucket: cfg.storageBucket, client: opts.client }));
  throw new Error('STORAGE_DRIVER 只能是 memory、local 或 gcs');
}

module.exports = { createStorage, validKey, sha256 };
