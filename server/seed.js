/** 開發用假資料（全部虛構）：本機啟動後執行 `node server/seed.js` 會寫入幾位示範員工。 */
const { createDb } = require('./db');
async function seed(db) {
  await db.query("INSERT INTO units (id,name) VALUES ('J02','誠馨綜合式機構（示範）') ON CONFLICT DO NOTHING");
  const rows = [['J020001', '示範管理者', 'manager@example.test', 'manager'], ['J020002', '示範人資', 'hr@example.test', 'hr'], ['J020003', '示範員工甲', 'a@example.test', 'employee'], ['J020004', '示範系統管理員', 'admin@example.test', 'admin']];
  for (const r of rows) await db.query("INSERT INTO employees (id,name,email,unit_id,role,hired_at) VALUES ($1,$2,$3,'J02',$4,'2024-01-01') ON CONFLICT DO NOTHING", [r[0], r[1], r[2], r[3]]);
  // 直屬主管：員工甲、人資的主管是示範管理者（簽核第一關）；入職日讓特休有天數
  await db.query("UPDATE employees SET manager_id='J020001', hired_at='2023-01-01' WHERE id IN ('J020002','J020003','J020004')");
  await db.query("INSERT INTO offices (name,cidrs) VALUES ('示範辦公室', ARRAY['203.0.113.0/28'])");
}
module.exports = { seed };
if (require.main === module) createDb({ url: process.env.DATABASE_URL, dataDir: process.env.PGLITE_DIR }).then(async db => { await seed(db); console.log('seeded'); await db.close(); });
