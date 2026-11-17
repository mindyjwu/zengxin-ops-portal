/**
 * 牛津居家時薪制計薪 API。
 * 權限：看＝薪資權限（salary）且「薪資試算」頁不是「不可」；改規則、匯入、改輸入＝薪資權限且「薪資試算」頁可編輯（目前只有人資）；
 *      員工的「較早到職級距」勾選＝可編輯員工資料（editEmp）且有薪資權限。所有查看與變更都寫稽核紀錄。
 */
const express = require('express');
const { can, canViewPage, pageCode } = require('./permissions');
const E = require('./hourly-engine');

const PAGE = 'pay.run', MONTH = /^\d{4}-\d{2}$/;
const KIND = 'oxford_hourly';
const int = (v, max = 1e7) => { const n = Math.round(+v); return Number.isFinite(n) && n >= 0 && n <= max ? n : null; };
const money = (v, max = 1e8) => { const n = Math.round(+v); return Number.isFinite(n) && n >= 0 && n <= max ? n : null; };
const text = (v, max) => String(v ?? '').trim().slice(0, max);
const DB_MONEY = ['rural', 'intro', 'open', 'other', 'short', 'labor', 'health', 'pension', 'otherDed', 'aaFixed'];
const DB_INT = ['regMin', 'trWd', 'trHol', 'trNh', 'aa05', 'aa06', 'aa11'];

/** 檢查並整理瀏覽器送來的一列；回傳 { row } 或 { error } */
function cleanRow(x) {
  if (!x || typeof x !== 'object') return { error: 'bad_row' };
  const row = E.blankRow(); row.empNo = text(x.empNo, 20); row.name = text(x.name, 40); row.early = x.early === true;
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(row.empNo)) return { error: 'bad_emp_no', why: row.empNo };
  for (const k of DB_INT) { const v = int(x[k] ?? 0); if (v == null) return { error: 'bad_value', why: k, empNo: row.empNo }; row[k] = v; }
  for (const k of DB_MONEY) { const v = money(x[k] ?? 0); if (v == null) return { error: 'bad_value', why: k, empNo: row.empNo }; row[k] = v; }
  if (!Array.isArray(x.ot) || x.ot.length !== 14) return { error: 'bad_ot', empNo: row.empNo };
  row.ot = x.ot.map(v => int(v ?? 0)); if (row.ot.some(v => v == null)) return { error: 'bad_ot', empNo: row.empNo };
  row.refRate = x.refRate == null ? null : int(x.refRate, 10000);
  return { row };
}
const fromDb = r => ({ empNo: r.emp_no, name: r.name, early: r.early, regMin: r.reg_min, trWd: r.tr_wd, trHol: r.tr_hol, trNh: r.tr_nh, ot: r.ot, aa05: r.aa05, aa06: r.aa06, aa11: r.aa11,
  aaFixed: +r.aa_fixed, rural: +r.rural, intro: +r.intro, open: +r.open, other: +r.other, short: +r.short, labor: +r.labor, health: +r.health, pension: +r.pension, otherDed: +r.other_ded, refRate: r.ref_rate });

