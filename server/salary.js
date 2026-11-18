/**
 * 月薪制的薪資資料 API：每位同仁的底薪與專業加給（有生效日，只能新增、更正時新增一筆並寫原因）。
 * 權限同其他薪資功能：看＝薪資權限＋「薪資試算」頁不是「不可」；新增、匯入＝薪資權限＋該頁可編輯（目前只有人資）。
 * 所有查看與變更都寫稽核紀錄；稽核紀錄只記誰、何時、哪個人與原因，不記金額（金額在薪資資料的歷史裡）。
 */
const express = require('express');
const { can, canViewPage, pageCode } = require('./permissions');
const S = require('./salary-engine');

const PAGE = 'pay.run', EMP = /^[A-Za-z0-9_-]{1,20}$/;
const KINDS = ['hire', 'raise', 'correction'];
const amount = v => { const n = Math.round(+v); return v !== '' && v != null && Number.isFinite(+v) && n >= 0 && n <= 1e7 ? n : null; };
const text = (v, max) => String(v ?? '').trim().slice(0, max);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
const ymd = d => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
const entryOf = r => ({ id: +r.id, effectiveFrom: ymd(r.effective_from), base: +r.base_salary, allowance: +r.professional_allowance });
const warnOf = (e, hiredAt) => { const w = []; if (S.total(e) < S.MIN_MONTHLY) w.push('below_minimum'); if (hiredAt && e.effectiveFrom < ymd(hiredAt)) w.push('before_hire'); return w; };

