/**
 * 附件：驗證 → 存進檔案儲存層（server/storage.js）→ 在資料庫留一筆紀錄（雜湊值、誰、何時、保存期限）。
 * 目前接在「請假、加班、補打卡」申請單上（POST/GET/DELETE /api/requests/:id/attachments）；
 * 簽核申請單與勞健退公告（owner_kind 已預留 biz_request、insurance_notice）之後用同一組函式。
 *
 * 安全原則：
 *  - 只收白名單內的檔案類型，副檔名與檔案開頭的「魔術位元組」要一致（擋掉把程式改名成 .pdf）。
 *  - 儲存的鍵由系統產生（類別/擁有者/年份/隨機碼.副檔名），不含使用者輸入的檔名，所以不可能路徑穿越。
 *  - 下載一律當附件下載（不在網站內開啟），並加上沙盒標頭；每次下載都寫稽核紀錄（診斷證明是敏感資料）。
 *  - 讀出來時重算雜湊值，和資料庫不一致就拒絕（回 500 並寫稽核），檔案被動過手腳會被發現。
 *  - 「刪除」只是標記：保存與刪除政策（保存多久、何時真的刪）還待確認，所以不立刻抹掉檔案。
 */
const express = require('express');
const crypto = require('crypto');
const { sha256 } = require('./storage');

/* 允許的類型要和網站上傳欄位承諾的一模一樣（ltc-portal.html 的 UP_IMG、UP_DOC；有測試比對），否則網站說可以、後端卻拒絕 */
const TYPES = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', heif: 'image/heif', webp: 'image/webp', gif: 'image/gif', tif: 'image/tiff', tiff: 'image/tiff', bmp: 'image/bmp',
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', txt: 'text/plain'
};
const starts = (b, bytes, at = 0) => b.length >= at + bytes.length && bytes.every((x, i) => b[at + i] === x);
const MAGIC = {
  pdf: b => starts(b, [0x25, 0x50, 0x44, 0x46, 0x2d]), png: b => starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), jpg: b => starts(b, [0xff, 0xd8, 0xff]),
  heic: b => starts(b, [0x66, 0x74, 0x79, 0x70], 4), zip: b => starts(b, [0x50, 0x4b, 0x03, 0x04]), ole: b => starts(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  webp: b => starts(b, [0x52, 0x49, 0x46, 0x46]) && starts(b, [0x57, 0x45, 0x42, 0x50], 8), gif: b => starts(b, [0x47, 0x49, 0x46, 0x38]) && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61,
  tiff: b => starts(b, [0x49, 0x49, 0x2a, 0x00]) || starts(b, [0x4d, 0x4d, 0x00, 0x2a]), bmp: b => starts(b, [0x42, 0x4d]),
  text: b => starts(b, [0xff, 0xfe]) || starts(b, [0xfe, 0xff]) || !b.subarray(0, 8192).includes(0)           // 文字檔沒有固定開頭：只擋含空位元組的二進位檔（UTF-16 有 BOM 才放行）
};
const KIND_OF = { pdf: 'pdf', png: 'png', jpg: 'jpg', jpeg: 'jpg', heic: 'heic', heif: 'heic', webp: 'webp', gif: 'gif', tif: 'tiff', tiff: 'tiff', bmp: 'bmp',
  docx: 'zip', xlsx: 'zip', pptx: 'zip', doc: 'ole', xls: 'ole', ppt: 'ole', csv: 'text', txt: 'text' };
const OWNER_KINDS = ['request', 'biz_request', 'insurance_notice'];
const MAX_PER_OWNER = 5;

/** 使用者給的檔名只用來顯示：去掉路徑、控制字元，最多 120 字；沒有副檔名就不收 */
function cleanName(raw) {
  let n = String(raw || ''); try { n = decodeURIComponent(n); } catch (e) { /* 不是編碼過的就照用 */ }
  n = n.normalize('NFC').replace(/[\u0000-\u001f\u007f/\\]/g, '').replace(/^\.+/, '').trim().slice(-120);
  const m = /\.([A-Za-z0-9]{2,5})$/.exec(n);
  return { name: n, ext: m ? m[1].toLowerCase() : '' };
}

/** 資料庫的 date 欄位用 pg 驅動讀出來是 Date 物件，PGlite 可能是字串：統一成 YYYY-MM-DD */
const dateStr = v => v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
const keepFor = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear() + 5, d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);   // 預設保存五年（同打卡與申請單）

