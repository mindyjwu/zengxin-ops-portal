-- 時薪制工時由 Portal 用仁寶服務紀錄自己算：需要每位居服員每天每種「加班類型」的分鐘（標籤不含個案資料）、
-- 加班類型標籤歸類（人資歸類，預設規則看不懂的標籤才需要），以及仁寶居服員姓名對應到員工編號（姓名對不到名冊時由人資指定）。

CREATE TABLE svc_worker_day_label (
  month    text NOT NULL REFERENCES svc_month(month) ON DELETE CASCADE,
  worker   text NOT NULL,
  day      date NOT NULL,
  label    text NOT NULL,
  minutes  numeric(10,1) NOT NULL CHECK (minutes >= 0),
  PRIMARY KEY (month, worker, day, label)
);

CREATE TABLE svc_daytype_map (
  label       text PRIMARY KEY CHECK (length(label) BETWEEN 1 AND 40),
  day_type    text NOT NULL CHECK (day_type IN ('weekday','national','rest','statutory')),
  updated_by  text NOT NULL REFERENCES employees(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE svc_name_map (
  worker      text PRIMARY KEY CHECK (length(worker) BETWEEN 1 AND 40),
  emp_no      text NOT NULL CHECK (emp_no ~ '^[A-Za-z0-9_-]{1,20}$'),
  updated_by  text NOT NULL REFERENCES employees(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
