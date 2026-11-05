/**
 * 員工與角色管理 API。
 * 規則（10/20–10/28 會議）：
 *   - 人資（editEmp）可以新增、修改員工基本資料與停用，但不能改角色
 *   - 改角色要有 perms 權限（管理者、系統管理員、老闆），而且不能改自己的角色（防止自己升權或鎖死自己）
 *   - 員編 ＝ 單位代號 3 碼 + 流水號 4 碼（J020001），由伺服器自動產生
 *   - 所有動作都寫進稽核紀錄
 */
const express = require('express');
const { can, roleKeys } = require('./permissions');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Z]\d{2}\d{4}$/;

/** 簡單的 CSV 解析（支援引號、逗號與換行在引號內、BOM） */
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}

const HEADERS = { id: ['員工編號', '工號', 'id'], name: ['姓名', 'name'], email: ['email', '電子郵件', '信箱'], unit: ['單位代號', '公司代號', 'unit'], role: ['角色', 'role'], hired: ['到職日', 'hired_at'], old: ['舊員編', 'old_no'] };

async function nextId(q, unit, taken = new Set()) {
  const r = await q("SELECT id FROM employees WHERE id LIKE $1", [unit + '%']);
  let max = 0;
  for (const x of [...r.rows.map(a => a.id), ...taken]) { const m = String(x).match(new RegExp('^' + unit + '(\\d{4})$')); if (m) max = Math.max(max, +m[1]); }
  return unit + String(max + 1).padStart(4, '0');
}

