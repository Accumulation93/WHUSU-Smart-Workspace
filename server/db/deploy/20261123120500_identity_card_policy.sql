CREATE TABLE IF NOT EXISTS identity_card_policies (
  org_id VARCHAR(64) NOT NULL PRIMARY KEY,
  issue_enabled BOOLEAN NOT NULL,
  public_verification_enabled BOOLEAN NOT NULL,
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  CONSTRAINT fk_identity_card_policy_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
