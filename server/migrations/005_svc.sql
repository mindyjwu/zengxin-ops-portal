-- 仁寶服務紀錄的彙總（居家服務）。
-- 原則：個案姓名、身分證字號、案號都不進資料庫。瀏覽器讀檔後只送彙總：每位居服員每天的服務分鐘、
-- 每位居服員每個服務項目的次數與金額、每個月的人數與工時。匯入同一個月會取代舊的（匯入紀錄留著）。

CREATE TABLE svc_imports (
  id           bigserial PRIMARY KEY,
  imported_by  text NOT NULL REFERENCES employees(id),
  imported_at  timestamptz NOT NULL DEFAULT now(),
  source_name  text,
  date_from    date,
  date_to      date,
  rows         integer NOT NULL CHECK (rows >= 0),
  skipped      integer NOT NULL DEFAULT 0,
  cases        integer NOT NULL DEFAULT 0,
  odd          jsonb,                          -- 忘簽退、服務未遇、遲到、時數不足、時數為 0 的筆數（整份檔案）
  no_price     integer NOT NULL DEFAULT 0,
  keep_until   date NOT NULL                   -- 保存五年
);

CREATE TABLE svc_month (
  month      text PRIMARY KEY CHECK (month ~ '^\d{4}-\d{2}$'),
  import_id  bigint NOT NULL REFERENCES svc_imports(id),
  cases      integer NOT NULL,                 -- 當月實際使用服務的人數（不重複）
  rows       integer NOT NULL,
  minutes    numeric(12,1) NOT NULL,
  workers    integer NOT NULL
);

CREATE TABLE svc_month_unit (
  month      text NOT NULL REFERENCES svc_month(month) ON DELETE CASCADE,
  unit       text NOT NULL,
  cases      integer NOT NULL,
  rows       integer NOT NULL,
  minutes    numeric(12,1) NOT NULL,
  workers    integer NOT NULL,
  PRIMARY KEY (month, unit)
);

CREATE TABLE svc_worker_day (
  month      text NOT NULL REFERENCES svc_month(month) ON DELETE CASCADE,
  worker     text NOT NULL,
  day        date NOT NULL,
  minutes    numeric(10,1) NOT NULL CHECK (minutes >= 0),
  PRIMARY KEY (worker, day)
);
CREATE INDEX svc_worker_day_month ON svc_worker_day (month, day);

CREATE TABLE svc_worker_item (
  month      text NOT NULL REFERENCES svc_month(month) ON DELETE CASCADE,
  worker     text NOT NULL,
  code       text NOT NULL,
  item_name  text NOT NULL,
  n          numeric(10,1) NOT NULL CHECK (n >= 0),
  n_holiday  numeric(10,1) NOT NULL CHECK (n_holiday >= 0),
  minutes    numeric(12,1) NOT NULL DEFAULT 0 CHECK (minutes >= 0),
  amount     numeric(12,1) NOT NULL CHECK (amount >= 0),     -- 政府單價 × 次數
  PRIMARY KEY (month, worker, code)
);

CREATE TABLE svc_worker_month (
  month        text NOT NULL REFERENCES svc_month(month) ON DELETE CASCADE,
  worker       text NOT NULL,
  amount       numeric(12,1) NOT NULL,
  remote_cases integer NOT NULL DEFAULT 0,                   -- 服務偏遠區（五峰、尖石、關西、峨眉）的個案數
  PRIMARY KEY (month, worker)
)
