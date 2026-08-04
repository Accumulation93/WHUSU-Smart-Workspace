CREATE TABLE IF NOT EXISTS identity_migration_guards (
  guard_key VARCHAR(64) NOT NULL PRIMARY KEY,
  guard_value TINYINT NOT NULL,
  checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_identity_migration_guard CHECK (guard_value = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO identity_migration_guards (guard_key, guard_value)
SELECT 'student_id_name_consistency',
       CASE WHEN EXISTS (
         SELECT 1
           FROM hr_info
          WHERE TRIM(student_id) <> '' AND TRIM(name) <> ''
          GROUP BY LOWER(TRIM(student_id))
         HAVING COUNT(DISTINCT TRIM(name)) > 1
       ) THEN 0 ELSE 1 END
ON DUPLICATE KEY UPDATE guard_value = VALUES(guard_value), checked_at = CURRENT_TIMESTAMP;

INSERT INTO identity_migration_guards (guard_key, guard_value)
SELECT 'person_single_wechat',
       CASE WHEN EXISTS (
         SELECT 1
           FROM (
             SELECT CONVERT(LOWER(TRIM(h.student_id)) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS student_key,
                    CONVERT(ui.openid USING utf8mb4) COLLATE utf8mb4_unicode_ci AS openid
               FROM user_info ui
               JOIN hr_info h
                 ON CONVERT(h.id USING utf8mb4) COLLATE utf8mb4_unicode_ci =
                    CONVERT(ui.hr_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
                AND CONVERT(h.org_id USING utf8mb4) COLLATE utf8mb4_unicode_ci =
                    CONVERT(ui.org_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
              WHERE TRIM(ui.openid) <> '' AND TRIM(h.student_id) <> ''
             UNION ALL
             SELECT CONVERT(LOWER(TRIM(a.student_id)) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS student_key,
                    CONVERT(a.openid USING utf8mb4) COLLATE utf8mb4_unicode_ci AS openid
               FROM admin_info a
              WHERE TRIM(COALESCE(a.openid, '')) <> ''
                AND TRIM(COALESCE(a.student_id, '')) <> ''
           ) identity_bindings
          GROUP BY student_key
         HAVING COUNT(DISTINCT openid) > 1
       ) THEN 0 ELSE 1 END
ON DUPLICATE KEY UPDATE guard_value = VALUES(guard_value), checked_at = CURRENT_TIMESTAMP;

INSERT INTO identity_migration_guards (guard_key, guard_value)
SELECT 'wechat_single_person',
       CASE WHEN EXISTS (
         SELECT 1
           FROM (
             SELECT CONVERT(ui.openid USING utf8mb4) COLLATE utf8mb4_unicode_ci AS openid,
                    CONVERT(LOWER(TRIM(h.student_id)) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS student_key
               FROM user_info ui
               JOIN hr_info h
                 ON CONVERT(h.id USING utf8mb4) COLLATE utf8mb4_unicode_ci =
                    CONVERT(ui.hr_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
                AND CONVERT(h.org_id USING utf8mb4) COLLATE utf8mb4_unicode_ci =
                    CONVERT(ui.org_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
              WHERE TRIM(ui.openid) <> '' AND TRIM(h.student_id) <> ''
             UNION ALL
             SELECT CONVERT(a.openid USING utf8mb4) COLLATE utf8mb4_unicode_ci AS openid,
                    CONVERT(LOWER(TRIM(a.student_id)) USING utf8mb4) COLLATE utf8mb4_unicode_ci AS student_key
               FROM admin_info a
              WHERE TRIM(COALESCE(a.openid, '')) <> ''
                AND TRIM(COALESCE(a.student_id, '')) <> ''
           ) identity_bindings
          GROUP BY openid
         HAVING COUNT(DISTINCT student_key) > 1
       ) THEN 0 ELSE 1 END
ON DUPLICATE KEY UPDATE guard_value = VALUES(guard_value), checked_at = CURRENT_TIMESTAMP;

INSERT INTO identity_migration_guards (guard_key, guard_value)
SELECT 'admin_person_mapping',
       CASE WHEN EXISTS (
         SELECT 1
           FROM admin_info a
          WHERE TRIM(COALESCE(a.student_id, '')) = ''
             OR TRIM(a.name) = ''
             OR NOT EXISTS (
               SELECT 1
                 FROM hr_info h
                WHERE CONVERT(LOWER(TRIM(h.student_id)) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
                      CONVERT(LOWER(TRIM(a.student_id)) USING utf8mb4) COLLATE utf8mb4_unicode_ci
                  AND CONVERT(TRIM(h.name) USING utf8mb4) COLLATE utf8mb4_unicode_ci =
                      CONVERT(TRIM(a.name) USING utf8mb4) COLLATE utf8mb4_unicode_ci
             )
       ) THEN 0 ELSE 1 END
ON DUPLICATE KEY UPDATE guard_value = VALUES(guard_value), checked_at = CURRENT_TIMESTAMP;

INSERT INTO identity_migration_guards (guard_key, guard_value)
SELECT 'membership_uniqueness',
       CASE WHEN EXISTS (
         SELECT 1
           FROM hr_info
          WHERE TRIM(student_id) <> ''
          GROUP BY LOWER(TRIM(student_id)), org_id
         HAVING COUNT(*) > 1
       ) THEN 0 ELSE 1 END
ON DUPLICATE KEY UPDATE guard_value = VALUES(guard_value), checked_at = CURRENT_TIMESTAMP;

INSERT INTO identity_migration_guards (guard_key, guard_value)
SELECT 'admin_grant_uniqueness',
       CASE WHEN EXISTS (
         SELECT 1
           FROM admin_info
          WHERE TRIM(COALESCE(student_id, '')) <> ''
          GROUP BY LOWER(TRIM(student_id)), org_id
         HAVING COUNT(*) > 1
       ) THEN 0 ELSE 1 END
ON DUPLICATE KEY UPDATE guard_value = VALUES(guard_value), checked_at = CURRENT_TIMESTAMP;

INSERT INTO identity_migration_guards (guard_key, guard_value)
SELECT 'score_record_person_mapping',
       CASE WHEN EXISTS (
         SELECT 1
           FROM score_records sr
          WHERE NOT EXISTS (
                  SELECT 1 FROM hr_info h
                   WHERE CONVERT(h.id USING utf8mb4) COLLATE utf8mb4_unicode_ci =
                         CONVERT(sr.scorer_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
                     AND CONVERT(h.org_id USING utf8mb4) COLLATE utf8mb4_unicode_ci =
                         CONVERT(sr.org_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
                )
             OR NOT EXISTS (
                  SELECT 1 FROM hr_info h
                   WHERE CONVERT(h.id USING utf8mb4) COLLATE utf8mb4_unicode_ci =
                         CONVERT(sr.target_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
                     AND CONVERT(h.org_id USING utf8mb4) COLLATE utf8mb4_unicode_ci =
                         CONVERT(sr.org_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
                )
       ) THEN 0 ELSE 1 END
ON DUPLICATE KEY UPDATE guard_value = VALUES(guard_value), checked_at = CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS persons (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  student_id VARCHAR(32) NOT NULL,
  normalized_student_id VARCHAR(32) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX uk_person_student (normalized_student_id),
  INDEX idx_person_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS organization_memberships (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  person_id VARCHAR(64) NOT NULL,
  org_id VARCHAR(64) NOT NULL,
  legacy_hr_id VARCHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX uk_membership_person_org (person_id, org_id),
  UNIQUE INDEX uk_membership_legacy_hr (legacy_hr_id),
  INDEX idx_membership_org_status (org_id, status),
  CONSTRAINT fk_membership_person FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS membership_assignments (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  membership_id VARCHAR(64) NOT NULL,
  org_id VARCHAR(64) NOT NULL,
  assignment_kind VARCHAR(32) NOT NULL DEFAULT 'staff',
  title VARCHAR(200) DEFAULT NULL,
  department_id VARCHAR(64) DEFAULT NULL,
  identity_id VARCHAR(64) DEFAULT NULL,
  work_group_id VARCHAR(64) DEFAULT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  active_primary_membership_id VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_assignment_membership (membership_id, status),
  INDEX idx_assignment_org (org_id, status),
  INDEX idx_assignment_rule (org_id, department_id, identity_id, work_group_id),
  UNIQUE INDEX uk_assignment_active_primary (active_primary_membership_id),
  CONSTRAINT chk_assignment_primary_key CHECK (
    (status = 'active' AND is_primary = 1 AND active_primary_membership_id IS NOT NULL
      AND active_primary_membership_id = membership_id)
    OR ((status <> 'active' OR is_primary = 0) AND active_primary_membership_id IS NULL)
  ),
  CONSTRAINT fk_assignment_membership FOREIGN KEY (membership_id)
    REFERENCES organization_memberships(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS accounts (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  person_id VARCHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'verified',
  token_version INT NOT NULL DEFAULT 1,
  verified_at DATETIME DEFAULT NULL,
  recovery_required_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX uk_account_person (person_id),
  INDEX idx_account_status (status),
  CONSTRAINT fk_account_person FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS account_wechat_bindings (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  account_id VARCHAR(64) NOT NULL,
  app_id VARCHAR(64) NOT NULL DEFAULT 'whusu-smart-workspace',
  openid_hash CHAR(64) NOT NULL,
  hash_version VARCHAR(24) NOT NULL DEFAULT 'sha256_legacy',
  openid_ciphertext TEXT DEFAULT NULL,
  legacy_openid VARCHAR(128) DEFAULT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  active_openid_hash CHAR(64)
    GENERATED ALWAYS AS (CASE WHEN status = 'active' THEN openid_hash ELSE NULL END) STORED,
  active_account_id VARCHAR(64) DEFAULT NULL,
  bound_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_wechat_account_app (account_id, app_id, status),
  INDEX idx_wechat_openid_hash (app_id, openid_hash, status),
  INDEX idx_wechat_status (status),
  UNIQUE INDEX uk_wechat_active_openid (app_id, active_openid_hash),
  UNIQUE INDEX uk_wechat_active_account (app_id, active_account_id),
  CONSTRAINT chk_wechat_active_account CHECK (
    (status = 'active' AND active_account_id IS NOT NULL AND active_account_id = account_id)
    OR (status <> 'active' AND active_account_id IS NULL)
  ),
  CONSTRAINT fk_wechat_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_grants (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  person_id VARCHAR(64) NOT NULL,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  admin_level VARCHAR(32) NOT NULL DEFAULT 'admin',
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  legacy_admin_id VARCHAR(64) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX uk_admin_grant_person_org (person_id, org_id),
  UNIQUE INDEX uk_admin_grant_legacy (legacy_admin_id),
  INDEX idx_admin_grant_scope (org_id, admin_level, status),
  CONSTRAINT fk_admin_grant_person FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE RESTRICT,
  CONSTRAINT chk_admin_grant_level CHECK (admin_level IN ('super_admin', 'admin'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  account_id VARCHAR(64) NOT NULL,
  openid_hash CHAR(64) NOT NULL,
  context_id VARCHAR(160) DEFAULT NULL,
  context_type VARCHAR(24) DEFAULT NULL,
  context_subject_id VARCHAR(64) DEFAULT NULL,
  organization_id VARCHAR(64) DEFAULT NULL,
  role VARCHAR(16) DEFAULT NULL,
  token_version INT NOT NULL,
  device_key_hash CHAR(64) DEFAULT NULL,
  device_platform VARCHAR(24) DEFAULT NULL,
  device_model VARCHAR(96) DEFAULT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  expires_at DATETIME NOT NULL,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_auth_session_account (account_id, status),
  INDEX idx_auth_session_device (account_id, device_key_hash, status),
  INDEX idx_auth_session_expiry (expires_at),
  CONSTRAINT fk_auth_session_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_bootstrap_sessions (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  openid_hash CHAR(64) NOT NULL,
  openid_ciphertext TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until DATETIME DEFAULT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_auth_bootstrap_owner (openid_hash, status),
  INDEX idx_auth_bootstrap_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS identity_claim_requests (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  person_id VARCHAR(64) NOT NULL,
  requested_org_id VARCHAR(64) NOT NULL,
  openid_hash CHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until DATETIME DEFAULT NULL,
  verified_at DATETIME DEFAULT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_claim_org_status (requested_org_id, status, created_at),
  INDEX idx_claim_person (person_id, status),
  INDEX idx_claim_openid (openid_hash, status),
  CONSTRAINT fk_claim_person FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS identity_verification_tokens (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  claim_request_id VARCHAR(64) NOT NULL,
  person_id VARCHAR(64) NOT NULL,
  issued_by_person_id VARCHAR(64) NOT NULL,
  issued_by_context_id VARCHAR(160) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX uk_identity_token_hash (token_hash),
  INDEX idx_identity_token_claim (claim_request_id, status),
  CONSTRAINT fk_identity_token_claim FOREIGN KEY (claim_request_id)
    REFERENCES identity_claim_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_identity_token_person FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS account_recovery_credentials (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  account_id VARCHAR(64) NOT NULL,
  method VARCHAR(24) NOT NULL,
  credential_hash TEXT NOT NULL,
  salt VARCHAR(128) DEFAULT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'active',
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until DATETIME DEFAULT NULL,
  expires_at DATETIME DEFAULT NULL,
  used_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX uk_recovery_account_method (account_id, method),
  CONSTRAINT fk_recovery_credential_account FOREIGN KEY (account_id)
    REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS account_recovery_requests (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  person_id VARCHAR(64) NOT NULL,
  account_id VARCHAR(64) NOT NULL,
  requested_org_id VARCHAR(64) NOT NULL,
  new_openid_hash CHAR(64) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  approved_by_person_id VARCHAR(64) DEFAULT NULL,
  approved_by_context_id VARCHAR(160) DEFAULT NULL,
  reviewed_at DATETIME DEFAULT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_recovery_org_status (requested_org_id, status, created_at),
  INDEX idx_recovery_account (account_id, status),
  CONSTRAINT fk_recovery_request_person FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE RESTRICT,
  CONSTRAINT fk_recovery_request_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_policy (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  initial_claim_enabled TINYINT(1) NOT NULL DEFAULT 1,
  claim_starts_at DATETIME DEFAULT NULL,
  claim_ends_at DATETIME DEFAULT NULL,
  allow_recovery_code TINYINT(1) NOT NULL DEFAULT 0,
  allow_passphrase TINYINT(1) NOT NULL DEFAULT 0,
  passphrase_min_length INT NOT NULL DEFAULT 12,
  updated_by_person_id VARCHAR(64) DEFAULT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_audit_events (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  actor_person_id VARCHAR(64) DEFAULT NULL,
  target_person_id VARCHAR(64) DEFAULT NULL,
  account_id VARCHAR(64) DEFAULT NULL,
  organization_id VARCHAR(64) DEFAULT NULL,
  context_id VARCHAR(160) DEFAULT NULL,
  request_id VARCHAR(64) DEFAULT NULL,
  ip_hash CHAR(64) DEFAULT NULL,
  outcome VARCHAR(24) NOT NULL DEFAULT 'success',
  detail_json TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_auth_audit_target (target_person_id, created_at),
  INDEX idx_auth_audit_type (event_type, created_at),
  INDEX idx_auth_audit_org (organization_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO auth_policy (id) VALUES ('default');

INSERT IGNORE INTO persons (id, name, student_id, normalized_student_id, status)
SELECT MIN(id), MAX(name), MIN(student_id), LOWER(TRIM(student_id)), 'active'
  FROM hr_info
 WHERE TRIM(student_id) <> '' AND TRIM(name) <> ''
 GROUP BY LOWER(TRIM(student_id));

INSERT IGNORE INTO organization_memberships (id, person_id, org_id, legacy_hr_id, status)
SELECT h.id, p.id, h.org_id, h.id, 'active'
  FROM hr_info h
  JOIN persons p
    ON p.normalized_student_id =
       CONVERT(LOWER(TRIM(h.student_id)) USING utf8mb4) COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO membership_assignments
  (id, membership_id, org_id, assignment_kind, title, department_id, identity_id,
   work_group_id, is_primary, status, active_primary_membership_id)
SELECT h.id, h.id, h.org_id, 'staff', NULL, h.department_id, h.identity_id,
       h.work_group_id, 1, 'active', h.id
  FROM hr_info h
  JOIN organization_memberships m
    ON m.legacy_hr_id = CONVERT(h.id USING utf8mb4) COLLATE utf8mb4_unicode_ci;

INSERT IGNORE INTO accounts (id, person_id, status, token_version, verified_at)
SELECT MIN(ui.id), m.person_id, 'verified', 1, MIN(ui.created_at)
  FROM user_info ui
  JOIN organization_memberships m
    ON m.legacy_hr_id = CONVERT(ui.hr_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
   AND m.org_id = CONVERT(ui.org_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
 WHERE ui.openid IS NOT NULL AND ui.openid <> '' AND ui.hr_id IS NOT NULL AND ui.hr_id <> ''
 GROUP BY m.person_id;

INSERT IGNORE INTO accounts (id, person_id, status, token_version, verified_at)
SELECT MIN(a.id), p.id, 'verified', 1, MIN(COALESCE(a.bound_at, a.updated_at, NOW()))
  FROM admin_info a
  JOIN persons p
    ON p.normalized_student_id =
       CONVERT(LOWER(TRIM(a.student_id)) USING utf8mb4) COLLATE utf8mb4_unicode_ci
   AND p.name = CONVERT(TRIM(a.name) USING utf8mb4) COLLATE utf8mb4_unicode_ci
 WHERE a.openid IS NOT NULL AND TRIM(a.openid) <> ''
 GROUP BY p.id;

INSERT IGNORE INTO account_wechat_bindings
  (id, account_id, openid_hash, hash_version, legacy_openid, status, active_account_id, bound_at)
SELECT a.id, a.id, SHA2(MIN(source.openid), 256), 'sha256_legacy',
       MIN(source.openid), 'active', a.id, MIN(source.bound_at)
  FROM accounts a
  JOIN (
    SELECT m.person_id, ui.openid, ui.created_at AS bound_at
      FROM user_info ui
      JOIN organization_memberships m
        ON m.legacy_hr_id = CONVERT(ui.hr_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
       AND m.org_id = CONVERT(ui.org_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
     WHERE ui.openid IS NOT NULL AND TRIM(ui.openid) <> ''
    UNION ALL
    SELECT p.id AS person_id, ai.openid, COALESCE(ai.bound_at, ai.updated_at, NOW()) AS bound_at
      FROM admin_info ai
      JOIN persons p
        ON p.normalized_student_id =
           CONVERT(LOWER(TRIM(ai.student_id)) USING utf8mb4) COLLATE utf8mb4_unicode_ci
       AND p.name = CONVERT(TRIM(ai.name) USING utf8mb4) COLLATE utf8mb4_unicode_ci
     WHERE ai.openid IS NOT NULL AND TRIM(ai.openid) <> ''
  ) source ON source.person_id = a.person_id
 GROUP BY a.id;

INSERT IGNORE INTO admin_grants
  (id, person_id, org_id, admin_level, status, legacy_admin_id)
SELECT a.id, p.id, a.org_id, a.admin_level, 'active', a.id
  FROM admin_info a
  JOIN persons p
    ON p.normalized_student_id =
       CONVERT(LOWER(TRIM(a.student_id)) USING utf8mb4) COLLATE utf8mb4_unicode_ci
   AND p.name = CONVERT(TRIM(a.name) USING utf8mb4) COLLATE utf8mb4_unicode_ci
 WHERE TRIM(a.student_id) <> '' AND TRIM(a.name) <> '';

ALTER TABLE score_activities
  ADD COLUMN participant_granularity VARCHAR(16) NOT NULL DEFAULT 'person' AFTER is_current;

ALTER TABLE score_records
  ADD COLUMN scorer_person_id VARCHAR(64) DEFAULT NULL AFTER scorer_id,
  ADD COLUMN scorer_assignment_id VARCHAR(64) DEFAULT NULL AFTER scorer_person_id,
  ADD COLUMN scorer_subject_key VARCHAR(96) DEFAULT NULL AFTER scorer_assignment_id,
  ADD COLUMN target_person_id VARCHAR(64) DEFAULT NULL AFTER target_id,
  ADD COLUMN target_assignment_id VARCHAR(64) DEFAULT NULL AFTER target_person_id,
  ADD COLUMN target_subject_key VARCHAR(96) DEFAULT NULL AFTER target_assignment_id,
  ADD INDEX idx_sr_scorer_person (scorer_person_id),
  ADD INDEX idx_sr_target_person (target_person_id);

UPDATE score_records sr
JOIN organization_memberships scorer_membership
  ON scorer_membership.legacy_hr_id =
     CONVERT(sr.scorer_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
 AND scorer_membership.org_id =
     CONVERT(sr.org_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
JOIN organization_memberships target_membership
  ON target_membership.legacy_hr_id =
     CONVERT(sr.target_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
 AND target_membership.org_id =
     CONVERT(sr.org_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
LEFT JOIN membership_assignments scorer_assignment
  ON scorer_assignment.membership_id = scorer_membership.id
 AND scorer_assignment.is_primary = 1
 AND scorer_assignment.status = 'active'
LEFT JOIN membership_assignments target_assignment
  ON target_assignment.membership_id = target_membership.id
 AND target_assignment.is_primary = 1
 AND target_assignment.status = 'active'
SET sr.scorer_person_id = scorer_membership.person_id,
    sr.scorer_assignment_id = scorer_assignment.id,
    sr.scorer_subject_key = CONCAT('person:', scorer_membership.person_id),
    sr.target_person_id = target_membership.person_id,
    sr.target_assignment_id = target_assignment.id,
    sr.target_subject_key = CONCAT('person:', target_membership.person_id);

ALTER TABLE score_records
  MODIFY COLUMN scorer_subject_key VARCHAR(96) NOT NULL,
  MODIFY COLUMN target_subject_key VARCHAR(96) NOT NULL,
  DROP INDEX uk_sr_business,
  ADD UNIQUE INDEX uk_sr_business
    (org_id, activity_id, scorer_subject_key, target_subject_key);

ALTER TABLE audit_events
  ADD COLUMN operator_person_id VARCHAR(64) DEFAULT NULL AFTER operator_hr_id,
  ADD COLUMN operator_assignment_id VARCHAR(64) DEFAULT NULL AFTER operator_person_id,
  ADD COLUMN operator_admin_grant_id VARCHAR(64) DEFAULT NULL AFTER operator_assignment_id,
  ADD COLUMN operator_context_snapshot TEXT DEFAULT NULL AFTER operator_name;

ALTER TABLE venue_bookings
  ADD COLUMN creator_person_id VARCHAR(64) DEFAULT NULL AFTER user_hr_id,
  ADD COLUMN creator_assignment_id VARCHAR(64) DEFAULT NULL AFTER creator_person_id,
  ADD COLUMN creator_admin_grant_id VARCHAR(64) DEFAULT NULL AFTER creator_assignment_id,
  ADD COLUMN creator_context_snapshot TEXT DEFAULT NULL AFTER creator_admin_grant_id,
  ADD COLUMN approver_person_id VARCHAR(64) DEFAULT NULL AFTER approver_hr_id,
  ADD COLUMN approver_assignment_id VARCHAR(64) DEFAULT NULL AFTER approver_person_id,
  ADD COLUMN approver_admin_grant_id VARCHAR(64) DEFAULT NULL AFTER approver_assignment_id,
  ADD COLUMN approver_context_snapshot TEXT DEFAULT NULL AFTER approver_admin_grant_id;
