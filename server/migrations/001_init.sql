-- 第一版資料表：員工、公司單位、辦公室網路、打卡、稽核紀錄
CREATE TABLE units (
  id   text PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE employees (
  id        text PRIMARY KEY,            -- 員工編號：公司代號 3 碼 + 流水號 4 碼，例如 J020001
  name      text NOT NULL,
  email     text NOT NULL UNIQUE,        -- Google 登入時用 email 對到員工
  unit_id   text REFERENCES units(id),
  role      text NOT NULL,               -- 對應網站 ROLES 的 key（admin、hr、manager、employee…）
  status    text NOT NULL DEFAULT 'active',
  hired_at  date
);

CREATE TABLE offices (
  id    serial PRIMARY KEY,
  name  text NOT NULL,
  cidrs text[] NOT NULL DEFAULT '{}'     -- 辦公室對外的公網 IP 網段，例如 203.0.113.0/28
);

CREATE TABLE punches (
  id             bigserial PRIMARY KEY,
  emp_id         text NOT NULL REFERENCES employees(id),
  kind           text NOT NULL CHECK (kind IN ('in','out')),
  at             timestamptz NOT NULL DEFAULT now(),   -- 伺服器收到的時間（不能被手機改）
  client_at      timestamptz,                          -- 手機記下的時間（離線補傳時與 at 會有差距）
  offline_queued boolean NOT NULL DEFAULT false,
  ip             text,                                 -- 只有有權限的後台角色看得到
  net_kind       text,                                 -- office / other / unknown
  net_place      text,
  keep_until     date NOT NULL                         -- 勞基法第 30 條：出勤紀錄保存五年
);
CREATE INDEX punches_emp_at ON punches (emp_id, at);

CREATE TABLE audit_log (
  id       bigserial PRIMARY KEY,
  at       timestamptz NOT NULL DEFAULT now(),
  actor_id text,
  action   text NOT NULL,
  target   text,
  detail   jsonb,
  ip       text
);
CREATE INDEX audit_at ON audit_log (at);
