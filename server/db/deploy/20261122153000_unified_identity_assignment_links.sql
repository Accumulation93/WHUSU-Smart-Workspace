-- 固定旧管理授权的承接岗位。迁移仅建表，完成新旧核对并验证回退版本后再启用。
CREATE TABLE IF NOT EXISTS authorization_identity_assignment_links (
  org_id VARCHAR(64) NOT NULL,
  admin_grant_id VARCHAR(64) NOT NULL,
  assignment_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (org_id, admin_grant_id, assignment_id),
  KEY idx_authorization_identity_assignment (org_id, assignment_id, admin_grant_id),
  CONSTRAINT fk_authorization_identity_grant FOREIGN KEY (admin_grant_id)
    REFERENCES admin_grants(id) ON DELETE CASCADE,
  CONSTRAINT fk_authorization_identity_assignment FOREIGN KEY (assignment_id)
    REFERENCES membership_assignments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS authorization_identity_stage (
  id TINYINT NOT NULL PRIMARY KEY,
  comparison_digest CHAR(64) NOT NULL,
  staged_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
