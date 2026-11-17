/**
 * 拆帳制計薪 API（居服員）：服務次數與金額來自仁寶匯入（svc_* 資料表），每月輸入（方案、交通津貼、加扣項、代扣）由人資匯入，
 * 規則（給付表、業績獎金區間、偏鄉津貼、加項或扣項）有生效月份的版本；發布並鎖定、退回、薪資單、員工看自己的，與時薪制共用 pay-months.js。
 * 權限同時薪制：看＝薪資權限＋「薪資試算」頁不是「不可」；改＝薪資權限＋該頁可編輯（目前只有人資）。
 */
const express = require('express');
const { can, canViewPage, pageCode } = require('./permissions');
const S = require('./split-engine');
const { buildSplitSlip } = require('./payslip');
const { payMonthsKit } = require('./pay-months');
const { resolveWorkers } = require('./pay-svc');

const PAGE = 'pay.run', MONTH = /^\d{4}-\d{2}$/, KIND = 'split';
const text = (v, max) => String(v ?? '').trim().slice(0, max);
const money = (v, max = 1e8) => { const n = Math.round(+v); return Number.isFinite(n) && n >= 0 && n <= max ? n : null; };
const EXTRA_KEYS = new Set(S.EXTRAS.map(e => e.k)), DED_KEYS = ['labor', 'health', 'pension', 'otherDed'];

/** 檢查並整理瀏覽器送來的一列 */
function cleanRow(x) {
  if (!x || typeof x !== 'object') return { error: 'bad_row' };
  const empNo = text(x.empNo, 20), name = text(x.name, 40), plan = x.plan === 'A' || x.plan === 'B' ? x.plan : null, extras = {};
  if (!/^[A-Za-z0-9_-]{1,20}$/.test(empNo)) return { error: 'bad_emp_no', why: empNo };
  if (x.plan != null && x.plan !== '' && !plan) return { error: 'bad_plan', empNo };
  for (const [k, v] of Object.entries(x.extras || {})) { if (!EXTRA_KEYS.has(k)) return { error: 'bad_extra', why: k, empNo }; const n = money(v ?? 0); if (n == null) return { error: 'bad_value', why: k, empNo }; if (n) extras[k] = n; }
  return { row: { empNo, name, plan, extras } };
}