function employeesRouter({ db, audit }) {
  const r = express.Router();
  const needEdit = (req, res, next) => can(req.user.role, 'editEmp') ? next() : audit(req, 'denied', req.originalUrl, { need: 'editEmp' }).then(() => res.status(403).json({ error: 'forbidden' }));
  const needList = (req, res, next) => can(req.user.role, 'mgmt') && can(req.user.role, 'exportAll') ? next() : audit(req, 'denied', req.originalUrl, { need: 'list' }).then(() => res.status(403).json({ error: 'forbidden' }));

  r.get('/units', async (req, res) => res.json((await db.query('SELECT id, name FROM units ORDER BY id')).rows));
  r.get('/roles', (req, res) => res.json(roleKeys));

  r.get('/', needList, async (req, res) =>
    res.json((await db.query('SELECT id, name, email, unit_id, role, status, hired_at, old_no FROM employees ORDER BY id')).rows));

  r.post('/', needEdit, async (req, res) => {
    const b = req.body || {}, name = String(b.name || '').trim(), email = String(b.email || '').trim(), unit = String(b.unitId || '').trim();
    if (!name || !EMAIL.test(email)) return res.status(400).json({ error: 'name_and_valid_email_required' });
    if (!(await db.query('SELECT 1 FROM units WHERE id=$1', [unit])).rows[0]) return res.status(400).json({ error: 'unknown_unit' });
    if (b.hiredAt && !DATE.test(b.hiredAt)) return res.status(400).json({ error: 'bad_date' });
    const role = b.role ? String(b.role) : 'employee';
    if (role !== 'employee') {
      if (!can(req.user.role, 'perms')) return res.status(403).json({ error: 'role_needs_permission_admin' });
      if (!roleKeys.includes(role)) return res.status(400).json({ error: 'unknown_role' });
    }
    try {
      const out = await db.tx(async q => {
        const id = await nextId(q, unit);
        await q('INSERT INTO employees (id,name,email,unit_id,role,hired_at,old_no) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, name, email, unit, role, b.hiredAt || null, b.oldNo || null]);
        return id;
      });
      await audit(req, 'employee_create', out, { role, unit });
      res.status(201).json({ id: out });
    } catch (e) { if (/unique|duplicate/i.test(e.message)) return res.status(409).json({ error: 'email_already_used' }); throw e; }
  });

  r.patch('/:id', needEdit, async (req, res) => {
    const id = req.params.id, b = req.body || {};
    const cur = (await db.query('SELECT id, role, status FROM employees WHERE id=$1', [id])).rows[0];
    if (!cur) return res.status(404).json({ error: 'not_found' });
    const sets = [], vals = [], changed = {};
    const set = (col, v) => { vals.push(v); sets.push(`${col}=$${vals.length}`); changed[col] = v; };
    if (b.name !== undefined) { if (!String(b.name).trim()) return res.status(400).json({ error: 'bad_name' }); set('name', String(b.name).trim()); }
    if (b.email !== undefined) { if (!EMAIL.test(b.email)) return res.status(400).json({ error: 'bad_email' }); set('email', b.email); }
    if (b.hiredAt !== undefined) { if (b.hiredAt && !DATE.test(b.hiredAt)) return res.status(400).json({ error: 'bad_date' }); set('hired_at', b.hiredAt || null); }
    if (b.oldNo !== undefined) set('old_no', b.oldNo || null);
    if (b.status !== undefined) {
      if (!['active', 'inactive'].includes(b.status)) return res.status(400).json({ error: 'bad_status' });
      if (id === req.user.id && b.status !== 'active') return res.status(400).json({ error: 'cannot_deactivate_self' });
      set('status', b.status);
    }
    if (b.role !== undefined) {
      if (!can(req.user.role, 'perms')) { await audit(req, 'denied', '/api/employees/' + id, { need: 'perms' }); return res.status(403).json({ error: 'role_needs_permission_admin' }); }
      if (!roleKeys.includes(b.role)) return res.status(400).json({ error: 'unknown_role' });
      if (id === req.user.id) return res.status(400).json({ error: 'cannot_change_own_role' });
      set('role', b.role);
    }
    if (!sets.length) return res.status(400).json({ error: 'nothing_to_change' });
    vals.push(id);
    try { await db.query(`UPDATE employees SET ${sets.join(', ')} WHERE id=$${vals.length}`, vals); }
    catch (e) { if (/unique|duplicate/i.test(e.message)) return res.status(409).json({ error: 'email_already_used' }); throw e; }
    await audit(req, 'employee_update', id, { changed: Object.keys(changed), from: { role: cur.role, status: cur.status } });
    res.json({ ok: true });
  });

  /* 批次匯入：先 dryRun 預覽（不寫入），確認沒問題再 commit；整批在一個交易裡，失敗就全部不寫 */
  r.post('/import', needEdit, async (req, res) => {
    const rows = parseCsv((req.body || {}).csv), commit = (req.body || {}).commit === true;
    if (rows.length < 2) return res.status(400).json({ error: 'no_rows' });
    const head = rows[0].map(h => h.trim().toLowerCase()), col = {};
    for (const [k, names] of Object.entries(HEADERS)) col[k] = head.findIndex(h => names.map(x => x.toLowerCase()).includes(h));
    if (col.name < 0 || col.email < 0 || col.unit < 0) return res.status(400).json({ error: 'missing_columns', need: ['姓名', 'email', '單位代號'] });
    const units = new Set((await db.query('SELECT id FROM units')).rows.map(x => x.id));
    const existing = new Map((await db.query('SELECT id, lower(email) AS email FROM employees')).rows.map(x => [x.email, x.id]));
    const canRole = can(req.user.role, 'perms'), seenEmail = new Set(), taken = new Set(), out = [];
    for (let i = 1; i < rows.length; i++) {
      const x = rows[i], g = k => col[k] >= 0 ? String(x[col[k]] ?? '').trim() : '';
      const rec = { line: i + 1, id: g('id').toUpperCase(), name: g('name'), email: g('email'), unitId: g('unit').toUpperCase(), role: g('role') || 'employee', hiredAt: g('hired'), oldNo: g('old'), errors: [] };
      if (!rec.name) rec.errors.push('姓名空白');
      if (!EMAIL.test(rec.email)) rec.errors.push('email 格式不對');
      if (!units.has(rec.unitId)) rec.errors.push('單位代號不存在');
      if (rec.hiredAt && !DATE.test(rec.hiredAt)) rec.errors.push('到職日格式要是 YYYY-MM-DD');
      if (rec.role !== 'employee' && !canRole) rec.errors.push('你沒有指定角色的權限（只有管理者、系統管理員、老闆可以）');
      else if (!roleKeys.includes(rec.role)) rec.errors.push('角色不存在');
      if (rec.id && !ID.test(rec.id)) rec.errors.push('員編格式要是 1 個英文字母＋2 碼＋4 碼流水號');
      const em = rec.email.toLowerCase();
      if (seenEmail.has(em)) rec.errors.push('檔案裡 email 重複'); seenEmail.add(em);
      const exId = existing.get(em);
      rec.action = rec.errors.length ? 'error' : exId ? 'update' : 'new';
      if (exId) { if (rec.id && rec.id !== exId) rec.errors.push(`這個 email 已屬於 ${exId}`), rec.action = 'error'; rec.id = exId; }
      out.push(rec);
    }
    const counts = { new: out.filter(o => o.action === 'new').length, update: out.filter(o => o.action === 'update').length, error: out.filter(o => o.action === 'error').length };
    if (!commit) return res.json({ dryRun: true, counts, rows: out.map(o => ({ line: o.line, action: o.action, id: o.id, name: o.name, email: o.email, unitId: o.unitId, role: o.role, errors: o.errors })) });
    if (counts.error) return res.status(422).json({ error: 'has_errors', counts, rows: out.filter(o => o.action === 'error').map(o => ({ line: o.line, errors: o.errors })) });
    await db.tx(async q => {
      for (const o of out) {
        if (o.action === 'update') await q('UPDATE employees SET name=$1, unit_id=$2, hired_at=COALESCE($3,hired_at), old_no=COALESCE($4,old_no)' + (canRole ? ', role=$6' : '') + ' WHERE id=$5', canRole ? [o.name, o.unitId, o.hiredAt || null, o.oldNo || null, o.id, o.role] : [o.name, o.unitId, o.hiredAt || null, o.oldNo || null, o.id]);
        else {
          const id = o.id && !taken.has(o.id) ? o.id : await nextId(q, o.unitId, taken); taken.add(id);
          await q('INSERT INTO employees (id,name,email,unit_id,role,hired_at,old_no) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, o.name, o.email, o.unitId, o.role, o.hiredAt || null, o.oldNo || null]);
        }
      }
    });
    await audit(req, 'employees_import', null, counts);
    res.json({ committed: true, counts });
  });

  return r;
}

module.exports = { employeesRouter, parseCsv, nextId };