function hourlyRouter({ db, audit }) {
  const r = express.Router();
  const deny = (req, res, need) => audit(req, 'denied', req.originalUrl, { need }).then(() => res.status(403).json({ error: 'forbidden' }));
  const canView = u => can(u.role, 'salary') && canViewPage(u.role, PAGE);
  const canEdit = u => can(u.role, 'salary') && pageCode(u.role, PAGE) === '可編輯';
  const view = (req, res, next) => canView(req.user) ? next() : deny(req, res, PAGE);
  const edit = (req, res, next) => canEdit(req.user) ? next() : deny(req, res, PAGE + ':edit');

  /** 某個月適用的規則：生效月份 ≤ 該月的最新一版；沒有就用預設值 */
  async function rulesFor(month, q = (s, p) => db.query(s, p)) {
    const v = (await q('SELECT id, effective_from, config FROM pay_rule_versions WHERE kind=$1 AND effective_from <= $2 ORDER BY effective_from DESC, id DESC LIMIT 1', [KIND, month])).rows[0];
    return v ? { id: +v.id, effectiveFrom: v.effective_from, config: v.config } : { id: null, effectiveFrom: null, config: E.DEFAULT_CONFIG };
  }

  r.get('/rules', view, async (req, res) => {
    const month = String(req.query.month || '');
    if (!MONTH.test(month)) return res.status(400).json({ error: 'bad_month' });
    const versions = (await db.query('SELECT v.id, v.effective_from, v.created_at, e.name AS created_by FROM pay_rule_versions v JOIN employees e ON e.id=v.created_by WHERE v.kind=$1 ORDER BY v.effective_from DESC, v.id DESC LIMIT 30', [KIND])).rows;
    res.json({ ...(await rulesFor(month)), versions, editable: canEdit(req.user) });
  });

  /** 改規則＝新增一個版本（保留歷史），從指定月份起適用 */
  r.put('/rules', edit, async (req, res) => {
    const b = req.body || {}, month = String(b.effectiveFrom || '');
    if (!MONTH.test(month)) return res.status(400).json({ error: 'bad_month' });
    const v = E.validateConfig(b.config); if (v.error) return res.status(400).json(v);
    const id = (await db.query('INSERT INTO pay_rule_versions (kind, effective_from, config, created_by) VALUES ($1,$2,$3,$4) RETURNING id', [KIND, month, JSON.stringify(v.config), req.user.id])).rows[0].id;
    await audit(req, 'pay_rules_change', String(id), { effectiveFrom: month });
    res.status(201).json({ id: +id, effectiveFrom: month, config: v.config });
  });

  r.get('/months', view, async (req, res) => res.json((await db.query('SELECT month, count(*)::int AS people, max(updated_at) AS updated_at FROM pay_hourly_rows GROUP BY month ORDER BY month DESC')).rows));

  /** 匯入或更新某個月的輸入。mode=replace：整個月換掉；mode=upsert（預設）：只更新送來的人 */
  r.post('/rows', edit, express.json({ limit: '2mb' }), async (req, res) => {
    const b = req.body || {}, month = String(b.month || ''), list = b.rows;
    if (!MONTH.test(month)) return res.status(400).json({ error: 'bad_month' });
    if (!Array.isArray(list) || !list.length || list.length > 600) return res.status(400).json({ error: 'bad_rows' });
    const rows = [], seen = new Set();
    for (const x of list) { const c = cleanRow(x); if (c.error) return res.status(400).json(c); if (seen.has(c.row.empNo)) return res.status(400).json({ error: 'duplicate_emp_no', empNo: c.row.empNo }); seen.add(c.row.empNo); rows.push(c.row); }
    const replace = b.mode === 'replace';
    await db.tx(async q => {
      if (replace) await q('DELETE FROM pay_hourly_rows WHERE month=$1', [month]);
      for (const w of rows) await q(`INSERT INTO pay_hourly_rows (month, emp_no, name, early, reg_min, tr_wd, tr_hol, tr_nh, ot, aa05, aa06, aa11, aa_fixed, rural, intro, open, other, short, labor, health, pension, other_ded, ref_rate, updated_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
          ON CONFLICT (month, emp_no) DO UPDATE SET name=EXCLUDED.name, early=EXCLUDED.early, reg_min=EXCLUDED.reg_min, tr_wd=EXCLUDED.tr_wd, tr_hol=EXCLUDED.tr_hol, tr_nh=EXCLUDED.tr_nh, ot=EXCLUDED.ot, aa05=EXCLUDED.aa05, aa06=EXCLUDED.aa06, aa11=EXCLUDED.aa11,
            aa_fixed=EXCLUDED.aa_fixed, rural=EXCLUDED.rural, intro=EXCLUDED.intro, open=EXCLUDED.open, other=EXCLUDED.other, short=EXCLUDED.short, labor=EXCLUDED.labor, health=EXCLUDED.health, pension=EXCLUDED.pension, other_ded=EXCLUDED.other_ded, ref_rate=EXCLUDED.ref_rate, updated_by=EXCLUDED.updated_by, updated_at=now()`,
        [month, w.empNo, w.name, w.early, w.regMin, w.trWd, w.trHol, w.trNh, w.ot, w.aa05, w.aa06, w.aa11, w.aaFixed, w.rural, w.intro, w.open, w.other, w.short, w.labor, w.health, w.pension, w.otherDed, w.refRate, req.user.id]);
    });
    await audit(req, 'pay_rows_import', month, { people: rows.length, mode: replace ? 'replace' : 'upsert' });
    res.status(201).json({ month, people: rows.length });
  });

  /** 代扣表：只更新已經在這個月名單裡的人；名單裡沒有的工號回報給網頁 */
  r.put('/deductions', edit, express.json({ limit: '1mb' }), async (req, res) => {
    const b = req.body || {}, month = String(b.month || ''), list = b.rows;
    if (!MONTH.test(month)) return res.status(400).json({ error: 'bad_month' });
    if (!Array.isArray(list) || !list.length || list.length > 600) return res.status(400).json({ error: 'bad_rows' });
    const updated = [], missing = [];
    for (const x of list) {
      const empNo = text(x && x.empNo, 20), v = ['labor', 'health', 'pension', 'otherDed'].map(k => money(x[k] ?? 0));
      if (!/^[A-Za-z0-9_-]{1,20}$/.test(empNo) || v.some(n => n == null)) return res.status(400).json({ error: 'bad_row', why: empNo });
      const n = (await db.query('UPDATE pay_hourly_rows SET labor=$3, health=$4, pension=$5, other_ded=$6, updated_by=$7, updated_at=now() WHERE month=$1 AND emp_no=$2', [month, empNo, ...v, req.user.id])).rowCount;
      (n ? updated : missing).push(empNo);
    }
    await audit(req, 'pay_deductions_import', month, { updated: updated.length, missing: missing.length });
    res.json({ updated: updated.length, missing });
  });

  r.delete('/rows/:month/:empNo', edit, async (req, res) => {
    const n = (await db.query('DELETE FROM pay_hourly_rows WHERE month=$1 AND emp_no=$2', [req.params.month, req.params.empNo])).rowCount;
    if (!n) return res.status(404).json({ error: 'not_found' });
    await audit(req, 'pay_row_delete', req.params.month, { empNo: req.params.empNo });
    res.json({ ok: true });
  });

  /** 員工資料的「較早到職級距」勾選（只用在牛津時薪制居服員） */
  r.put('/early/:id', async (req, res) => {
    if (!(can(req.user.role, 'editEmp') && can(req.user.role, 'salary'))) return deny(req, res, 'editEmp+salary');
    const early = (req.body || {}).early === true;
    const n = (await db.query('UPDATE employees SET pay_early_tier=$2 WHERE id=$1', [req.params.id, early])).rowCount;
    if (!n) return res.status(404).json({ error: 'not_found' });
    await audit(req, 'pay_early_tier', req.params.id, { early });
    res.json({ id: req.params.id, early });
  });

  /** 某個月的計算結果：用該月適用的規則版本；名冊裡有這個工號就以員工資料的勾選為準 */
  r.get('/results', view, async (req, res) => {
    const month = String(req.query.month || '');
    if (!MONTH.test(month)) return res.status(400).json({ error: 'bad_month' });
    const rows = (await db.query('SELECT * FROM pay_hourly_rows WHERE month=$1 ORDER BY emp_no', [month])).rows;
    if (!rows.length) return res.status(404).json({ error: 'no_data_for_month' });
    const rules = await rulesFor(month), emp = new Map((await db.query('SELECT id, pay_early_tier FROM employees WHERE id = ANY($1::text[])', [rows.map(x => x.emp_no)])).rows.map(e => [e.id, e.pay_early_tier]));
    const people = rows.map(w => { const row = fromDb(w), early = emp.has(w.emp_no) ? emp.get(w.emp_no) : w.early; return { ...row, onRoster: emp.has(w.emp_no), result: E.pay(rules.config, row, early) }; });
    const tot = people.reduce((a, p) => ({ A: a.A + p.result.A, B: a.B + p.result.B, C: a.C + p.result.C, net: a.net + p.result.net }), { A: 0, B: 0, C: 0, net: 0 });
    await audit(req, 'pay_hourly_view', month, { people: people.length });
    res.json({ month, rules: { id: rules.id, effectiveFrom: rules.effectiveFrom }, config: rules.config, people, totals: tot, editable: canEdit(req.user) });
  });

  return r;
}

module.exports = { hourlyRouter, cleanRow };
