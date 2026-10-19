-- 全系统日程独立建表，旧场地审批及占用计算保持原有结构。
CREATE TABLE IF NOT EXISTS calendar_rules (
 id VARCHAR(64) NOT NULL, org_id VARCHAR(64) NOT NULL, name VARCHAR(80) NOT NULL,
 audience_json JSON NOT NULL, targets_json JSON NOT NULL, actions_json JSON NOT NULL,
 enabled TINYINT(1) NOT NULL DEFAULT 1, version INT UNSIGNED NOT NULL DEFAULT 1,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 PRIMARY KEY(id), KEY idx_calendar_rules_org(org_id,enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS calendar_events (
 id VARCHAR(64) NOT NULL, org_id VARCHAR(64) NOT NULL, creator_person_id VARCHAR(64) NOT NULL,
 creator_context_json JSON NOT NULL, visibility VARCHAR(16) NOT NULL,
 source_kind VARCHAR(24) NOT NULL DEFAULT 'manual', source_id VARCHAR(64) DEFAULT NULL,
 spec_json JSON NOT NULL, targets_json JSON NOT NULL,
 status VARCHAR(16) NOT NULL DEFAULT 'active', version INT UNSIGNED NOT NULL DEFAULT 1,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 PRIMARY KEY(id), UNIQUE KEY uq_calendar_source(org_id,source_kind,source_id),
 KEY idx_calendar_org_status(org_id,status), KEY idx_calendar_creator(creator_person_id,visibility)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS calendar_exceptions (
 id VARCHAR(64) NOT NULL, org_id VARCHAR(64) NOT NULL, event_id VARCHAR(64) NOT NULL,
 occurrence_date DATE NOT NULL, scope VARCHAR(16) NOT NULL, action VARCHAR(16) NOT NULL,
 spec_json JSON DEFAULT NULL, version INT UNSIGNED NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(id), KEY idx_calendar_exceptions(event_id,occurrence_date),
 CONSTRAINT fk_calendar_exception_event FOREIGN KEY(event_id) REFERENCES calendar_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS calendar_exits (
 id VARCHAR(64) NOT NULL, org_id VARCHAR(64) NOT NULL, event_id VARCHAR(64) NOT NULL,
 person_id VARCHAR(64) NOT NULL, occurrence_date DATE NOT NULL, scope VARCHAR(16) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(id), UNIQUE KEY uq_calendar_exit(event_id,person_id,occurrence_date,scope),
 KEY idx_calendar_exit_person(person_id,event_id),
 CONSTRAINT fk_calendar_exit_event FOREIGN KEY(event_id) REFERENCES calendar_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS calendar_occurrence_records (
 id VARCHAR(64) NOT NULL, org_id VARCHAR(64) NOT NULL, event_id VARCHAR(64) NOT NULL,
 occurrence_date DATE NOT NULL, starts_at DATETIME(3) NOT NULL, ends_at DATETIME(3) NOT NULL,
 spec_json JSON NOT NULL, participants_json JSON NOT NULL, version INT UNSIGNED NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(id), UNIQUE KEY uq_calendar_occurrence(event_id,occurrence_date),
 KEY idx_calendar_occurrence_window(org_id,starts_at,ends_at),
 CONSTRAINT fk_calendar_record_event FOREIGN KEY(event_id) REFERENCES calendar_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS calendar_reminder_receipts (
 id VARCHAR(64) NOT NULL, org_id VARCHAR(64) NOT NULL, event_id VARCHAR(64) NOT NULL,
 person_id VARCHAR(64) NOT NULL, occurrence_date DATE NOT NULL, minutes_before INT UNSIGNED NOT NULL,
 starts_at DATETIME(3) NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(id), UNIQUE KEY uq_calendar_reminder(event_id,person_id,occurrence_date,minutes_before,starts_at),
 CONSTRAINT fk_calendar_reminder_event FOREIGN KEY(event_id) REFERENCES calendar_events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS calendar_subscriptions (
 id VARCHAR(64) NOT NULL, person_id VARCHAR(64) NOT NULL, account_id VARCHAR(64) NOT NULL,
 token_hash CHAR(64) NOT NULL, revoked TINYINT(1) NOT NULL DEFAULT 0,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(id), UNIQUE KEY uq_calendar_subscription_token(token_hash),
 KEY idx_calendar_subscription_owner(person_id,revoked)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
