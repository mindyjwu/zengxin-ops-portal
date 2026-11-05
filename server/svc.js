/**
 * 仁寶服務紀錄：匯入彙總、儀表板、居服員工時、拆帳制計薪。
 * 個資原則：個案姓名、身分證字號、案號不進伺服器。瀏覽器讀檔後只送彙總（居服員姓名、日期、分鐘、項目、金額）。
 * 權限：看＝職稱權限對照表「業務資料整合 › 居服個案管理系統」不是「不可」；匯入＝「可」或「可編輯」；拆帳計薪＝薪資權限（salary）。
 */
const express = require('express');
const { can, canViewPage, canEditPage } = require('./permissions');
const cfg = require('./svc-config.json');

const PAGE = 'svc.case';
const MONTH = /^\d{4}-\d{2}$/, DAY = /^\d{4}-\d{2}-\d{2}$/;
const num = (v, max = 1e9) => { const n = +v; return Number.isFinite(n) && n >= 0 && n <= max ? n : null; };
const str = (v, max = 80) => String(v ?? '').slice(0, max);
const keepUntil = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear() + 5, d.getUTCMonth(), d.getUTCDate())).toISOString().slice(0, 10); };

/** 檢查並整理瀏覽器送來的彙總：型別、範圍、數量上限，不認得的欄位直接丟掉 */
function clean(b) {
  const bad = why => ({ error: 'bad_summary', why });
  if (!b || typeof b !== 'object') return bad('empty');
  const months = Object.keys(b.mon || {});
  if (!months.length || months.length > 12 || !months.every(m => MONTH.test(m))) return bad('months');
  const out = { sourceName: str(b.sourceName, 120), from: DAY.test(b.from) ? b.from : null, to: DAY.test(b.to) ? b.to : null,
    rows: num(b.rows), skipped: num(b.skipped) ?? 0, cases: num(b.cases) ?? 0, noPrice: num(b.noPrice) ?? 0, mon: {}, mu: {}, days: [], items: [], wm: [] };
  if (out.rows == null) return bad('rows');
  out.odd = {}; for (const k of ['noOut', 'noShow', 'late', 'short', 'zero']) out.odd[k] = num((b.odd || {})[k]) ?? 0;
  for (const m of months) {
    const x = b.mon[m], o = { cases: num(x.cases), rows: num(x.rows), min: num(x.min), who: num(x.who) };
    if (Object.values(o).some(v => v == null)) return bad('month ' + m);
    out.mon[m] = o; out.mu[m] = {};
    for (const [u, y] of Object.entries((b.mu || {})[m] || {}).slice(0, 20)) {
      const q = { cases: num(y.cases), rows: num(y.rows), min: num(y.min), who: num(y.who) };
      if (Object.values(q).some(v => v == null)) return bad('unit');
      out.mu[m][str(u, 120)] = q;
    }
  }
  const workers = Object.entries(b.who || {});
  if (workers.length > 500) return bad('too_many_workers');
  for (const [w, v] of workers) {
    const name = str(w, 40); if (!name) return bad('worker_name');
    const days = Object.entries((v && v.byDay) || {}); if (days.length > 400) return bad('too_many_days');
    for (const [d, mins] of days) { const mi = num(mins, 1e6); if (!DAY.test(d) || mi == null || !out.mon[d.slice(0, 7)]) return bad('day'); out.days.push([d.slice(0, 7), name, d, mi]); }
  }
  for (const [m, ws] of Object.entries(b.sp || {})) {
    if (!out.mon[m]) return bad('sp_month');
    for (const [w, v] of Object.entries(ws || {}).slice(0, 500)) {
      const name = str(w, 40), its = Object.entries((v && v.it) || {});
      if (its.length > 120) return bad('too_many_items');
      out.wm.push([m, name, num(v.amt) ?? 0, Math.trunc(num(v.rem, 1e5) ?? 0)]);
      for (const [code, it] of its) { const n = num(it.n), nh = num(it.nh), amt = num(it.amt), mi = num(it.min); if ([n, nh, amt, mi].some(q => q == null)) return bad('item'); out.items.push([m, name, str(code, 20), str(it.name, 60), n, nh, amt, mi]); }
    }
  }
  return out;
}

