-- 公司與附設機構代號（需求端 10/28 提供）。員工編號 ＝ 單位代號 3 碼 + 流水號 4 碼，例如 J020001
INSERT INTO units (id, name) VALUES
  ('J01','社團法人中華民國誠馨照顧協會'),
  ('J02','社團法人中華民國誠馨照顧協會附設新竹縣私立誠馨綜合式服務類長期照顧服務機構'),
  ('J03','牛津樂活事業股份有限公司'),
  ('J04','牛津樂活事業股份有限公司附設新竹縣私立牛津居家長照機構'),
  ('O01','誠芯樂活事業股份有限公司'),
  ('O02','誠芯樂活事業股份有限公司附設新竹市私立誠芯居家長照機構'),
  ('O03','誠芯樂活事業股份有限公司附設私立誠芯三館綜合長照機構'),
  ('O04','誠馨健康股份有限公司'),
  ('O05','誠馨健康股份有限公司附設私立誠馨二館社區長照機構')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- 舊員編（104 的編號），新舊對照表整理好之後匯入
ALTER TABLE employees ADD COLUMN old_no text;

-- 用 email 登入，email 大小寫不同視為同一個人
CREATE UNIQUE INDEX employees_email_lower ON employees (lower(email));
