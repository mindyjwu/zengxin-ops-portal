/**
 * 各種計薪方式共用的「每月發布並鎖定、薪資單快照、退回、事件紀錄、員工看自己的」。
 * kind：oxford_hourly（牛津時薪制）、split（拆帳制）；之後月薪制也用同一套。
 * 快照存 { slip, person, result, onRoster }：發布後改規則、改勾選都不會動到已發布的數字。
 */
const MONTH = /^\d{4}-\d{2}$/;
const text = (v, max) => String(v ?? '').trim().slice(0, max);
const KINDS = { hourly: 'oxford_hourly', split: 'split' };

function payMonthsKit({ db, audit, kind }) {
  const state = async month => (await db.query('SELECT status, version, changed_at FROM pay_months WHERE kind=$1 AND month=$2', [kind, month])).rows[0] || { status: 'draft', version: 0, changed_at: null };
  const lockedRes = async (res, month) => { const st = await state(month); if (st.status === 'published') { res.status(409).json({ error: 'month_published', month }); return true; } return false; };
  const snapshots = async (month, version) => (await db.query('SELECT slip FROM pay_slips WHERE kind=$1 AND month=$2 AND version=$3 ORDER BY emp_no', [kind, month, version])).rows.map(x => x.slip);
  /** 某個月適用的規則：生效月份 ≤ 該月的最新一版；沒有就用預設值 */
  async function rulesFor(month, defaults) {
    const v = (await db.query('SELECT id, effective_from, config FROM pay_rule_versions WHERE kind=$1 AND effective_from <= $2 ORDER BY effective_from DESC, id DESC LIMIT 1', [kind, month])).rows[0];
    return v ? { id: +v.id, effectiveFrom: v.effective_from, config: v.config } : { id: null, effectiveFrom: null, config: defaults };
  }
  /** 規則版本清單與新增版本（設定由各計薪方式自己驗證後傳進來） */
  const versions = async () => (await db.query('SELECT v.id, v.effective_from, v.created_at, e.name AS created_by FROM pay_rule_versions v JOIN employees e ON e.id=v.created_by WHERE v.kind=$1 ORDER BY v.effective_from DESC, v.id DESC LIMIT 30', [kind])).rows;
  const addVersion = async (effectiveFrom, config, userId) => +(await db.query('INSERT INTO pay_rule_versions (kind, effective_from, config, created_by) VALUES ($1,$2,$3,$4) RETURNING id', [kind, effectiveFrom, JSON.stringify(config), userId])).rows[0].id;
  const totalsOf = people => people.reduce((a, p) => ({ A: a.A + p.result.A, B: a.B + (p.result.B || 0), C: a.C + p.result.C, net: a.net + p.result.net }), { A: 0, B: 0, C: 0, net: 0 });

  /** 草稿用現在的計算、已發布用快照 */
  async function slipsOf(month, compute, slipOf) {
    const st = await state(month);
    if (st.status === 'published') return { published: true, version: st.version, slips: (await snapshots(month, st.version)).map(x => x.slip) };
    const m = await compute(month); if (!m) return null;
    return { published: false, version: 0, slips: m.people.map(p => slipOf(month, p, m.rules, 0)) };
  }

  /** 結果頁用：已發布回傳快照裡的人與當時的規則，草稿回傳 null（由呼叫端現算） */
  async function publishedView(month, st) {
    const snaps = await snapshots(month, st.version), people = snaps.map(x => ({ ...x.person, onRoster: x.onRoster, result: x.result }));
    return { people, rules: snaps[0] ? snaps[0].slip.rules : null };
  }

  function mount(r, { view, edit, compute, slipOf }) {
    r.get('/payslips', view, async (req, res) => {
      const month = String(req.query.month || ''); if (!MONTH.test(month)) return res.status(400).json({ error: 'bad_month' });
      const d = await slipsOf(month, compute, slipOf); if (!d) return res.status(404).json({ error: 'no_data_for_month' });
      await audit(req, 'pay_payslips_view', month, { kind, people: d.slips.length, published: d.published });
      res.json({ month, ...d });
    });
    r.get('/payslip', view, async (req, res) => {
      const month = String(req.query.month || ''), empNo = String(req.query.empNo || ''); if (!MONTH.test(month)) return res.status(400).json({ error: 'bad_month' });
      const d = await slipsOf(month, compute, slipOf); if (!d) return res.status(404).json({ error: 'no_data_for_month' });
      const slip = d.slips.find(x => x.empNo === empNo); if (!slip) return res.status(404).json({ error: 'not_found' });
      await audit(req, 'pay_payslip_view', month + '/' + empNo, { kind, published: d.published });
      res.json({ published: d.published, version: d.version, slip });
    });
    /** 發布並鎖定：有「嚴重提醒」要人資明確確認才能發布 */
    r.post('/publish', edit, async (req, res) => {
      const month = String((req.body || {}).month || ''); if (!MONTH.test(month)) return res.status(400).json({ error: 'bad_month' });
      const st = await state(month); if (st.status === 'published') return res.status(409).json({ error: 'month_published', month });
      const m = await compute(month); if (!m) return res.status(404).json({ error: 'no_data_for_month' });
      const blockers = [...m.people.filter(p => p.result.warn.some(w => w.crit)).map(p => ({ empNo: p.empNo, name: p.name, warn: p.result.warn.filter(w => w.crit).map(w => w.zh) })), ...(m.blockers || [])];
      if (blockers.length && (req.body || {}).acknowledgeWarnings !== true) return res.status(409).json({ error: 'blocking_warnings', people: blockers });
      const version = st.version + 1;
      await db.tx(async q => {
        for (const p of m.people) await q('INSERT INTO pay_slips (kind, month, version, emp_no, slip) VALUES ($1,$2,$3,$4,$5)', [kind, month, version, p.empNo, JSON.stringify({ slip: slipOf(month, p, m.rules, version), person: { ...p, result: undefined, onRoster: undefined }, result: p.result, onRoster: p.onRoster })]);
        await q("INSERT INTO pay_months (kind, month, status, version, changed_by) VALUES ($1,$2,'published',$3,$4) ON CONFLICT (kind, month) DO UPDATE SET status='published', version=$3, changed_by=$4, changed_at=now()", [kind, month, version, req.user.id]);
        await q("INSERT INTO pay_month_events (kind, month, action, version, detail, by_id) VALUES ($1,$2,'publish',$3,$4,$5)", [kind, month, version, JSON.stringify({ people: m.people.length, acknowledgedWarnings: blockers.length }), req.user.id]);
      });
      await audit(req, 'pay_publish', month, { kind, version, people: m.people.length, acknowledgedWarnings: blockers.length });
      res.status(201).json({ month, version, people: m.people.length, acknowledgedWarnings: blockers.length });
    });
    /** 退回：必須寫原因；員工立刻看不到；改完重新發布是新版本，舊版本保留 */
    r.post('/reopen', edit, async (req, res) => {
      const month = String((req.body || {}).month || ''), reason = text((req.body || {}).reason, 300);
      if (!MONTH.test(month)) return res.status(400).json({ error: 'bad_month' });
      if (reason.length < 5) return res.status(400).json({ error: 'reason_required' });
      const st = await state(month); if (st.status !== 'published') return res.status(409).json({ error: 'not_published', month });
      await db.tx(async q => {
        await q("UPDATE pay_months SET status='draft', changed_by=$3, changed_at=now() WHERE kind=$1 AND month=$2", [kind, month, req.user.id]);
        await q("INSERT INTO pay_month_events (kind, month, action, version, reason, by_id) VALUES ($1,$2,'reopen',$3,$4,$5)", [kind, month, st.version, reason, req.user.id]);
      });
      await audit(req, 'pay_reopen', month, { kind, version: st.version, reason });
      res.json({ month, status: 'draft', version: st.version });
    });
    r.get('/events', view, async (req, res) => res.json((await db.query('SELECT e.month, e.action, e.version, e.reason, e.at, p.name AS by FROM pay_month_events e JOIN employees p ON p.id=e.by_id WHERE e.kind=$1 ORDER BY e.id DESC LIMIT 50', [kind])).rows));
  }

  return { kind, state, lockedRes, snapshots, totalsOf, slipsOf, publishedView, mount, rulesFor, versions, addVersion };
}

