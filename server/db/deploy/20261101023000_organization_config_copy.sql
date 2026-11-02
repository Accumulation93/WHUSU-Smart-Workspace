-- 配置分享与接收草稿独立存储，不直接写入生效业务规则。
CREATE TABLE IF NOT EXISTS organization_config_shares (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  source_org_id VARCHAR(64) NOT NULL,
  target_org_id VARCHAR(64) NOT NULL,
  kind VARCHAR(64) NOT NULL,
  source_record_id VARCHAR(64) NOT NULL,
  payload_json JSON NOT NULL,
  payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  enabled TINYINT NOT NULL DEFAULT 1,
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  created_by_context_id VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_config_share_target (target_org_id, enabled, kind),
  KEY idx_config_share_source (source_org_id, kind, source_record_id),
  CONSTRAINT fk_config_share_source FOREIGN KEY (source_org_id) REFERENCES organizations(id),
  CONSTRAINT fk_config_share_target FOREIGN KEY (target_org_id) REFERENCES organizations(id),
  CONSTRAINT chk_config_share_enabled CHECK (enabled IN (0, 1)),
  CONSTRAINT chk_config_share_orgs CHECK (source_org_id <> target_org_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS organization_config_copy_drafts (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  share_id VARCHAR(64) NOT NULL,
  share_version BIGINT UNSIGNED NOT NULL,
  kind VARCHAR(64) NOT NULL,
  payload_json JSON NOT NULL,
  payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  state VARCHAR(16) NOT NULL DEFAULT 'draft',
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  result_id VARCHAR(64) NULL,
  application_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  request_id VARCHAR(64) NOT NULL,
  created_by_context_id VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_copy_draft_request (org_id, request_id),
  KEY idx_copy_draft_org (org_id, state, created_at),
  KEY idx_copy_draft_share (share_id),
  CONSTRAINT fk_config_draft_org FOREIGN KEY (org_id) REFERENCES organizations(id),
  CONSTRAINT fk_config_draft_share FOREIGN KEY (share_id) REFERENCES organization_config_shares(id),
  CONSTRAINT chk_config_draft_state CHECK (state IN ('draft', 'applied'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS organization_config_copy_changes (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  org_id VARCHAR(64) NOT NULL,
  actor_context_id VARCHAR(64) NOT NULL,
  action VARCHAR(32) NOT NULL,
  target_id VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_copy_change_org (org_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
