/** 仁寶居服員姓名 → 員工編號：人資指定的對應優先；沒有就用在職員工名冊裡「唯一」同名的人；同名多人或找不到不猜。 */
async function resolveWorkers(db, workers) {
  const nameMap = new Map((await db.query('SELECT worker, emp_no FROM svc_name_map')).rows.map(r => [r.worker, r.emp_no]));
  const byName = new Map(); for (const e of (await db.query("SELECT id, name FROM employees WHERE status='active'")).rows) byName.set(e.name, [...(byName.get(e.name) || []), e.id]);
  const out = new Map();
  for (const w of workers) {
    const hit = byName.get(w);
    out.set(w, nameMap.has(w) ? { status: 'mapped', empNo: nameMap.get(w) } : hit ? (hit.length === 1 ? { status: 'matched', empNo: hit[0] } : { status: 'ambiguous' }) : { status: 'unmatched' });
  }
  return out;
}
module.exports = { resolveWorkers };
