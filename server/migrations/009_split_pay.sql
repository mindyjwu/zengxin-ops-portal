-- 拆帳制搬到後端，並把「每月發布並鎖定、薪資單快照、發布與退回事件」做成各種計薪方式共用：
-- 表名去掉 hourly，三張表都加 kind（oxford_hourly、split；之後月薪制也用同一套）。

ALTER TABLE pay_hourly_months RENAME TO pay_months;
ALTER TABLE pay_months ADD COLUMN kind text NOT NULL DEFAULT 'oxford_hourly' CHECK (kind IN ('oxford_hourly','split'));
ALTER TABLE pay_months DROP CONSTRAINT pay_hourly_months_pkey;
ALTER TABLE pay_months ADD PRIMARY KEY (kind, month);

ALTER TABLE pay_hourly_slips RENAME TO pay_slips;
ALTER TABLE pay_slips ADD COLUMN kind text NOT NULL DEFAULT 'oxford_hourly' CHECK (kind IN ('oxford_hourly','split'));
ALTER TABLE pay_slips DROP CONSTRAINT pay_hourly_slips_pkey;
ALTER TABLE pay_slips ADD PRIMARY KEY (kind, month, version, emp_no);
DROP INDEX pay_hourly_slips_emp;
CREATE INDEX pay_slips_emp ON pay_slips (emp_no, month);

ALTER TABLE pay_month_events ADD COLUMN kind text NOT NULL DEFAULT 'oxford_hourly' CHECK (kind IN ('oxford_hourly','split'));

ALTER TABLE pay_rule_versions DROP CONSTRAINT pay_rule_versions_kind_check;
ALTER TABLE pay_rule_versions ADD CONSTRAINT pay_rule_versions_kind_check CHECK (kind IN ('oxford_hourly','split'));

-- 拆帳制每月輸入：方案（A 一般居服員、B 日照司機，空白＝依身分預設）、各項加項與扣項（金額，正數）
CREATE TABLE pay_split_rows (
  month       text NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  emp_no      text NOT NULL CHECK (length(emp_no) BETWEEN 1 AND 20),
  name        text NOT NULL DEFAULT '',
  plan        text CHECK (plan IN ('A','B')),
  extras      jsonb NOT NULL DEFAULT '{}',           -- { 加扣項代碼: 金額 }；哪些是加項、哪些是扣項由規則版本決定
  updated_by  text NOT NULL REFERENCES employees(id),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (month, emp_no)
);
