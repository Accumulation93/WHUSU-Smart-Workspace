CREATE TABLE IF NOT EXISTS scoring_publication_materializations (
  org_id VARCHAR(64) NOT NULL,
  activity_id VARCHAR(64) NOT NULL,
  format_version SMALLINT UNSIGNED NOT NULL,
  org_revision BIGINT UNSIGNED NOT NULL,
  global_revision BIGINT UNSIGNED NOT NULL,
  payload JSON NOT NULL,
  PRIMARY KEY (org_id, activity_id, format_version),
  CONSTRAINT fk_spm_activity FOREIGN KEY (activity_id) REFERENCES score_activities(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
