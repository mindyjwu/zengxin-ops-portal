-- 牛津居家時薪制計薪：規則版本、每月每人的輸入、員工的「較早到職級距」勾選。
-- 規則（級距、倍率、AA、進位）存成有生效月份的版本，改規則不會改到已經算過的月份的歷史版本；沒有任何版本時用程式內的預設值（確認版）。
-- 每月輸入只放計薪需要的分鐘數、次數與金額；工號用文字，因為匯入的牛津工號可能還沒在員工名冊裡。

ALTER TABLE employees ADD COLUMN pay_early_tier boolean NOT NULL DEFAULT false;

CREATE TABLE pay_rule_versions (
  id             bigserial PRIMARY KEY,
  kind           text NOT NULL CHECK (kind = 'oxford_hourly'),
  effective_from text NOT NULL CHECK (effective_from ~ '^\d{4}-\d{2}$'),     -- 這個月起適用
  config         jsonb NOT NULL,
  created_by     text NOT NULL REFERENCES employees(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pay_rule_versions_kind_from ON pay_rule_versions (kind, effective_from, id);

CREATE TABLE pay_hourly_rows (
  month       text NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  emp_no      text NOT NULL CHECK (length(emp_no) BETWEEN 1 AND 20),
  name        text NOT NULL DEFAULT '',
  early       boolean NOT NULL DEFAULT false,                -- 名冊裡沒有這個工號時才用；名冊裡的人看 employees.pay_early_tier
  reg_min     integer NOT NULL DEFAULT 0 CHECK (reg_min >= 0),
  tr_wd       integer NOT NULL DEFAULT 0 CHECK (tr_wd >= 0),
  tr_hol      integer NOT NULL DEFAULT 0 CHECK (tr_hol >= 0),
  tr_nh       integer NOT NULL DEFAULT 0 CHECK (tr_nh >= 0),
  ot          integer[] NOT NULL CHECK (array_length(ot, 1) = 14),
  aa05        integer NOT NULL DEFAULT 0, aa06 integer NOT NULL DEFAULT 0, aa11 integer NOT NULL DEFAULT 0,
  aa_fixed    numeric(12,0) NOT NULL DEFAULT 0,
  rural       numeric(12,0) NOT NULL DEFAULT 0, intro numeric(12,0) NOT NULL DEFAULT 0, open numeric(12,0) NOT NULL DEFAULT 0,
  other       numeric(12,0) NOT NULL DEFAULT 0, short numeric(12,0) NOT NULL DEFAULT 0,
  labor       numeric(12,0) NOT NULL DEFAULT 0, health numeric(12,0) NOT NULL DEFAULT 0, pension numeric(12,0) NOT NULL DEFAULT 0, other_ded numeric(12,0) NOT NULL DEFAULT 0,
  ref_rate    integer,                                        -- 匯入時帶入的總表時薪，用來對帳
  updated_by  text NOT NULL REFERENCES employees(id),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (month, emp_no)
);
