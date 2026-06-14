-- ============================================================
-- Audit Events Log — Records every lifecycle event for a submission
-- This enables complete timeline reconstruction with accurate timestamps
-- Date: 2026-06-14
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_events (
  id VARCHAR(64) NOT NULL PRIMARY KEY,
  submission_id VARCHAR(64) NOT NULL,
  event_type VARCHAR(32) NOT NULL COMMENT 'submit | withdraw | resubmit | approve | reject',
  step_index INT DEFAULT NULL COMMENT 'Relevant step for approve/reject events',
  round INT NOT NULL DEFAULT 1,
  operator_hr_id VARCHAR(64) DEFAULT NULL COMMENT 'HR ID of who performed the action',
  operator_name VARCHAR(128) DEFAULT NULL COMMENT 'Resolved display name',
  comment TEXT DEFAULT NULL COMMENT 'Approval comment or rejection reason',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  org_id VARCHAR(64) NOT NULL DEFAULT '',
  INDEX idx_ae_submission (submission_id),
  INDEX idx_ae_submission_time (submission_id, created_at),
  INDEX idx_ae_org (org_id),
  CONSTRAINT fk_ae_submission FOREIGN KEY (submission_id)
    REFERENCES audit_submissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
