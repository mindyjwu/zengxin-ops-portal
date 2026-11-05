/**
 * 請假、加班、補打卡與簽核 API。
 *
 * 簽核路徑（沿用原型）：申請人送出 → 直屬主管核准（pending）→ 人資複核（countersign）→ 核准（approved）。
 * 任何待簽階段都可以駁回（要寫理由）或由申請人抽單；核准後可以銷假。
 * 規則都在伺服器執行：誰能簽、額度、重疊、加班上限，網頁只是介面。
 */
const express = require('express');
const { can } = require('./permissions');
const { leaveBalance, taipei, OT_MONTH_CAP_H } = require('./leave-rules');

const OPEN = ['pending', 'countersign'];
const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const noPrefix = { leave: 'L', overtime: 'OT', punch_fix: 'F' };
const display = r => noPrefix[r.kind] + r.id;
const keepUntil = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear() + 5, d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10);

/** 這個人現在可不可以處理這張單（依狀態決定是主管關還是人資關） */
function canAct(actor, r) {
  if (actor.id === r.emp_id) return false;                                   // 不能簽自己的單
  if (r.status === 'pending') return r.manager_id === actor.id || (can(actor.role, 'approve') && can(actor.role, 'mgmt') && can(actor.role, 'exportAll'));
  if (r.status === 'countersign') return can(actor.role, 'finalize');
  return false;
}
const canSee = (actor, r) => actor.id === r.emp_id || canAct(actor, r) || r.manager_id === actor.id || (can(actor.role, 'mgmt') && can(actor.role, 'exportAll'));

