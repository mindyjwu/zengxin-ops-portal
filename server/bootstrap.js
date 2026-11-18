/**
 * 第一位系統管理員：新的正式資料庫裡沒有任何員工，沒人登入得了，也就沒人能建立員工。
 * 所以第一次部署時設 BOOTSTRAP_ADMIN_EMAIL，伺服器啟動時「員工名冊是空的」才會建立這一位（角色 admin、單位 J02），之後這個設定不再有任何作用。
 * 用 Google 登入這個 email，就能到員工管理頁匯入全部員工、指派人資與主管。
 */
const UNIT = 'J02';

async function bootstrapAdmin(db, { email, name = '系統管理員（首位）' } = {}) {
  if (!email) return { skipped: 'not_set' };
  return db.tx(async q => {
    await q('SELECT pg_advisory_xact_lock(727275)');                                  // 同時起好幾個實例也只建一次
    if ((await q('SELECT count(*)::int AS n FROM employees')).rows[0].n > 0) return { skipped: 'not_empty' };
    if (!(await q('SELECT 1 FROM units WHERE id=$1', [UNIT])).rows.length) throw new Error(`單位 ${UNIT} 不存在，無法建立第一位管理員`);
    const id = `${UNIT}0001`;
    await q("INSERT INTO employees (id, name, email, unit_id, role, hired_at) VALUES ($1,$2,$3,$4,'admin', CURRENT_DATE)", [id, name, email, UNIT]);
    await q('INSERT INTO audit_log (actor_id, action, target, detail) VALUES (NULL, $1, $2, $3)', ['bootstrap_admin', id, JSON.stringify({ email })]);
    return { created: id };
  });
}

module.exports = { bootstrapAdmin };