const cols = (rows, i) => rows.map(r => r[i]);
async function mondayOf(day) { const t = new Date(day + 'T00:00:00Z'), k = (t.getUTCDay() + 6) % 7; return [new Date(t - k * 864e5).toISOString().slice(0, 10), new Date(+t - k * 864e5 + 6 * 864e5).toISOString().slice(0, 10)]; }

function svcRouter({ db, audit }) {
  const r = express.Router();
  const view = (req, res, next) => canViewPage(req.user.role, PAGE) ? next() : audit(req, 'denied', req.originalUrl, { need: PAGE }).then(() => res.status(403).json({ error: 'forbidden' }));
  const edit = (req, res, next) => canEditPage(req.user.role, PAGE) ? next() : audit(req, 'denied', req.originalUrl, { need: PAGE + ':edit' }).then(() => res.status(403).json({ error: 'forbidden' }));

  r.post('/imports', edit, express.json({ limit: '4mb' }), async (req, res) => {
    const c = clean(req.body);
    if (c.error) return res.status(400).json({ error: c.error, why: c.why });
    const id = await db.tx(async q => {
      const imp = (await q('INSERT INTO svc_imports (imported_by, source_name, date_from, date_to, rows, skipped, cases, odd, no_price, keep_until) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',
        [req.user.id, c.sourceName, c.from, c.to, c.rows, c.skipped, c.cases, JSON.stringify(c.odd), c.noPrice, keepUntil()])).rows[0].id;
      for (const [m, o] of Object.entries(c.mon)) {
        await q('DELETE FROM svc_month WHERE month=$1', [m]);                      // 同一個月重新匯入：取代舊的（子表跟著清掉）
        await q('INSERT INTO svc_month (month, import_id, cases, rows, minutes, workers) VALUES ($1,$2,$3,$4,$5,$6)', [m, imp, o.cases, o.rows, o.min, o.who]);
        for (const [u, y] of Object.entries(c.mu[m])) await q('INSERT INTO svc_month_unit (month, unit, cases, rows, minutes, workers) VALUES ($1,$2,$3,$4,$5,$6)', [m, u, y.cases, y.rows, y.min, y.who]);
      }
      if (c.days.length) await q('INSERT INTO svc_worker_day (month, worker, day, minutes) SELECT * FROM unnest($1::text[], $2::text[], $3::date[], $4::numeric[])', [cols(c.days, 0), cols(c.days, 1), cols(c.days, 2), cols(c.days, 3)]);
      if (c.items.length) await q('INSERT INTO svc_worker_item (month, worker, code, item_name, n, n_holiday, amount, minutes) SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::numeric[], $6::numeric[], $7::numeric[], $8::numeric[])', [0, 1, 2, 3, 4, 5, 6, 7].map(i => cols(c.items, i)));
      if (c.wm.length) await q('INSERT INTO svc_worker_month (month, worker, amount, remote_cases) SELECT * FROM unnest($1::text[], $2::text[], $3::numeric[], $4::int[])', [0, 1, 2, 3].map(i => cols(c.wm, i)));
      return imp;
    });
    await audit(req, 'svc_import', String(id), { months: Object.keys(c.mon), rows: c.rows, workers: new Set(c.days.map(d => d[1])).size });
    res.status(201).json({ id: +id, months: Object.keys(c.mon) });
  });

  r.get('/imports', view, async (req, res) => res.json((await db.query('SELECT i.id, i.imported_at, i.source_name, to_char(i.date_from,\'YYYY-MM-DD\') AS date_from, to_char(i.date_to,\'YYYY-MM-DD\') AS date_to, i.rows, i.cases, e.name AS imported_by FROM svc_imports i JOIN employees e ON e.id=i.imported_by ORDER BY i.id DESC LIMIT 50')).rows));

  r.get('/months', view, async (req, res) => res.json((await db.query(`SELECT m.month, m.cases, m.rows, m.minutes::float AS minutes, m.workers, i.imported_at,
      (SELECT to_char(max(day),'YYYY-MM-DD') FROM svc_worker_day d WHERE d.month=m.month) AS last_day FROM svc_month m JOIN svc_imports i ON i.id=m.import_id ORDER BY m.month DESC`)).rows));

  r.get('/dashboard', view, async (req, res) => {
    const month = String(req.query.month || '');
    const m = (await db.query('SELECT m.month, m.cases, m.rows, m.minutes::float AS minutes, m.workers, i.odd, i.imported_at FROM svc_month m JOIN svc_imports i ON i.id=m.import_id WHERE m.month=$1', [month])).rows[0];
    if (!m) return res.status(404).json({ error: 'no_data_for_month' });
    const [units, daily, items, perWorker] = await Promise.all([
      db.query('SELECT unit, cases, rows, minutes::float AS minutes, workers FROM svc_month_unit WHERE month=$1 ORDER BY minutes DESC', [month]),
      db.query("SELECT to_char(day,'YYYY-MM-DD') AS day, sum(minutes)::float AS minutes FROM svc_worker_day WHERE month=$1 GROUP BY day ORDER BY day", [month]),
      db.query('SELECT item_name AS name, sum(n)::float AS n, sum(minutes)::float AS minutes FROM svc_worker_item WHERE month=$1 GROUP BY item_name ORDER BY sum(minutes) DESC', [month]),
      db.query('SELECT worker, sum(minutes)::float AS minutes FROM svc_worker_day WHERE month=$1 GROUP BY worker', [month])
    ]);
    const [yy, mm] = month.split('-').map(Number), eom = `${month}-${String(new Date(Date.UTC(yy, mm, 0)).getUTCDate()).padStart(2, '0')}`;
    const last = daily.rows.length ? daily.rows[daily.rows.length - 1].day : null;
    const buckets = [[0, 20], [20, 40], [40, 60], [60, 80], [80, 1e9]].map(([a, b]) => ({ from: a, to: b > 1e8 ? null : b, workers: perWorker.rows.filter(w => w.minutes / 60 >= a && w.minutes / 60 < b && w.minutes > 0).length }));
    res.json({ month, cases: m.cases, rows: m.rows, hours: m.minutes / 60, workers: m.workers, avgPerWorker: m.workers ? m.minutes / 60 / m.workers : null, avgPerCase: m.cases ? m.minutes / 60 / m.cases : null,
      units: units.rows.map(u => ({ ...u, hours: u.minutes / 60 })), daily: daily.rows.map(d => ({ day: d.day, hours: d.minutes / 60 })), topItems: items.rows.slice(0, 8).map(i => ({ name: i.name, n: i.n, hours: i.minutes / 60 })),
      workerBuckets: buckets, exceptions: m.odd, partialMonth: last && last < eom ? { lastDay: last, endOfMonth: eom } : null, importedAt: m.imported_at });
  });

  r.get('/workers', view, async (req, res) => {
    const month = String(req.query.month || ''), day = DAY.test(req.query.day || '') ? req.query.day : null;
    if (!MONTH.test(month)) return res.status(400).json({ error: 'bad_month' });
    const [a, b] = day ? await mondayOf(day) : [null, null];
    const rows = (await db.query(`SELECT worker, sum(minutes)::float AS minutes, count(*)::int AS days,
        COALESCE(sum(minutes) FILTER (WHERE day = $2::date),0)::float AS day_min, COALESCE(sum(minutes) FILTER (WHERE day BETWEEN $3::date AND $4::date),0)::float AS week_min
      FROM svc_worker_day WHERE month=$1 GROUP BY worker ORDER BY sum(minutes) DESC`, [month, day, a, b])).rows;
    const emps = (await db.query("SELECT id, name FROM employees WHERE status='active'")).rows;
    const byName = new Map(); emps.forEach(e => byName.set(e.name, [...(byName.get(e.name) || []), e.id]));
    res.json(rows.map(w => {
      const base = w.worker.replace(/\d+$/, ''), hit = byName.get(w.worker), sfx = base !== w.worker && byName.get(base);
      const match = hit ? (hit.length === 1 ? { status: 'matched', id: hit[0] } : { status: 'ambiguous' }) : sfx ? { status: 'suffix' } : { status: 'unmatched' };
      return { worker: w.worker, hours: w.minutes / 60, days: w.days, dayHours: day ? w.day_min / 60 : null, weekHours: day ? w.week_min / 60 : null, match };
    }));
  });

  /* 拆帳制計薪：給付表（10/28）依次數與假日計算；業績獎金依當月服務金額區間；偏鄉津貼每案每月 600 */
  r.get('/pay', async (req, res) => {
    if (!can(req.user.role, 'salary')) { await audit(req, 'denied', req.originalUrl, { need: 'salary' }); return res.status(403).json({ error: 'forbidden' }); }
    const month = String(req.query.month || ''), plan = req.query.plan === 'B' ? 'B' : 'A';
    if (!MONTH.test(month)) return res.status(400).json({ error: 'bad_month' });
    const byCode = new Map(cfg.rates.map(x => [x.code, x])), byName = new Map(cfg.rates.map(x => [x.name, x]));
    const items = (await db.query('SELECT worker, code, item_name, n::float AS n, n_holiday::float AS nh, amount::float AS amount FROM svc_worker_item WHERE month=$1', [month])).rows;
    const wm = new Map((await db.query('SELECT worker, amount::float AS amount, remote_cases FROM svc_worker_month WHERE month=$1', [month])).rows.map(x => [x.worker, x]));
    if (!wm.size && !items.length) return res.status(404).json({ error: 'no_data_for_month' });
    const bonus = amt => { for (const [lo, hi, b] of cfg.bonus) if (amt >= lo && amt <= hi) return b; return amt > 100000 ? cfg.bonus[cfg.bonus.length - 1][2] : 0; };
    const W = new Map(), unmatched = {};
    for (const it of items) {
      const rate = byCode.get(it.code) || byName.get(String(it.item_name).replace('處理費', ''));
      const w = W.get(it.worker) || { worker: it.worker, pay: 0, unpaid: 0 }; W.set(it.worker, w);
      if (!rate) { w.unpaid += it.n; unmatched[it.code + '：' + it.item_name] = (unmatched[it.code + '：' + it.item_name] || 0) + it.n; continue; }
      w.pay += (it.n - it.nh) * (plan === 'B' ? rate.B : rate.A) + it.nh * (plan === 'B' ? rate.hB : rate.hA);
    }
    const workers = [...W.values()].map(w => { const m = wm.get(w.worker) || { amount: 0, remote_cases: 0 }, bo = bonus(m.amount), rem = m.remote_cases * cfg.remote.allow;
      return { worker: w.worker, billed: m.amount, itemPay: w.pay, bonus: bo, remote: rem, remoteCases: m.remote_cases, total: w.pay + bo + rem, unpaidLines: w.unpaid }; }).sort((a, b) => b.total - a.total);
    const sum = k => workers.reduce((a, w) => a + w[k], 0);
    await audit(req, 'svc_pay_view', month, { plan, workers: workers.length });
    res.json({ month, plan, workers, totals: { billed: sum('billed'), itemPay: sum('itemPay'), bonus: sum('bonus'), remote: sum('remote'), total: sum('total') }, unmatchedItems: unmatched });
  });

  return r;
}

module.exports = { svcRouter, clean };