function requestsRouter({ db, audit }) {
  const r = express.Router();
  const fail = (res, code, error, extra) => res.status(code).json({ error, ...extra });

  const load = async (q, id) => (await q(`SELECT r.*, e.manager_id, e.name AS emp_name FROM requests r JOIN employees e ON e.id=r.emp_id WHERE r.id=$1`, [id])).rows[0];
  const detail = async (q, row) => {
    const d = row.kind === 'leave' ? (await q('SELECT l.leave_type, t.name AS leave_type_name, l.start_at, l.end_at, l.hours FROM leave_requests l JOIN leave_types t ON t.code=l.leave_type WHERE l.request_id=$1', [row.id])).rows[0]
      : row.kind === 'overtime' ? (await q('SELECT work_date, start_time, end_time, hours, comp FROM overtime_requests WHERE request_id=$1', [row.id])).rows[0]
        : (await q('SELECT fix_date, punch_kind, fix_time FROM punch_fix_requests WHERE request_id=$1', [row.id])).rows[0];
    return { no: display(row), id: +row.id, kind: row.kind, empId: row.emp_id, empName: row.emp_name, status: row.status, reason: row.reason, filedAt: row.filed_at, ...d };
  };

  const submit = async (req, res, kind, body, validate, insertDetail) => {
    const me = (await db.query('SELECT id, name, hired_at FROM employees WHERE id=$1', [req.user.id])).rows[0];
    const v = await validate(me, body);
    if (v.error) return fail(res, v.code || 400, v.error, v.extra);
    try {
      const id = await db.tx(async q => {
        const ins = await q('INSERT INTO requests (kind, emp_id, reason, keep_until) VALUES ($1,$2,$3,$4) RETURNING id', [kind, me.id, String(body.reason || '').slice(0, 500) || null, keepUntil()]);
        await insertDetail(q, ins.rows[0].id, v);
        await q("INSERT INTO approvals (request_id, step, action, actor_id) VALUES ($1,'applicant','submit',$2)", [ins.rows[0].id, me.id]);
        return ins.rows[0].id;
      });
      await audit(req, 'request_submit', noPrefix[kind] + id, { kind });
      res.status(201).json({ id: +id, no: noPrefix[kind] + id, status: 'pending' });
    } catch (e) {
      if (/overlaps/.test(e.message)) return fail(res, 409, 'leave_overlaps');
      throw e;
    }
  };

  /* ---- 請假 ---- */
  r.post('/leave', (req, res) => submit(req, res, 'leave', req.body || {}, async (me, b) => {
    const start = new Date(b.start), end = new Date(b.end), hours = +b.hours;
    if (isNaN(start) || isNaN(end) || end <= start) return { error: 'bad_period' };
    if (!(hours > 0) || hours * 2 !== Math.trunc(hours * 2)) return { error: 'hours_must_be_positive_half_hours' };
    if (hours > ((end - start) / 3600000)) return { error: 'hours_exceed_period' };
    const t = (await db.query('SELECT code, designated_only, active FROM leave_types WHERE code=$1', [b.leaveType])).rows[0];
    if (!t || !t.active) return { error: 'unknown_leave_type' };
    if (t.designated_only) return { error: 'leave_type_for_designated_staff_only', code: 403 };
    const bal = await leaveBalance(db.query, me, t.code, start);
    const cap = (await db.query('SELECT quota_days, cap_scope FROM leave_types WHERE code=$1', [t.code])).rows[0];
    if (cap.cap_scope === 'event' && cap.quota_days != null && hours > +cap.quota_days * 8) return { error: 'exceeds_per_event_limit', code: 422, extra: { limitHours: +cap.quota_days * 8 } };
    if (bal.left != null && hours > bal.left) return { error: 'quota_exceeded', code: 422, extra: { left: bal.left, requested: hours } };
    return { type: t.code, start, end, hours };
  }, (q, id, v) => q('INSERT INTO leave_requests (request_id, leave_type, start_at, end_at, hours) VALUES ($1,$2,$3,$4,$5)', [id, v.type, v.start.toISOString(), v.end.toISOString(), v.hours])));

  r.get('/leave/balance', async (req, res) => {
    const me = (await db.query('SELECT id, hired_at FROM employees WHERE id=$1', [req.user.id])).rows[0], now = new Date();
    const types = (await db.query('SELECT code, name, pay_ratio FROM leave_types WHERE active AND NOT designated_only ORDER BY code')).rows;
    const out = [];
    for (const t of types) { const b = await leaveBalance(db.query, me, t.code, now); out.push({ code: t.code, name: t.name, payRatio: +t.pay_ratio, ...b }); }
    res.json(out);
  });

  /* ---- 加班 ---- */
  r.post('/overtime', (req, res) => submit(req, res, 'overtime', req.body || {}, async (me, b) => {
    const hours = +b.hours;
    if (!DATE.test(b.workDate || '') || !TIME.test(b.startTime || '') || !TIME.test(b.endTime || '')) return { error: 'bad_date_or_time' };
    if (!['pay', 'comp'].includes(b.comp)) return { error: 'comp_must_be_pay_or_comp' };
    if (!(hours > 0 && hours <= 12) || hours * 2 !== Math.trunc(hours * 2)) return { error: 'hours_must_be_half_hours_up_to_12' };
    const [sh, sm] = b.startTime.split(':').map(Number), [eh, em] = b.endTime.split(':').map(Number);
    if ((eh * 60 + em) - (sh * 60 + sm) < hours * 60 - 0.001) return { error: 'hours_exceed_time_range' };
    const month = b.workDate.slice(0, 7);
    const used = +(await db.query(`SELECT COALESCE(SUM(o.hours),0) AS h FROM overtime_requests o JOIN requests r ON r.id=o.request_id WHERE r.emp_id=$1 AND to_char(o.work_date,'YYYY-MM')=$2 AND r.status IN ('pending','countersign','approved')`, [me.id, month])).rows[0].h;
    if (used + hours > OT_MONTH_CAP_H) return { error: 'monthly_overtime_cap', code: 422, extra: { cap: OT_MONTH_CAP_H, used } };
    return { workDate: b.workDate, startTime: b.startTime, endTime: b.endTime, hours, comp: b.comp };
  }, (q, id, v) => q('INSERT INTO overtime_requests (request_id, work_date, start_time, end_time, hours, comp) VALUES ($1,$2,$3,$4,$5,$6)', [id, v.workDate, v.startTime, v.endTime, v.hours, v.comp])));

  /* ---- 補打卡 ---- */
  r.post('/punch-fix', (req, res) => submit(req, res, 'punch_fix', req.body || {}, async (me, b) => {
    if (!DATE.test(b.fixDate || '') || !TIME.test(b.fixTime || '')) return { error: 'bad_date_or_time' };
    if (!['in', 'out'].includes(b.kind)) return { error: 'bad_kind' };
    if (b.fixDate > taipei(new Date()).date) return { error: 'cannot_fix_the_future' };
    return { fixDate: b.fixDate, fixTime: b.fixTime, kind: b.kind };
  }, (q, id, v) => q('INSERT INTO punch_fix_requests (request_id, fix_date, punch_kind, fix_time) VALUES ($1,$2,$3,$4)', [id, v.fixDate, v.kind, v.fixTime])));

  /* ---- 查詢 ---- */
  r.get('/requests', async (req, res) => {
    const rows = (await db.query('SELECT id, kind FROM requests WHERE emp_id=$1 ORDER BY id DESC LIMIT 100', [req.user.id])).rows;
    const out = []; for (const x of rows) out.push(await detail(db.query, await load(db.query, x.id)));
    res.json(out);
  });
  r.get('/requests/inbox', async (req, res) => {
    const rows = (await db.query(`SELECT r.id FROM requests r WHERE r.status IN ('pending','countersign') ORDER BY r.id LIMIT 500`)).rows;
    const out = [];
    for (const x of rows) { const row = await load(db.query, x.id); if (canAct(req.user, row)) out.push(await detail(db.query, row)); }
    res.json(out);
  });
  r.get('/requests/:id', async (req, res) => {
    const row = await load(db.query, +req.params.id || 0);
    if (!row || !canSee(req.user, row)) return fail(res, row ? 403 : 404, row ? 'forbidden' : 'not_found');
    const history = (await db.query(`SELECT a.step, a.action, a.actor_id, e.name AS actor_name, a.comment, a.at FROM approvals a JOIN employees e ON e.id=a.actor_id WHERE a.request_id=$1 ORDER BY a.id`, [row.id])).rows;
    res.json({ ...(await detail(db.query, row)), history, canAct: canAct(req.user, row) });
  });

  /* ---- 簽核動作 ---- */
  const act = (action) => async (req, res) => {
    const comment = String((req.body || {}).comment || '').trim().slice(0, 500);
    try {
      const out = await db.tx(async q => {
        const row = (await q(`SELECT r.*, e.manager_id FROM requests r JOIN employees e ON e.id=r.emp_id WHERE r.id=$1 FOR UPDATE OF r`, [+req.params.id || 0])).rows[0];
        if (!row) return { code: 404, error: 'not_found' };
        const isApplicant = row.emp_id === req.user.id;
        let to, step;
        if (action === 'withdraw') { if (!isApplicant || !OPEN.includes(row.status)) return { code: isApplicant ? 409 : 403, error: isApplicant ? 'not_open' : 'forbidden' }; to = 'withdrawn'; step = 'applicant'; }
        else if (action === 'cancel') {
          const future = row.kind === 'leave' && new Date((await q('SELECT start_at FROM leave_requests WHERE request_id=$1', [row.id])).rows[0].start_at) > new Date();
          if (row.status !== 'approved') return { code: 409, error: 'only_approved_can_be_cancelled' };
          if (!((isApplicant && future) || can(req.user.role, 'finalize'))) return { code: 403, error: 'forbidden' };
          to = 'cancelled'; step = isApplicant ? 'applicant' : 'hr';
        } else {
          if (!OPEN.includes(row.status)) return { code: 409, error: 'not_open' };
          if (!canAct(req.user, row)) return { code: 403, error: 'forbidden' };
          step = row.status === 'pending' ? 'manager' : 'hr';
          if (action === 'reject') { if (!comment) return { code: 400, error: 'reject_needs_reason' }; to = 'rejected'; }
          else to = row.status === 'pending' ? 'countersign' : 'approved';
        }
        await q('UPDATE requests SET status=$1 WHERE id=$2', [to, row.id]);
        await q('INSERT INTO approvals (request_id, step, action, actor_id, comment) VALUES ($1,$2,$3,$4,$5)', [row.id, step, action, req.user.id, comment || null]);
        if (to === 'approved' && row.kind === 'punch_fix') {   // 補打卡核准：把這一筆補進打卡紀錄（標示來源是補打卡）
          const f = (await q('SELECT fix_date, punch_kind, fix_time FROM punch_fix_requests WHERE request_id=$1', [row.id])).rows[0];
          const d = f.fix_date instanceof Date ? f.fix_date.toISOString().slice(0, 10) : String(f.fix_date).slice(0, 10);
          await q("INSERT INTO punches (emp_id, kind, at, net_kind, source, keep_until) VALUES ($1,$2,($3::date + $4::time) AT TIME ZONE 'Asia/Taipei','fix','fix',$5)", [row.emp_id, f.punch_kind, d, f.fix_time, keepUntil()]);
        }
        return { ok: true, status: to, row };
      });
      if (out.error) { await audit(req, 'denied', '/api/requests/' + req.params.id, { action, why: out.error }); return fail(res, out.code, out.error); }
      await audit(req, 'request_' + action, display(out.row), { to: out.status });
      res.json({ ok: true, status: out.status });
    } catch (e) { throw e; }
  };
  r.post('/requests/:id/approve', act('approve'));
  r.post('/requests/:id/reject', act('reject'));
  r.post('/requests/:id/withdraw', act('withdraw'));
  r.post('/requests/:id/cancel', act('cancel'));

  return r;
}

module.exports = { requestsRouter, canAct };
