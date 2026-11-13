-- 仅折叠英文字母大小写；其他字符按原字节区分，不沿用忽略重音的排序规则。
-- 名称在写入口统一去首尾空白；在线索引替换不改写已有名称或身份编号。
SET @identity_previous_lock_wait = @@SESSION.lock_wait_timeout;
SET SESSION lock_wait_timeout = 1;
SET @identity_key_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='identities' AND COLUMN_NAME='name_exact_key');
SET @identity_key_sql = IF(@identity_key_exists=0,
  'ALTER TABLE identities ADD COLUMN name_exact_key VARBINARY(400) GENERATED ALWAYS AS (CAST(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(name),''A'',''a''),''B'',''b''),''C'',''c''),''D'',''d''),''E'',''e''),''F'',''f''),''G'',''g''),''H'',''h''),''I'',''i''),''J'',''j''),''K'',''k''),''L'',''l''),''M'',''m''),''N'',''n''),''O'',''o''),''P'',''p''),''Q'',''q''),''R'',''r''),''S'',''s''),''T'',''t''),''U'',''u''),''V'',''v''),''W'',''w''),''X'',''x''),''Y'',''y''),''Z'',''z'') AS BINARY)) VIRTUAL, ALGORITHM=INPLACE, LOCK=NONE',
  'SELECT 1');
PREPARE identity_key_stmt FROM @identity_key_sql;
EXECUTE identity_key_stmt;
DEALLOCATE PREPARE identity_key_stmt;
SET @identity_exact_index = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='identities' AND INDEX_NAME='idx_identity_exact_name');
SET @identity_old_index = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='identities' AND INDEX_NAME='idx_ident_name');
SET @identity_key_sql = IF(@identity_exact_index=0,
  IF(@identity_old_index>0,
    'ALTER TABLE identities ADD UNIQUE INDEX idx_identity_exact_name(org_id,name_exact_key), DROP INDEX idx_ident_name, ALGORITHM=INPLACE, LOCK=NONE',
    'ALTER TABLE identities ADD UNIQUE INDEX idx_identity_exact_name(org_id,name_exact_key), ALGORITHM=INPLACE, LOCK=NONE'),
  'SELECT 1');
PREPARE identity_key_stmt FROM @identity_key_sql;
EXECUTE identity_key_stmt;
DEALLOCATE PREPARE identity_key_stmt;
SET SESSION lock_wait_timeout = @identity_previous_lock_wait;
