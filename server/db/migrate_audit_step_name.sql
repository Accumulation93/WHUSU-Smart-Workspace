-- ============================================================
-- Add step_name columns to audit workflow tables
-- ============================================================
ALTER TABLE audit_flow_template_steps
  ADD COLUMN IF NOT EXISTS name VARCHAR(128) DEFAULT '' AFTER action_type;

ALTER TABLE audit_submission_steps
  ADD COLUMN IF NOT EXISTS step_name VARCHAR(128) DEFAULT '' AFTER action_type;
