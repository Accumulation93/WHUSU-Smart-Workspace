-- ============================================================
-- REDSU 场地系统 — 解除场地与组织的绑定
-- 将 venues / venue_open_rules / venue_activity_rules 变为跨组织全局数据
-- 保留 venue_booking_rules / venue_approval_flows 等规则的 org_id（每组织独立配置）
-- 日期：2026-07-12
-- ============================================================

-- ═══════════════════════════════════════════════════
-- 1. venues — 移除 org_id，场地变为全局
-- ═══════════════════════════════════════════════════
ALTER TABLE venues
  DROP INDEX idx_venues_org,
  DROP COLUMN org_id;

-- ═══════════════════════════════════════════════════
-- 2. venue_open_rules — 移除 org_id，开放规则只与场地关联
-- ═══════════════════════════════════════════════════
ALTER TABLE venue_open_rules
  DROP INDEX idx_vor_org,
  DROP COLUMN org_id;

-- ═══════════════════════════════════════════════════
-- 3. venue_activity_rules — 移除 org_id，活动规则只与场地关联
-- ═══════════════════════════════════════════════════
ALTER TABLE venue_activity_rules
  DROP INDEX idx_var_org,
  DROP COLUMN org_id;

-- ═══════════════════════════════════════════════════
-- 注意：以下表保留 org_id，每组织独立配置：
--   - venue_booking_rules     (借用审批规则)
--   - venue_approval_flows    (审批流程)
--   - venue_approval_flow_steps
--   - venue_approval_flow_step_rules
--   - venue_booking_purposes  (借用事由)
--   - venue_bookings          (借用记录)
-- 切换组织后需重新配置审批规则/流程/事由（身份和人事 ID 属于新组织）
-- ═══════════════════════════════════════════════════
