-- 假別與合併上限（來源：網站 LEAVE_TYPES／LEAVE_GROUPS，依 104 假勤設定 10/27 更新）
-- cap_scope：year＝每年累計、month＝每月、event＝每次事件（婚假、喪假、產假等）
INSERT INTO leave_groups (code, name, cap_hours) VALUES
  ('sickgrp','病假類',264),
  ('persgrp','事假類',112);

INSERT INTO leave_types (code, name, pay_ratio, quota_days, cap_scope, group_code, designated_only, basis) VALUES
  ('annual','特休',1,NULL,'year',NULL,false,'依年資（勞基法§38）'),
  ('sick','病假',0.5,30,'year','sickgrp',false,'未住院每年 30 日，半薪'),
  ('personal','事假',0,14,'year','persgrp',false,'每年 14 日，不給薪'),
  ('family','家庭照顧假',0,7,'year','persgrp',false,'每年 7 日，併入事假計算'),
  ('menstrual','生理假',0.5,1,'month','sickgrp',false,'每月 1 日'),
  ('comp','補休',1,NULL,'year',NULL,false,'依核准加班時數換休'),
  ('marriage','婚假',1,8,'event',NULL,false,'8 日，給薪'),
  ('bereave1','一類喪假（8 日）',1,8,'event',NULL,false,'每次 8 日，事件發生日起 100 日曆天內'),
  ('bereave2','二類喪假（6 日）',1,6,'event',NULL,false,'每次 6 日，事件發生日起 100 日曆天內'),
  ('bereave3','三類喪假（3 日）',1,3,'event',NULL,false,'每次 3 日，事件發生日起 100 日曆天內'),
  ('maternity','產假（女）',1,56,'event',NULL,false,'每次 56 日，含假日；事件發生日起 3 個月內'),
  ('maternity4','產假 4 週（女）',1,28,'event',NULL,false,'每次 28 日，含假日；事件發生日起 28 日曆天內'),
  ('maternity1','產假 1 週（女）',1,7,'event',NULL,false,'每次 7 日，含假日；事件發生日起 7 日曆天內'),
  ('maternity5','產假 5 日（女）',1,5,'event',NULL,false,'每次 5 日，含假日；事件發生日起 5 日曆天內'),
  ('prenatal','產檢假（女）',1,7,'event',NULL,false,'每次 7 日；事件發生日起 10 個月內'),
  ('paternity','陪產檢及陪產假（男）',1,7,'event',NULL,false,'每次 7 日；事件發生日起 15 日曆天內'),
  ('injury','公傷病假',1,NULL,'year',NULL,false,'無上限，依職災醫療期間'),
  ('official','公假',1,NULL,'year',NULL,false,'依實際需要核給'),
  ('indigenous','歲時祭儀假',1,3,'year',NULL,true,'每年 3 日，每次最少 1 日；只有指定員工（原住民戶籍，名單在 104，原型不放真實名單）'),
  ('companyPersonal','事假（公司給予）',1,15,'year',NULL,true,'每年 15 日（= 120 小時），可用天或小時；只有指定員工（名單在 104）'),
  ('disaster','天災停班',0,NULL,'year',NULL,false,'無上限；停班日依公司公告');
