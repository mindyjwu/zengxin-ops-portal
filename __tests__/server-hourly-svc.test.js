/** 時薪制工時由 Portal 用仁寶服務紀錄自己算：一天怎麼切小時、日別歸類、姓名對應、寫入時保留人工項目、權限與稽核。 */
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createDb } = require('../server/db');
const { createApp } = require('../server/app');
const { seed } = require('../server/seed');
const S = require('../server/hourly-split');

const win = {}; new Function('window', fs.readFileSync(path.resolve(__dirname, '../web/svc-parse.js'), 'utf8'))(win);
const { svcAggregate, toPayload } = win.SvcParse;
const HEAD = ['案號', '服務項目代碼', '服務項目類別', '項目服務次數', '居服員姓名', '服務日期', '服務時間長度(分)', '項目單價', '加班類型', '居住(區)', '服務單位', '服務狀態'];
const line = (who, day, min, type = '正常班', code = 'BA20', n = '1') => ['C-' + who + day + min + type + code, code, '陪伴服務', n, who, day, String(min), '175', type, '竹北市', '機構一', '已簽退'];

describe('splitting a day into hours (pure rules)', () => {
  test('weekday: the first 8 hours are base pay, then 9–10 and 11–12; beyond 12 is reported, not paid', () => {
    expect(S.splitDay('weekday', 7 * 60)).toMatchObject({ reg: 420, over: 0 });
    expect(S.splitDay('weekday', 9 * 60)).toMatchObject({ reg: 480, ot: [60, ...Array(13).fill(0)], over: 0 });
    const d = S.splitDay('weekday', 13 * 60); expect([d.reg, d.ot[0], d.ot[1], d.over]).toEqual([480, 120, 120, 60]);
  });
  test('holidays and rest days count from hour 0: 0–2, 3–8, 9–10, 11–12', () => {
    expect(S.splitDay('national', 3 * 60).ot.slice(2, 6)).toEqual([120, 60, 0, 0]);
    expect(S.splitDay('rest', 10 * 60).ot.slice(6, 10)).toEqual([120, 360, 120, 0]);
    expect(S.splitDay('statutory', 12 * 60).ot.slice(10, 14)).toEqual([120, 360, 120, 120]);
    expect(S.splitDay('national', 12 * 60 + 5).over).toBe(5);
    expect(S.splitDay('rest', 0)).toMatchObject({ reg: 0, over: 0 });
  });
  test('labels: the HR table wins, the default rules read common words, and unknown labels are not guessed', () => {
    expect(['正常班', '國定假日加班', '例假日', '休息日加班', '平日加班'].map(l => S.classifyLabel(l))).toEqual(['weekday', 'national', 'statutory', 'rest', 'weekday']);
    expect(S.classifyLabel('神秘班')).toBeNull();
    expect(S.classifyLabel('神秘班', new Map([['神秘班', 'rest']]))).toBe('rest');
    expect(S.classifyLabel('正常班', new Map([['正常班', 'rest']]))).toBe('rest');
  });
  test('a month: mixed labels on one day use the special day type and are reported; unclassified minutes are left out', () => {
    const m = S.splitMonth({ '2026-10-05': { 正常班: 300, 休息日加班: 60 }, '2026-10-06': { 國定假日加班: 200, 神秘班: 30 } });
    expect(m.ot.slice(2, 10)).toEqual([120, 80, 0, 0, 120, 240, 0, 0]);
    expect(m.mixed).toEqual([{ day: '2026-10-05', types: expect.arrayContaining(['平日', '休息日']) }]);
    expect(m.unclassified).toEqual({ 神秘班: 30 });
    expect(m.reg).toBe(0);
  });
  test('minutes are rounded to whole minutes only at the end of the month', () => {
    const m = S.splitMonth({ '2026-10-05': { 正常班: 10.4 }, '2026-10-06': { 正常班: 10.4 }, '2026-10-07': { 正常班: 10.4 } });
    expect(m.reg).toBe(31);                                   // 31.2 → 31（每天先取整會變成 30）
  });
});

