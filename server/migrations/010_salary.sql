-- 月薪制的薪資資料：每位同仁的底薪與專業加給，有生效日（精確到日，月中調薪之後可按天數分攤）。
-- 只能新增、不能改、不能刪（資料庫觸發器擋住）：打錯了就在同一個生效日新增一筆「更正」並寫原因，同一生效日以最新一筆為準。
-- 每一筆都留下是誰、什麼時候、為什麼。

CREATE TABLE pay_salary_entries (
  id                      bigserial PRIMARY KEY,
  emp_no                  text NOT NULL REFERENCES employees(id),
  effective_from          date NOT NULL,
  base_salary             numeric(12,0) NOT NULL CHECK (base_salary >= 0),
  professional_allowance  numeric(12,0) NOT NULL DEFAULT 0 CHECK (professional_allowance >= 0),
  kind                    text NOT NULL CHECK (kind IN ('hire','raise','correction','import')),
  corrects_id             bigint REFERENCES pay_salary_entries(id),
  reason                  text NOT NULL CHECK (length(btrim(reason)) >= 2),
  created_by              text NOT NULL REFERENCES employees(id),
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pay_salary_entries_emp ON pay_salary_entries (emp_no, effective_from, id);

CREATE FUNCTION pay_salary_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'salary entries are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER pay_salary_no_change BEFORE UPDATE OR DELETE ON pay_salary_entries FOR EACH ROW EXECUTE FUNCTION pay_salary_append_only();
