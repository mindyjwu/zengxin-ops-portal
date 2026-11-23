-- 附件（診斷證明、政府公告 PDF 原始檔等）：檔案本身放在檔案儲存層（server/storage.js；正式環境是 Cloud Storage），
-- 這裡只記「誰在什麼時候傳了什麼、雜湊值是多少、放在哪裡」。
-- 原則：不能改內容、不能刪列；「刪除」只是標記（deleted_at），檔案保留到保存期限，因為個資保存與刪除政策還待確認。

CREATE TABLE attachments (
  id            bigserial PRIMARY KEY,
  owner_kind    text NOT NULL CHECK (owner_kind IN ('request','biz_request','insurance_notice')),
  owner_id      text NOT NULL,
  storage_key   text NOT NULL UNIQUE,
  filename      text NOT NULL CHECK (length(filename) BETWEEN 1 AND 160),
  content_type  text NOT NULL,
  size_bytes    integer NOT NULL CHECK (size_bytes > 0),
  sha256        text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by   text NOT NULL REFERENCES employees(id),
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  keep_until    date NOT NULL,
  deleted_at    timestamptz,
  deleted_by    text REFERENCES employees(id)
);
CREATE INDEX attachments_owner ON attachments (owner_kind, owner_id) WHERE deleted_at IS NULL;

CREATE FUNCTION attachments_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'attachments cannot be deleted'; END IF;
  IF OLD.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'attachment already deleted'; END IF;
  IF NEW.id <> OLD.id OR NEW.owner_kind <> OLD.owner_kind OR NEW.owner_id <> OLD.owner_id OR NEW.storage_key <> OLD.storage_key
     OR NEW.filename <> OLD.filename OR NEW.content_type <> OLD.content_type OR NEW.size_bytes <> OLD.size_bytes OR NEW.sha256 <> OLD.sha256
     OR NEW.uploaded_by <> OLD.uploaded_by OR NEW.uploaded_at <> OLD.uploaded_at OR NEW.keep_until <> OLD.keep_until THEN
    RAISE EXCEPTION 'attachments are immutable (only deletion marks can be set)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER attachments_guard BEFORE UPDATE OR DELETE ON attachments FOR EACH ROW EXECUTE FUNCTION attachments_guard();