async function saveAttachment({ db, storage, ownerKind, ownerId, user, rawName, buffer, keepUntil, maxBytes = 10 * 1024 * 1024 }) {
  if (!storage) return { code: 503, error: 'storage_not_configured' };
  if (!OWNER_KINDS.includes(ownerKind)) throw new Error('unknown owner_kind');
  const { name, ext } = cleanName(rawName);
  if (!name || !TYPES[ext]) return { code: 415, error: 'file_type_not_allowed', allowed: Object.keys(TYPES) };
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return { code: 400, error: 'empty_file' };
  if (buffer.length > maxBytes) return { code: 413, error: 'file_too_large', maxBytes };
  if (!MAGIC[KIND_OF[ext]](buffer)) return { code: 415, error: 'content_does_not_match_extension' };
  const n = +(await db.query('SELECT count(*)::int AS n FROM attachments WHERE owner_kind=$1 AND owner_id=$2 AND deleted_at IS NULL', [ownerKind, String(ownerId)])).rows[0].n;
  if (n >= MAX_PER_OWNER) return { code: 409, error: 'too_many_attachments', max: MAX_PER_OWNER };
  const slug = String(ownerId).toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!slug) throw new Error('bad owner id');
  const key = `attachments/${ownerKind}/${slug}/${new Date().getUTCFullYear()}/${crypto.randomUUID()}.${ext}`;
  const put = await storage.put(key, buffer, { contentType: TYPES[ext] });
  try {
    const r = await db.query(`INSERT INTO attachments (owner_kind, owner_id, storage_key, filename, content_type, size_bytes, sha256, uploaded_by, keep_until)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, uploaded_at`, [ownerKind, String(ownerId), key, name, put.contentType, put.size, put.sha256, user.id, keepUntil || keepFor()]);
    return { id: +r.rows[0].id, filename: name, size: put.size, contentType: put.contentType, sha256: put.sha256, uploadedAt: r.rows[0].uploaded_at, key };
  } catch (e) { await storage.delete(key).catch(() => {}); throw e; }   // 資料庫沒記到就把剛存的檔案收回來，不留孤兒檔
}

const listAttachments = async (db, ownerKind, ownerId) => (await db.query(
  `SELECT id, filename, content_type AS "contentType", size_bytes AS size, sha256, uploaded_by AS "uploadedBy", uploaded_at AS "uploadedAt", keep_until AS "keepUntil"
   FROM attachments WHERE owner_kind=$1 AND owner_id=$2 AND deleted_at IS NULL ORDER BY id`, [ownerKind, String(ownerId)])).rows.map(r => ({ ...r, id: +r.id }));

/** 取出檔案內容：重算雜湊值，和資料庫記的不一致就不給 */
async function readAttachment({ db, storage, ownerKind, ownerId, id }) {
  if (!storage) return { code: 503, error: 'storage_not_configured' };
  const row = (await db.query('SELECT * FROM attachments WHERE id=$1 AND owner_kind=$2 AND owner_id=$3 AND deleted_at IS NULL', [id, ownerKind, String(ownerId)])).rows[0];
  if (!row) return { code: 404, error: 'not_found' };
  const f = await storage.get(row.storage_key);
  if (!f) return { code: 500, error: 'file_missing_in_storage', row };
  if (sha256(f.buffer) !== row.sha256) return { code: 500, error: 'integrity_check_failed', row };
  return { row, buffer: f.buffer };
}

async function deleteAttachment({ db, user, ownerKind, ownerId, id }) {
  const r = await db.query('UPDATE attachments SET deleted_at=now(), deleted_by=$1 WHERE id=$2 AND owner_kind=$3 AND owner_id=$4 AND deleted_at IS NULL RETURNING id, filename', [user.id, id, ownerKind, String(ownerId)]);
  return r.rows[0] ? { id: +r.rows[0].id, filename: r.rows[0].filename } : { code: 404, error: 'not_found' };
}