function salaryRouter({ db, audit }) {
  const r = express.Router();
  const deny = (req, res, need) => audit(req, 'denied', req.originalUrl, { need }).then(() => res.status(403).json({ error: 'forbidden' }));
  const canView = u => can(u.role, 'salary') && canViewPage(u.role, PAGE), canEdit = u => can(u.role, 'salary') && pageCode(u.role, PAGE) === '可編輯';
  const view = (req, res, next) => canView(req.user) ? next() : deny(req, res, PAGE);
  const edit = (req, res, next) => canEdit(req.user) ? next() : deny(req, res, PAGE + ':edit');

  /** 目前（某一天）每位在職同仁適用的底薪與專業加給；還沒登錄的也列出來（hasEntry=false） */
  r.get('/', view, async (req, res) => {
    const asOf = req.query.asOf ? String(req.query.asOf) : today(); if (!S.isValidDate(asOf)) return res.status(400).json({ error: 'bad_date' });
    const emps = (await db.query("SELECT e.id, e.name, e.role, e.hired_at, u.name AS unit FROM employees e LEFT JOIN units u ON u.id=e.unit_id WHERE e.status='active' ORDER BY e.id")).rows;
    const all = (await db.query('SELECT id, emp_no, effective_from, base_salary, professional_allowance FROM pay_salary_entries')).rows, by = new Map();
    for (const x of all) by.set(x.emp_no, [...(by.get(x.emp_no) || []), entryOf(x)]);
    const people = emps.map(e => { const cur = S.salaryOn(by.get(e.id) || [], asOf);
      return { empNo: e.id, name: e.name, role: e.role, unit: e.unit, hiredAt: e.hired_at ? ymd(e.hired_at) : null, hasEntry: !!cur, effectiveFrom: cur ? cur.effectiveFrom : null, base: cur ? cur.base : null, allowance: cur ? cur.allowance : null, total: cur ? S.total(cur) : null, warnings: cur ? warnOf(cur, e.hired_at) : [] }; });
    await audit(req, 'pay_salary_list', asOf, { people: people.length });
    res.json({ asOf, people, missing: people.filter(p => !p.hasEntry).length, editable: canEdit(req.user) });
  });

  r.get('/history/:empNo', view, async (req, res) => {
    const emp = (await db.query('SELECT id, name, hired_at FROM employees WHERE id=$1', [req.params.empNo])).rows[0]; if (!emp) return res.status(404).json({ error: 'not_found' });
    const rows = (await db.query('SELECT s.*, p.name AS created_by_name FROM pay_salary_entries s JOIN employees p ON p.id=s.created_by WHERE s.emp_no=$1 ORDER BY s.effective_from, s.id', [emp.id])).rows;
    const entries = rows.map(x => ({ ...entryOf(x), total: +x.base_salary + +x.professional_allowance, kind: x.kind, correctsId: x.corrects_id ? +x.corrects_id : null, reason: x.reason, createdBy: x.created_by_name, createdAt: x.created_at }));
    const eff = entries.map(({ id, effectiveFrom, base, allowance }) => ({ id, effectiveFrom, base, allowance }));
    await audit(req, 'pay_salary_history', emp.id, { entries: entries.length });
    res.json({ empNo: emp.id, name: emp.name, hiredAt: emp.hired_at ? ymd(emp.hired_at) : null, entries, current: S.salaryOn(eff, today()), editable: canEdit(req.user) });
  });

  /** 某個月內的分段（月中調薪按天數）：給之後月薪制算薪用，這裡先提供查詢 */
  r.get('/segments/:empNo', view, async (req, res) => {
    const month = String(req.query.month || ''); if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return res.status(400).json({ error: 'bad_month' });
    const rows = (await db.query('SELECT id, effective_from, base_salary, professional_allowance FROM pay_salary_entries WHERE emp_no=$1', [req.params.empNo])).rows.map(entryOf);
    res.json({ empNo: req.params.empNo, month, segments: S.segmentsForMonth(rows, month) });
  });

  /** 新增一筆：到職定薪（hire）、調薪（raise）、更正（correction：要指出更正哪一筆，生效日要一樣，原因必填） */
  r.post('/entries', edit, async (req, res) => {
    const b = req.body || {}, empNo = text(b.empNo, 20), kind = String(b.kind || ''), reason = text(b.reason, 300), date = String(b.effectiveFrom || '');
    if (!EMP.test(empNo)) return res.status(400).json({ error: 'bad_emp_no' });
    if (!KINDS.includes(kind)) return res.status(400).json({ error: 'bad_kind' });
    if (!S.isValidDate(date)) return res.status(400).json({ error: 'bad_date' });
    const base = amount(b.baseSalary), allowance = amount(b.professionalAllowance ?? 0); if (base == null || allowance == null) return res.status(400).json({ error: 'bad_amount' });
    if (reason.length < 2) return res.status(400).json({ error: 'reason_required' });
    const emp = (await db.query('SELECT id, hired_at FROM employees WHERE id=$1', [empNo])).rows[0]; if (!emp) return res.status(404).json({ error: 'not_found' });
    let correctsId = null;
    if (kind === 'correction') {
      const target = (await db.query('SELECT id, emp_no, effective_from FROM pay_salary_entries WHERE id=$1', [+b.correctsId || 0])).rows[0];
      if (!target || target.emp_no !== empNo) return res.status(400).json({ error: 'corrects_required' });
      if (ymd(target.effective_from) !== date) return res.status(400).json({ error: 'correction_date_mismatch', effectiveFrom: ymd(target.effective_from) });
      correctsId = +target.id;
    } else if (b.correctsId != null) return res.status(400).json({ error: 'corrects_only_for_correction' });
    const id = +(await db.query('INSERT INTO pay_salary_entries (emp_no, effective_from, base_salary, professional_allowance, kind, corrects_id, reason, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [empNo, date, base, allowance, kind, correctsId, reason, req.user.id])).rows[0].id;
    await audit(req, 'pay_salary_add', empNo, { id, kind, effectiveFrom: date, reason });
    res.status(201).json({ id, warnings: warnOf({ effectiveFrom: date, base, allowance }, emp.hired_at) });
  });

  /** 範本匯入：整份檔案一起成功或一起失敗；和該日已適用的金額一樣的列略過（不留雜訊）；員編不在名冊就整份退回 */
  r.post('/import', edit, express.json({ limit: '1mb' }), async (req, res) => {
    const b = req.body || {}, list = b.rows, reason = text(b.reason, 300);
    if (reason.length < 2) return res.status(400).json({ error: 'reason_required' });
    if (!Array.isArray(list) || !list.length || list.length > 600) return res.status(400).json({ error: 'bad_rows' });
    const rows = [], seen = new Set();
    for (const x of list) {
      const empNo = text(x && x.empNo, 20), date = String((x && x.effectiveFrom) || ''), base = amount(x && x.baseSalary), allowance = amount((x && x.professionalAllowance) ?? 0);
      if (!EMP.test(empNo)) return res.status(400).json({ error: 'bad_emp_no', why: empNo });
      if (!S.isValidDate(date)) return res.status(400).json({ error: 'bad_date', empNo, why: date });
      if (base == null || allowance == null) return res.status(400).json({ error: 'bad_amount', empNo });
      if (seen.has(empNo + date)) return res.status(400).json({ error: 'duplicate_row', empNo, effectiveFrom: date }); seen.add(empNo + date);
      rows.push({ empNo, date, base, allowance });
    }
    const emps = new Map((await db.query('SELECT id, hired_at FROM employees WHERE id = ANY($1::text[])', [[...new Set(rows.map(x => x.empNo))]])).rows.map(e => [e.id, e]));
    const unknown = [...new Set(rows.filter(x => !emps.has(x.empNo)).map(x => x.empNo))]; if (unknown.length) return res.status(400).json({ error: 'unknown_employees', empNos: unknown });
    const existing = (await db.query('SELECT id, emp_no, effective_from, base_salary, professional_allowance FROM pay_salary_entries WHERE emp_no = ANY($1::text[])', [[...emps.keys()]])).rows, by = new Map();
    for (const x of existing) by.set(x.emp_no, [...(by.get(x.emp_no) || []), entryOf(x)]);
    let added = 0, unchanged = 0; const warnings = [];
    await db.tx(async q => {
      for (const x of rows) {
        const cur = S.salaryOn(by.get(x.empNo) || [], x.date);
        if (cur && cur.base === x.base && cur.allowance === x.allowance) { unchanged++; continue; }
        await q('INSERT INTO pay_salary_entries (emp_no, effective_from, base_salary, professional_allowance, kind, reason, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)', [x.empNo, x.date, x.base, x.allowance, 'import', reason, req.user.id]); added++;
        const w = warnOf({ effectiveFrom: x.date, base: x.base, allowance: x.allowance }, emps.get(x.empNo).hired_at); if (w.length) warnings.push({ empNo: x.empNo, codes: w });
      }
    });
    await audit(req, 'pay_salary_import', reason, { added, unchanged, rows: rows.length });
    res.status(201).json({ added, unchanged, warnings });
  });

  return r;
}

module.exports = { salaryRouter };
