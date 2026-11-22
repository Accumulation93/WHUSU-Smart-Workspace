CREATE TABLE IF NOT EXISTS authorization_grant_sources (
  org_id VARCHAR(64) NOT NULL,
  object_kind ENUM('rule','delegation') NOT NULL,
  object_id VARCHAR(64) NOT NULL,
  parent_delegation_id VARCHAR(64) NULL,
  issuer_assignment_id VARCHAR(64) NULL,
  allow_redelegation TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, object_kind, object_id),
  KEY idx_authorization_grant_parent (org_id, parent_delegation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS authorization_basic_role_exclusions (
  org_id VARCHAR(64) NOT NULL,
  capability_key VARCHAR(96) NOT NULL,
  PRIMARY KEY (org_id, capability_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS authorization_shared_venue_organizations (
  org_id VARCHAR(64) NOT NULL,
  venue_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (org_id, venue_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS authorization_shared_template_organizations (
  org_id VARCHAR(64) NOT NULL,
  template_id VARCHAR(64) NOT NULL,
  PRIMARY KEY (org_id, template_id),
  KEY idx_authorization_template_organization (template_id, org_id),
  CONSTRAINT fk_authorization_shared_template FOREIGN KEY (template_id) REFERENCES hr_profile_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
