CREATE TABLE IF NOT EXISTS identity_cards (
  token_hash CHAR(64) NOT NULL PRIMARY KEY,
  account_id VARCHAR(64) NOT NULL,
  org_id VARCHAR(64) NOT NULL,
  context_id VARCHAR(160) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_identity_card_owner (account_id, org_id, expires_at),
  INDEX idx_identity_card_expiry (expires_at),
  CONSTRAINT fk_identity_card_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
