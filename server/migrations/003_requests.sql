-- 請假、加班、補打卡與簽核。
-- 設計重點：
--  * 三種申請共用一張 requests（身分、狀態、事由、保存期限），各自的細節放在專屬明細表
--  * 簽核紀錄 approvals 只能新增、不能改或刪（觸發器擋住），誰在什麼時間做了什麼永遠查得到
--  * 狀態只能照規定的路徑走，非法跳躍連資料庫都不允許
--  * 同一人的請假時間不能重疊（觸發器檢查）

ALTER TABLE employees ADD COLUMN manager_id text REFERENCES employees(id);   -- 直屬主管，簽核第一關
ALTER TABLE punches   ADD COLUMN source text NOT NULL DEFAULT 'app' CHECK (source IN ('app','fix'));   -- fix＝補打卡核准後補進來

CREATE TABLE leave_groups (
  code      text PRIMARY KEY,
  name      text NOT NULL,
  cap_hours numeric(6,1) NOT NULL CHECK (cap_hours > 0)
);

CREATE TABLE leave_types (
  code            text PRIMARY KEY,
  name            text NOT NULL,
  pay_ratio       numeric(3,2) NOT NULL CHECK (pay_ratio BETWEEN 0 AND 1),   -- 1 給薪、0.5 半薪、0 不給薪
  quota_days      numeric(5,1),                                             -- 空白＝另外計算（特休看年資、補休看加班）或不設上限
  cap_scope       text NOT NULL DEFAULT 'year' CHECK (cap_scope IN ('year','month','event')),
  group_code      text REFERENCES leave_groups(code),
  designated_only boolean NOT NULL DEFAULT false,                           -- 只有指定員工可用（歲時祭儀假、公司給予事假）
  basis           text,
  active          boolean NOT NULL DEFAULT true
);

CREATE TABLE requests (
  id            bigserial PRIMARY KEY,
  kind          text NOT NULL CHECK (kind IN ('leave','overtime','punch_fix')),
  emp_id        text NOT NULL REFERENCES employees(id),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','countersign','approved','rejected','cancelled','withdrawn')),
  reason        text,
  attachment_key text,                                                       -- 附件在雲端儲存空間的位置（診斷證明等）
  filed_at      timestamptz NOT NULL DEFAULT now(),
  keep_until    date NOT NULL                                                -- 保存五年
);
CREATE INDEX requests_emp ON requests (emp_id, filed_at);
CREATE INDEX requests_open ON requests (status) WHERE status IN ('pending','countersign');

CREATE TABLE leave_requests (
  request_id bigint PRIMARY KEY REFERENCES requests(id),
  leave_type text NOT NULL REFERENCES leave_types(code),
  start_at   timestamptz NOT NULL,
  end_at     timestamptz NOT NULL,
  hours      numeric(5,1) NOT NULL,
  CHECK (end_at > start_at),
  CHECK (hours > 0),
  CHECK (hours * 2 = trunc(hours * 2))                                      -- 0.5 小時為單位
);
CREATE INDEX leave_range ON leave_requests (start_at, end_at);

CREATE TABLE overtime_requests (
  request_id bigint PRIMARY KEY REFERENCES requests(id),
  work_date  date NOT NULL,
  start_time time NOT NULL,
  end_time   time NOT NULL,
  hours      numeric(4,1) NOT NULL,
  comp       text NOT NULL CHECK (comp IN ('pay','comp')),                  -- 換加班費或換補休
  CHECK (hours > 0 AND hours <= 12),
  CHECK (hours * 2 = trunc(hours * 2))
);

CREATE TABLE punch_fix_requests (
  request_id bigint PRIMARY KEY REFERENCES requests(id),
  fix_date   date NOT NULL,
  punch_kind text NOT NULL CHECK (punch_kind IN ('in','out')),
  fix_time   time NOT NULL
);

CREATE TABLE approvals (
  id         bigserial PRIMARY KEY,
  request_id bigint NOT NULL REFERENCES requests(id),
  step       text NOT NULL CHECK (step IN ('applicant','manager','hr')),
  action     text NOT NULL CHECK (action IN ('submit','approve','reject','withdraw','cancel')),
  actor_id   text NOT NULL REFERENCES employees(id),
  comment    text,
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX approvals_request ON approvals (request_id, at);

-- 簽核紀錄只能新增
CREATE FUNCTION approvals_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'approvals are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER approvals_no_change BEFORE UPDATE OR DELETE ON approvals FOR EACH ROW EXECUTE FUNCTION approvals_append_only();

-- 狀態只能走：待主管 → 待人資 → 核准；任何待簽階段可駁回或抽單；核准後可銷假
CREATE FUNCTION requests_status_guard() RETURNS trigger AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NOT (
       (OLD.status = 'pending'     AND NEW.status IN ('countersign','rejected','withdrawn'))
    OR (OLD.status = 'countersign' AND NEW.status IN ('approved','rejected','withdrawn'))
    OR (OLD.status = 'approved'    AND NEW.status = 'cancelled')
  ) THEN
    RAISE EXCEPTION 'illegal status change % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER requests_status_guard BEFORE UPDATE OF status ON requests FOR EACH ROW EXECUTE FUNCTION requests_status_guard();

-- 同一人在「進行中」的請假（待簽、已核准）時間不能重疊
CREATE FUNCTION leave_no_overlap() RETURNS trigger AS $$
DECLARE who text;
BEGIN
  SELECT emp_id INTO who FROM requests WHERE id = NEW.request_id;
  IF EXISTS (
    SELECT 1 FROM leave_requests l JOIN requests r ON r.id = l.request_id
    WHERE r.emp_id = who AND r.status IN ('pending','countersign','approved')
      AND l.request_id <> NEW.request_id
      AND tstzrange(l.start_at, l.end_at) && tstzrange(NEW.start_at, NEW.end_at)
  ) THEN
    RAISE EXCEPTION 'leave overlaps an existing request';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER leave_no_overlap BEFORE INSERT ON leave_requests FOR EACH ROW EXECUTE FUNCTION leave_no_overlap();
