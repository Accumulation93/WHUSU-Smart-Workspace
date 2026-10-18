-- 多岗位导入计划与请求结果；预览不会写入业务表。
CREATE TABLE IF NOT EXISTS hr_import_previews (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  actor_person_id VARCHAR(64) NOT NULL,
  actor_context_id VARCHAR(160) NOT NULL,
  input_json JSON NOT NULL,
  plan_json JSON NOT NULL,
  context_hash CHAR(64) NOT NULL,
  request_id VARCHAR(64) DEFAULT NULL,
  result_json JSON DEFAULT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'preview',
  created_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  UNIQUE KEY uk_hr_import_request (org_id, actor_person_id, request_id),
  KEY idx_hr_import_expiry (expires_at),
  KEY idx_hr_import_owner (org_id, actor_person_id, actor_context_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
