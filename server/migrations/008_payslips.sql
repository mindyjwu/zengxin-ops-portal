-- 薪資單：每月「發布並鎖定」。發布時把每個人的薪資單存成快照（之後改規則、改勾選都不會改到已發布的數字），
-- 要修改必須由人資「退回」並寫原因；再次發布會是新的版本，舊版本留著。
-- 員工只能看到自己、而且已發布的月份（工號＝員工編號）。

CREATE TABLE pay_hourly_months (
  month         text PRIMARY KEY CHECK (month ~ '^\d{4}-\d{2}$'),
  status        text NOT NULL CHECK (status IN ('draft','published')),
  version       integer NOT NULL DEFAULT 0,          -- 目前（或最後一次）發布的版本
  changed_by    text NOT NULL REFERENCES employees(id),
  changed_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pay_hourly_slips (
  month         text NOT NULL,
  version       integer NOT NULL,
  emp_no        text NOT NULL,
  slip          jsonb NOT NULL,
  PRIMARY KEY (month, version, emp_no)
);
CREATE INDEX pay_hourly_slips_emp ON pay_hourly_slips (emp_no, month);

CREATE TABLE pay_month_events (
  id            bigserial PRIMARY KEY,
  month         text NOT NULL,
  action        text NOT NULL CHECK (action IN ('publish','reopen')),
  version       integer NOT NULL,
  reason        text,
  detail        jsonb,
  by_id         text NOT NULL REFERENCES employees(id),
  at            timestamptz NOT NULL DEFAULT now()
);