/** 請假、加班、補打卡申請單的附件 API（掛在 /api/requests/:id/attachments） */
function requestAttachmentsRouter({ db, audit, storage, maxBytes, canSee, OPEN }) {
  const r = express.Router({ mergeParams: true });
  const h = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);   // Express 4 不會接住非同步錯誤：轉給錯誤處理（回 500），不要讓請求卡住
  const fail = (res, out) => res.status(out.code || 500).json({ error: out.error, ...(out.allowed ? { allowed: out.allowed } : {}), ...(out.maxBytes ? { maxBytes: out.maxBytes } : {}), ...(out.max ? { max: out.max } : {}) });
  const load = async id => (await db.query('SELECT r.*, e.manager_id FROM requests r JOIN employees e ON e.id=r.emp_id WHERE r.id=$1', [id])).rows[0];
  const syncKey = async id => db.query(`UPDATE requests SET attachment_key = (SELECT storage_key FROM attachments WHERE owner_kind='request' AND owner_id=$1 AND deleted_at IS NULL ORDER BY id DESC LIMIT 1) WHERE id=$2`, [String(id), id]);
  const target = row => ({ leave: 'L', overtime: 'OT', punch_fix: 'F' }[row.kind]) + row.id;   // 與申請單編號同樣的寫法（L12、OT3、F7）

  r.get('/', h(async (req, res) => {
    const row = await load(+req.params.id || 0);
    if (!row || !canSee(req.user, row)) return res.status(row ? 403 : 404).json({ error: row ? 'forbidden' : 'not_found' });
    res.json(await listAttachments(db, 'request', row.id));
  }));

  r.post('/', express.raw({ type: () => true, limit: maxBytes }), h(async (req, res) => {
    const row = await load(+req.params.id || 0);
    if (!row) return res.status(404).json({ error: 'not_found' });
    if (row.emp_id !== req.user.id) { await audit(req, 'denied', '/api/requests/' + row.id + '/attachments', { why: 'not_applicant' }); return res.status(403).json({ error: 'forbidden' }); }
    if (!OPEN.includes(row.status)) return res.status(409).json({ error: 'not_open' });
    const out = await saveAttachment({ db, storage, ownerKind: 'request', ownerId: row.id, user: req.user, rawName: req.headers['x-filename'], buffer: req.body, keepUntil: dateStr(row.keep_until), maxBytes });
    if (out.error) return fail(res, out);
    await syncKey(row.id);
    await audit(req, 'attachment_upload', target(row), { file: out.filename, size: out.size, sha256: out.sha256 });
    const { key, ...pub } = out; res.status(201).json(pub);
  }));

  r.get('/:aid', h(async (req, res) => {
    const row = await load(+req.params.id || 0);
    if (!row || !canSee(req.user, row)) return res.status(row ? 403 : 404).json({ error: row ? 'forbidden' : 'not_found' });
    const out = await readAttachment({ db, storage, ownerKind: 'request', ownerId: row.id, id: +req.params.aid || 0 });
    if (out.error) { if (out.row) await audit(req, 'attachment_error', target(row), { id: +out.row.id, why: out.error }); return fail(res, out); }
    await audit(req, 'attachment_download', target(row), { id: +out.row.id, file: out.row.filename });
    res.set({ 'Content-Type': out.row.content_type, 'Content-Length': String(out.buffer.length), 'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Disposition': `attachment; filename="attachment.${out.row.filename.split('.').pop().replace(/[^A-Za-z0-9]/g, '') || 'bin'}"; filename*=UTF-8''${encodeURIComponent(out.row.filename)}` });
    res.send(out.buffer);
  }));

  r.delete('/:aid', h(async (req, res) => {
    const row = await load(+req.params.id || 0);
    if (!row) return res.status(404).json({ error: 'not_found' });
    if (row.emp_id !== req.user.id) { await audit(req, 'denied', '/api/requests/' + row.id + '/attachments', { why: 'not_applicant' }); return res.status(403).json({ error: 'forbidden' }); }
    if (!OPEN.includes(row.status)) return res.status(409).json({ error: 'not_open' });
    const out = await deleteAttachment({ db, user: req.user, ownerKind: 'request', ownerId: row.id, id: +req.params.aid || 0 });
    if (out.error) return fail(res, out);
    await syncKey(row.id);
    await audit(req, 'attachment_delete', target(row), { id: out.id, file: out.filename });
    res.json({ ok: true });
  }));
  return r;
}

module.exports = { saveAttachment, readAttachment, deleteAttachment, listAttachments, requestAttachmentsRouter, TYPES, cleanName, MAX_PER_OWNER };