/** 員工自己的薪資單：只有自己（工號＝員工編號）、已發布的月份；各種計薪方式合併成一張清單 */
function payslipsRouter({ db, audit }) {
  const express = require('express'), r = express.Router();
  const kindName = k => Object.keys(KINDS).find(n => KINDS[n] === k);
  r.get('/mine', async (req, res) => res.json((await db.query("SELECT s.kind, s.month, s.version, (s.slip->'slip'->>'net')::int AS net FROM pay_slips s JOIN pay_months m ON m.kind=s.kind AND m.month=s.month AND m.version=s.version AND m.status='published' WHERE s.emp_no=$1 ORDER BY s.month DESC, s.kind", [req.user.id])).rows.map(x => ({ ...x, kind: kindName(x.kind) }))));
  r.get('/mine/:month', async (req, res) => {
    if (!MONTH.test(req.params.month)) return res.status(400).json({ error: 'bad_month' });
    const kind = KINDS[String(req.query.kind || 'hourly')]; if (!kind) return res.status(400).json({ error: 'bad_kind' });
    const x = (await db.query("SELECT s.slip->'slip' AS slip, s.version FROM pay_slips s JOIN pay_months m ON m.kind=s.kind AND m.month=s.month AND m.version=s.version AND m.status='published' WHERE s.kind=$1 AND s.month=$2 AND s.emp_no=$3", [kind, req.params.month, req.user.id])).rows[0];
    if (!x) return res.status(404).json({ error: 'not_found' });
    await audit(req, 'payslip_view_self', req.params.month, { kind, version: x.version });
    res.json({ published: true, version: x.version, slip: x.slip });
  });
  return r;
}

module.exports = { payMonthsKit, payslipsRouter, KINDS };
