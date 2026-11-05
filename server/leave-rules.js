/** 請假與加班的計算規則（和網站原型一致）：特休天數、各假別額度、加班月上限。 */
const WORK_DAY_H = 8, OT_MONTH_CAP_H = 46, TZ = 'Asia/Taipei';

/** 特休天數（勞基法第 38 條）：依到職日與基準日算年資 */
function annualDays(hiredAt, asOf) {
  if (!hiredAt) return 0;
  const y = (asOf - new Date(hiredAt)) / 31557600000;
  if (y < 0.5) return 0; if (y < 1) return 3; if (y < 2) return 7; if (y < 3) return 10; if (y < 5) return 14; if (y < 10) return 15;
  return Math.min(30, 15 + Math.floor(y) - 9);
}

/** 台北時間的年月（用來決定「每年」「每月」的額度算在哪一期） */
function taipei(d) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).split('-');
  return { y: +p[0], m: +p[1], ym: p[0] + '-' + p[1], date: p.join('-') };
}

/**
 * 某員工某假別在某一期的額度餘額（小時）。
 * 回傳 { quota, used, pending, left }；quota 為 null 代表沒有上限。
 */
async function leaveBalance(q, emp, type, startAt, excludeRequestId = 0) {
  const t = (await q('SELECT code, quota_days, cap_scope, group_code FROM leave_types WHERE code=$1', [type])).rows[0];
  if (!t) return null;
  const when = taipei(startAt);
  const periodSql = t.cap_scope === 'month'
    ? "to_char(l.start_at AT TIME ZONE 'Asia/Taipei', 'YYYY-MM') = $3"
    : "to_char(l.start_at AT TIME ZONE 'Asia/Taipei', 'YYYY') = $3";
  const period = t.cap_scope === 'month' ? when.ym : String(when.y);
  const sum = async (types, statuses) => +(await q(
    `SELECT COALESCE(SUM(l.hours),0) AS h FROM leave_requests l JOIN requests r ON r.id=l.request_id
     WHERE r.emp_id=$1 AND l.leave_type = ANY($2) AND r.status = ANY($4) AND ${periodSql} AND r.id <> $5`,
    [emp.id, types, period, statuses, excludeRequestId])).rows[0].h;
  let quota = null;
  if (t.code === 'annual') quota = annualDays(emp.hired_at, startAt) * WORK_DAY_H;
  else if (t.code === 'comp') {
    const earned = +(await q("SELECT COALESCE(SUM(o.hours),0) AS h FROM overtime_requests o JOIN requests r ON r.id=o.request_id WHERE r.emp_id=$1 AND o.comp='comp' AND r.status='approved'", [emp.id])).rows[0].h;
    const usedAll = +(await q("SELECT COALESCE(SUM(l.hours),0) AS h FROM leave_requests l JOIN requests r ON r.id=l.request_id WHERE r.emp_id=$1 AND l.leave_type='comp' AND r.status IN ('approved','pending','countersign') AND r.id <> $2", [emp.id, excludeRequestId])).rows[0].h;
    return { quota: earned, used: 0, pending: usedAll, left: Math.max(0, earned - usedAll), scope: 'balance' };
  }
  else if (t.quota_days != null) quota = +t.quota_days * WORK_DAY_H;
  const used = t.cap_scope === 'event' ? 0 : await sum([type], ['approved']);
  const pending = t.cap_scope === 'event' ? 0 : await sum([type], ['pending', 'countersign']);
  let left = quota == null ? null : Math.max(0, quota - used - pending);
  if (t.group_code && t.cap_scope !== 'event') {
    const g = (await q('SELECT cap_hours FROM leave_groups WHERE code=$1', [t.group_code])).rows[0];
    const members = (await q('SELECT code FROM leave_types WHERE group_code=$1', [t.group_code])).rows.map(x => x.code);
    const gu = await sum(members, ['approved', 'pending', 'countersign']);
    const gl = Math.max(0, +g.cap_hours - gu);
    left = left == null ? gl : Math.min(left, gl);
  }
  return { quota, used, pending, left, scope: t.cap_scope };
}

module.exports = { annualDays, taipei, leaveBalance, WORK_DAY_H, OT_MONTH_CAP_H, TZ };