function splitRouter({ db, audit }) {
  const r = express.Router();
  const deny = (req, res, need) => audit(req, 'denied', req.originalUrl, { need }).then(() => res.status(403).json({ error: 'forbidden' }));
  const canView = u => can(u.role, 'salary') && canViewPage(u.role, PAGE), canEdit = u => can(u.role, 'salary') && pageCode(u.role, PAGE) === '可編輯';
  const view = (req, res, next) => canView(req.user) ? next() : deny(req, res, PAGE);
  const edit = (req, res, next) => canEdit(req.user) ? next() : deny(req, res, PAGE + ':edit');
  const kit = payMonthsKit({ db, audit, kind: KIND }), rulesFor = month => kit.rulesFor(month, S.DEFAULT_CONFIG);

  /** 這個月每個人的計算：仁寶的服務（姓名對應到員編）＋人資匯入的輸入。對不到員編的仁寶居服員先不算，列在 unmatched，並擋住發布 */
  async function computeMonth(month) {
    const [items, wmr, days, rows] = await Promise.all([
      db.query('SELECT worker, code, item_name, n::float AS n, n_holiday::float AS nh, amount::float AS amount FROM svc_worker_item WHERE month=$1', [month]),
      db.query('SELECT worker, amount::float AS amount, remote_cases FROM svc_worker_month WHERE month=$1', [month]),
      db.query('SELECT worker, sum(minutes)::float AS minutes FROM svc_worker_day WHERE month=$1 GROUP BY worker', [month]),
      db.query('SELECT * FROM pay_split_rows WHERE month=$1 ORDER BY emp_no', [month])]);
    if (!items.rows.length && !wmr.rows.length && !rows.rows.length) return null;
    const rules = await rulesFor(month), cfg = rules.config;
    const workers = new Set([...items.rows.map(x => x.worker), ...wmr.rows.map(x => x.worker)]), resolved = await resolveWorkers(db, workers);
    const wm = new Map(wmr.rows.map(x => [x.worker, x])), mins = new Map(days.rows.map(x => [x.worker, x.minutes]));
    const by = new Map(), unmatched = [], blockers = [], claimed = new Map();
    const person = empNo => { if (!by.has(empNo)) by.set(empNo, { empNo, name: '', workers: [], items: [], billed: 0, remoteCases: 0, minutes: 0, row: null }); return by.get(empNo); };
    for (const w of workers) {
      const m = resolved.get(w), its = items.rows.filter(x => x.worker === w).map(x => ({ code: x.code, name: x.item_name, n: x.n, nh: x.nh, amount: x.amount }));
      const info = wm.get(w) || { amount: 0, remote_cases: 0 };
      if (!m.empNo) { const est = S.pay(cfg, { items: its, billed: info.amount, remoteCases: info.remote_cases, plan: 'A', extras: {} }); unmatched.push({ worker: w, status: m.status, billed: info.amount, estimate: est.itemPay + est.bonus + est.remote });
        blockers.push({ empNo: '—', name: w, warn: [`仁寶居服員「${w}」對不到員工編號（${m.status === 'ambiguous' ? '同名多人' : '名冊裡沒有'}），沒有薪資單；請先指定員編`] }); continue; }
      if (claimed.has(m.empNo)) { blockers.push({ empNo: m.empNo, name: w, warn: [`仁寶居服員「${claimed.get(m.empNo)}」與「${w}」指定到同一個員編 ${m.empNo}，沒有算`] }); by.delete(m.empNo); claimed.set(m.empNo, claimed.get(m.empNo)); continue; }
      claimed.set(m.empNo, w); const p = person(m.empNo); p.name = w; p.workers.push(w); p.items = its; p.billed = info.amount; p.remoteCases = info.remote_cases; p.minutes = mins.get(w) || 0;
    }
    for (const x of rows.rows) { const p = claimed.has(x.emp_no) && !by.has(x.emp_no) ? null : person(x.emp_no); if (p) { p.row = x; if (!p.name) p.name = x.name; } }
    const ids = [...by.keys()], rr = (await db.query('SELECT e.id, e.role, u.name AS unit FROM employees e LEFT JOIN units u ON u.id=e.unit_id WHERE e.id = ANY($1::text[])', [ids])).rows, roster = new Map(rr.map(e => [e.id, e.role])), unitOf = new Map(rr.map(e => [e.id, e.unit]));
    const people = ids.sort().map(id => {
      const p = by.get(id), plan = p.row && p.row.plan ? p.row.plan : roster.get(id) === 'driver' ? 'B' : 'A', input = { items: p.items, billed: p.billed, remoteCases: p.remoteCases, plan, extras: p.row ? p.row.extras : {} };
      const result = S.pay(cfg, input); result.planSource = p.row && p.row.plan ? 'input' : roster.get(id) === 'driver' ? 'role' : 'default';
      return { empNo: id, name: p.name || id, org: unitOf.get(id) || '', minutes: p.minutes, workers: p.workers, onRoster: roster.has(id), extras: p.row ? p.row.extras : {}, plan: p.row ? p.row.plan : null, result };
    });
    return { rules, people, unmatched, blockers };
  }
  const slipOf = (month, p, rules, version) => buildSplitSlip({ month, person: p, result: p.result, rules, version });

  const rulesPayload = async (month, req) => ({ ...(await rulesFor(month)), versions: await kit.versions(), editable: canEdit(req.user), extras: S.EXTRAS });
  r.get('/rules', view, async (req, res) => { const month = String(req.query.month || ''); if (!MONTH.test(month)) return res.status(400).json({ error: 'bad_month' }); res.json(await rulesPayload(month, req)); });
  r.put('/rules', edit, async (req, res) => {
    const b = req.body || {}, month = String(b.effectiveFrom || ''); if (!MONTH.test(month)) return res.status(400).json({ error: 'bad_month' });
    const v = S.validateConfig(b.config); if (v.error) return res.status(400).json(v);
    const id = await kit.addVersion(month, v.config, req.user.id); await audit(req, 'pay_rules_change', String(id), { kind: KIND, effectiveFrom: month });
    res.status(201).json({ id, effectiveFrom: month, config: v.config });
  });

  r.get('/months', view, async (req, res) => res.json((await db.query(`SELECT m.month, COALESCE(s.people,0) AS people, COALESCE(p.status,'draft') AS status, COALESCE(p.version,0) AS version
      FROM (SELECT month FROM svc_month UNION SELECT month FROM pay_split_rows) m
      LEFT JOIN (SELECT month, count(*)::int AS people FROM pay_split_rows GROUP BY month) s ON s.month=m.month
      LEFT JOIN pay_months p ON p.kind='split' AND p.month=m.month ORDER BY m.month DESC`)).rows));

  /** 匯入或更新某個月的輸入。mode=replace：整個月換掉；mode=upsert（預設）：只更新送來的人 */
  r.post('/rows', edit, express.json({ limit: '1mb' }), async (req, res) => {
    const b = req.body || {}, month = String(b.month || ''), list = b.rows;
    if (!MONTH.test(month)) return res.status(400).json({ error: 'bad_month' });
    if (!Array.isArray(list) || !list.length || list.length > 600) return res.status(400).json({ error: 'bad_rows' });
    if (await kit.lockedRes(res, month)) return;
    const rows = [], seen = new Set();
    for (const x of list) { const c = cleanRow(x); if (c.error) return res.status(400).json(c); if (seen.has(c.row.empNo)) return res.status(400).json({ error: 'duplicate_emp_no', empNo: c.row.empNo }); seen.add(c.row.empNo); rows.push(c.row); }
    const replace = b.mode === 'replace';
    await db.tx(async q => {
      if (replace) await q('DELETE FROM pay_split_rows WHERE month=$1', [month]);
      for (const w of rows) await q(`INSERT INTO pay_split_rows (month, emp_no, name, plan, extras, updated_by) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (month, emp_no) DO UPDATE SET name=EXCLUDED.name, plan=EXCLUDED.plan, extras=EXCLUDED.extras, updated_by=EXCLUDED.updated_by, updated_at=now()`, [month, w.empNo, w.name, w.plan, JSON.stringify(w.extras), req.user.id]);
    });
    await audit(req, 'pay_rows_import', month, { kind: KIND, people: rows.length, mode: replace ? 'replace' : 'upsert' });
    res.status(201).json({ month, people: rows.length });
  });

  /** 代扣表（勞保、健保、勞退自提、其他）：只更新代扣那四項；沒有輸入列的人，只有「在名冊裡」或「仁寶對得到員編」的才會新增一列，其他回報 */
  r.put('/deductions', edit, express.json({ limit: '1mb' }), async (req, res) => {
    const b = req.body || {}, month = String(b.month || ''), list = b.rows;
    if (!MONTH.test(month)) return res.status(400).json({ error: 'bad_month' });
    if (!Array.isArray(list) || !list.length || list.length > 600) return res.status(400).json({ error: 'bad_rows' });
    if (await kit.lockedRes(res, month)) return;
    const ok = new Set((await db.query('SELECT id FROM employees')).rows.map(e => e.id));
    for (const m of (await resolveWorkers(db, (await db.query('SELECT DISTINCT worker FROM svc_worker_item WHERE month=$1', [month])).rows.map(x => x.worker))).values()) if (m.empNo) ok.add(m.empNo);
    const updated = [], missing = [];
    for (const x of list) {
      const empNo = text(x && x.empNo, 20), v = {}; for (const k of DED_KEYS) { const n = money(x[k] ?? 0); if (n == null) return res.status(400).json({ error: 'bad_value', why: k, empNo }); v[k] = n; }
      if (!/^[A-Za-z0-9_-]{1,20}$/.test(empNo)) return res.status(400).json({ error: 'bad_emp_no', why: empNo });
      const exists = (await db.query('SELECT 1 FROM pay_split_rows WHERE month=$1 AND emp_no=$2', [month, empNo])).rows.length;
      if (!exists && !ok.has(empNo)) { missing.push(empNo); continue; }
      await db.query(`INSERT INTO pay_split_rows (month, emp_no, name, extras, updated_by) VALUES ($1,$2,'',$3,$4)
        ON CONFLICT (month, emp_no) DO UPDATE SET extras = (pay_split_rows.extras - 'labor' - 'health' - 'pension' - 'otherDed') || EXCLUDED.extras, updated_by=EXCLUDED.updated_by, updated_at=now()`, [month, empNo, JSON.stringify(Object.fromEntries(Object.entries(v).filter(([, n]) => n))), req.user.id]);
      updated.push(empNo);
    }
    await audit(req, 'pay_deductions_import', month, { kind: KIND, updated: updated.length, missing: missing.length });
    res.json({ updated: updated.length, missing });
  });

  r.delete('/rows/:month/:empNo', edit, async (req, res) => {
    if (await kit.lockedRes(res, req.params.month)) return;
    const n = (await db.query('DELETE FROM pay_split_rows WHERE month=$1 AND emp_no=$2', [req.params.month, req.params.empNo])).rowCount;
    if (!n) return res.status(404).json({ error: 'not_found' });
    await audit(req, 'pay_row_delete', req.params.month, { kind: KIND, empNo: req.params.empNo });
    res.json({ ok: true });
  });

  r.get('/results', view, async (req, res) => {
    const month = String(req.query.month || ''); if (!MONTH.test(month)) return res.status(400).json({ error: 'bad_month' });
    const st = await kit.state(month), base = { month, kind: KIND, status: st.status, version: st.version, changedAt: st.changed_at, editable: canEdit(req.user) && st.status !== 'published' };
    if (st.status === 'published') {
      const pv = await kit.publishedView(month, st); await audit(req, 'pay_split_view', month, { people: pv.people.length, published: st.version });
      return res.json({ ...base, rules: pv.rules, config: null, people: pv.people, unmatched: [], totals: kit.totalsOf(pv.people) });
    }
    const m = await computeMonth(month); if (!m) return res.status(404).json({ error: 'no_data_for_month' });
    await audit(req, 'pay_split_view', month, { people: m.people.length });
    res.json({ ...base, rules: { id: m.rules.id, effectiveFrom: m.rules.effectiveFrom }, config: m.rules.config, people: m.people, unmatched: m.unmatched, totals: kit.totalsOf(m.people) });
  });

  kit.mount(r, { view, edit, compute: computeMonth, slipOf });
  return r;
}

module.exports = { splitRouter, cleanRow };