let db, app;
beforeAll(async () => {
  db = await createDb(); await seed(db);
  for (const [id, name, email, role] of [['J020022', '測試員甲', 'jia@example.test', 'hca'], ['J020023', '重名員', 'dup1@example.test', 'hca'], ['J020024', '重名員', 'dup2@example.test', 'hca']])
    await db.query("INSERT INTO employees (id,name,email,unit_id,role) VALUES ($1,$2,$3,'J02',$4)", [id, name, email, role]);
  app = createApp({ db, verifyGoogle: async () => ({}), config: { sessionSecret: 'test-secret-test-secret-test-secret-00', devLogin: true } });
});
afterAll(async () => { await db.close(); });
const as = async email => { const a = request.agent(app); expect((await a.post('/auth/dev-login').send({ email })).status).toBe(200); return a; };
const U = '/api/pay/hourly';
const importSvc = async (rows, strip) => {
  const g = svcAggregate([HEAD, ...rows]); expect(g.fatal).toBeUndefined();
  const p = toPayload(g, 'oct.csv'); if (strip) Object.values(p.who).forEach(w => { delete w.byLabel; });
  const mgr = await as('manager@example.test'); expect((await mgr.post('/api/svc/imports').send(p)).status).toBe(201);
};

describe('compute the minutes from the 仁寶 import', () => {
  test('months without 加班類型 data (imported before this feature) say so', async () => {
    await importSvc([line('測試員甲', '2026-05-04', 60)], true);
    const hr = await as('hr@example.test'); const r = await hr.get(U + '/from-svc?month=2026-05');
    expect([r.status, r.body.error]).toEqual([404, 'no_label_data']);
    expect((await hr.get(U + '/from-svc?month=2026-04')).body.error).toBe('no_svc_data');
  });

  test('preview, name matching, writing keeps manual items, unclassified labels need HR', async () => {
    const hr = await as('hr@example.test'), mgr = await as('manager@example.test');
    await importSvc([
      line('測試員甲', '2026-10-05', 240), line('測試員甲', '2026-10-05', 240), line('測試員甲', '2026-10-05', 60),     // 週一 9 小時：本薪 480、第 9–10 小時 60
      line('測試員甲', '2026-10-10', 600, '休息日加班'),                                                           // 休息日 10 小時：120、360、120
      line('測試員甲', '2026-10-11', 90, '國定假日加班'),
      line('測試員甲', '2026-10-12', 30, '神秘班'),                                                               // 不認得的標籤
      line('測試員甲', '2026-10-13', 800),                                                                        // 平日 13 小時 20 分：超過 12 小時的 80 分鐘不計
      line('測試員甲', '2026-10-14', 60, '正常班', 'AA05', '2'), line('測試員甲', '2026-10-15', 60, '正常班', 'AA11', '3'),
      line('外部員', '2026-10-05', 120), line('重名員', '2026-10-05', 120)]);
    expect((await mgr.get(U + '/from-svc?month=2026-10')).status).toBe(403);                                        // 管理者只能看結果，不能用
    const pv = (await hr.get(U + '/from-svc?month=2026-10')).body, by = n => pv.people.find(p => p.worker === n);
    expect(by('測試員甲')).toMatchObject({ match: { status: 'matched', empNo: 'J020022' }, regMin: 480 + 480 + 60 + 60, over: [{ day: '2026-10-13', minutes: 80 }] });
    expect(by('測試員甲').ot).toEqual([60 + 120, 120, 90, 0, 0, 0, 120, 360, 120, 0, 0, 0, 0, 0]);                   // 平日 9–10 小時：10/5 的 60 ＋ 10/13 的 120
    expect(by('外部員').match.status).toBe('unmatched'); expect(by('重名員').match.status).toBe('ambiguous');
    expect(pv.unclassified).toEqual([{ label: '神秘班', minutes: 30 }]);
    expect(by('測試員甲').aa05).toBe(0);                                                                           // 沒勾選就不帶 AA
    // 先有人工輸入的資料：轉場、代扣不能被蓋掉
    await hr.post(U + '/rows').send({ month: '2026-10', mode: 'replace', rows: [{ empNo: 'J020022', name: '測試員甲', early: true, regMin: 1, trWd: 1200, ot: Array(14).fill(0), rural: 600, labor: 600, health: 400 }] });
    let w = await hr.post(U + '/from-svc').send({ month: '2026-10' });
    expect(w.status).toBe(201); expect(w.body.written).toBe(1);
    expect(w.body.skipped.map(s => s.worker).sort()).toEqual(['外部員', '重名員'].sort());
    let res = (await hr.get(U + '/results?month=2026-10')).body.people.find(p => p.empNo === 'J020022');
    expect(res).toMatchObject({ regMin: 1080, trWd: 1200, rural: 600, labor: 600, health: 400, early: true });          // 分鐘換成算出來的，其他保留
    expect(res.ot[0]).toBe(180);
    // 歸類「神秘班」為休息日、指定外部員的員編、帶入 AA
    expect((await hr.put(U + '/daytype-map').send({ label: '神秘班', type: 'rest' })).status).toBe(200);
    expect((await hr.put(U + '/daytype-map').send({ label: '神秘班', type: 'not-a-type' })).status).toBe(400);
    expect((await hr.put(U + '/name-map').send({ worker: '外部員', empNo: 'OX0002' })).status).toBe(200);
    expect((await hr.put(U + '/name-map').send({ worker: '外部員', empNo: 'bad id!' })).status).toBe(400);
    const pv2 = (await hr.get(U + '/from-svc?month=2026-10&withAA=1')).body;
    expect(pv2.unclassified).toEqual([]);
    expect(pv2.people.find(p => p.worker === '外部員').match).toEqual({ status: 'mapped', empNo: 'OX0002' });
    const jia = pv2.people.find(p => p.worker === '測試員甲'); expect(jia).toMatchObject({ aa05: 2, aa11: 3 });
    expect(jia.ot[6]).toBe(120 + 30);                                                                              // 10/12 神秘班 30 分鐘歸為休息日 → 休息日第 0–2 小時再加 30
    w = await hr.post(U + '/from-svc').send({ month: '2026-10', withAA: true });
    expect(w.body.written).toBe(2);
    res = (await hr.get(U + '/results?month=2026-10')).body.people;
    expect(res.find(p => p.empNo === 'J020022')).toMatchObject({ aa05: 2, aa11: 3, trWd: 1200 });
    expect(res.find(p => p.empNo === 'OX0002')).toMatchObject({ name: '外部員', regMin: 120 });
    // 刪除歸類與對應
    expect((await hr.put(U + '/daytype-map').send({ label: '神秘班', type: null })).status).toBe(200);
    expect((await hr.put(U + '/name-map').send({ worker: '外部員', empNo: '' })).status).toBe(200);
    expect((await hr.get(U + '/from-svc?month=2026-10')).body.unclassified).toHaveLength(1);
    const audits = (await db.query("SELECT action FROM audit_log WHERE action LIKE 'pay_from_svc%' OR action LIKE 'svc_%map'")).rows.map(r => r.action);
    expect(audits).toEqual(expect.arrayContaining(['pay_from_svc_preview', 'pay_from_svc_write', 'svc_daytype_map', 'svc_name_map']));
  });

  test('two 仁寶 names that resolve to the same employee number are refused, not merged', async () => {
    const hr = await as('hr@example.test');
    await importSvc([line('甲先生', '2026-09-07', 60), line('甲先生2', '2026-09-07', 60)]);
    await hr.put(U + '/name-map').send({ worker: '甲先生', empNo: 'OX0100' }); await hr.put(U + '/name-map').send({ worker: '甲先生2', empNo: 'OX0100' });
    const r = await hr.post(U + '/from-svc').send({ month: '2026-09' });
    expect(r.status).toBe(409); expect(r.body).toMatchObject({ error: 'same_emp_no_twice', empNo: 'OX0100' });
    expect((await hr.get(U + '/results?month=2026-09')).status).toBe(404);                                         // 什麼都沒寫
  });

  test('nobody matched, bad months and non-HR roles', async () => {
    const hr = await as('hr@example.test'), emp = await as('a@example.test');
    await importSvc([line('沒人認識', '2026-08-03', 60)]);
    expect((await hr.post(U + '/from-svc').send({ month: '2026-08' })).body.error).toBe('nobody_matched');
    expect((await hr.get(U + '/from-svc?month=oct')).status).toBe(400);
    expect((await emp.get(U + '/from-svc?month=2026-08')).status).toBe(403);
    expect((await emp.put(U + '/name-map').send({ worker: 'x', empNo: 'Y' })).status).toBe(403);
    expect((await emp.put(U + '/daytype-map').send({ label: 'x', type: 'rest' })).status).toBe(403);
  });
});
