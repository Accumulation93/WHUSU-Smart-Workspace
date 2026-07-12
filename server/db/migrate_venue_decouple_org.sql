-- ============================================================
-- REDSU 场地系统 — 解除场地与组织的绑定
-- venues / venue_open_rules / venue_activity_rules / venue_bookings → 跨组织全局
-- 保留 venue_booking_rules / venue_approval_flows 等规则的 org_id（每组织独立配置）
-- 日期：2026-07-12
--
-- ⚠️ 幂等安全 — 可重复执行。使用 IF EXISTS 避免因索引/列不存在而失败
-- ============================================================

-- ═══════════════════════════════════════════════════
-- 1. venues — 移除 org_id，场地变为全局
-- ═══════════════════════════════════════════════════
DROP INDEX IF EXISTS idx_venues_org ON venues;
ALTER TABLE venues DROP COLUMN IF EXISTS org_id;

-- ═══════════════════════════════════════════════════
-- 2. venue_open_rules — 移除 org_id，开放规则只与场地关联
-- ═══════════════════════════════════════════════════
DROP INDEX IF EXISTS idx_vor_org ON venue_open_rules;
ALTER TABLE venue_open_rules DROP COLUMN IF EXISTS org_id;

-- ═══════════════════════════════════════════════════
-- 3. venue_activity_rules — 移除 org_id，活动规则只与场地关联
-- ═══════════════════════════════════════════════════
DROP INDEX IF EXISTS idx_var_org ON venue_activity_rules;
ALTER TABLE venue_activity_rules DROP COLUMN IF EXISTS org_id;

-- ═══════════════════════════════════════════════════
-- 4. venue_bookings — 移除 org_id，借用记录全局可见
--    跨组织冲突检测：任何组织的借用都占用时段
-- ═══════════════════════════════════════════════════
DROP INDEX IF EXISTS idx_vb_org ON venue_bookings;
ALTER TABLE venue_bookings DROP COLUMN IF EXISTS org_id;

-- ═══════════════════════════════════════════════════
-- 验证：以下查询应返回 0 行（确认 org_id 列已移除）
-- SELECT COLUMN_NAME FROM information_schema.COLUMNS
--   WHERE TABLE_SCHEMA = DATABASE()
--     AND TABLE_NAME IN ('venues','venue_open_rules','venue_activity_rules','venue_bookings')
--     AND COLUMN_NAME = 'org_id';
-- ═══════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════
-- 注意：以下表保留 org_id，每组织独立配置：
--   - venue_booking_rules     (借用审批规则)
--   - venue_approval_flows    (审批流程)
--   - venue_approval_flow_steps
--   - venue_approval_flow_step_rules
--   - venue_booking_purposes  (借用事由)
-- 切换组织后需重新配置审批规则/流程/事由（身份和人事 ID 属于新组织）
-- ═══════════════════════════════════════════════════
