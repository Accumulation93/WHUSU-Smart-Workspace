-- ============================================================
-- REDSU 场地系统 — 解除场地与组织的绑定
-- venues / venue_open_rules / venue_activity_rules / venue_bookings → 跨组织全局
-- 保留 venue_booking_rules / venue_approval_flows 等规则的 org_id（每组织独立配置）
-- 日期：2026-07-12
--
-- ⚠️ 幂等安全 — 可重复执行。通过 information_schema 检查避免因索引/列不存在而失败。
--    兼容 MySQL 8.0（不使用 DROP INDEX IF EXISTS / DROP COLUMN IF EXISTS 语法）。
-- ============================================================

-- ─── 辅助存储过程：安全删除索引 ──────────────────────
DROP PROCEDURE IF EXISTS _safe_drop_index;

DELIMITER //
CREATE PROCEDURE _safe_drop_index(IN tbl VARCHAR(128), IN idx VARCHAR(128))
BEGIN
  DECLARE cnt INT DEFAULT 0;
  SELECT COUNT(*) INTO cnt FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND INDEX_NAME = idx;
  IF cnt > 0 THEN
    SET @drop_sql = CONCAT('ALTER TABLE `', tbl, '` DROP INDEX `', idx, '`');
    PREPARE stmt FROM @drop_sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    SET @drop_sql = NULL;
  END IF;
END //
DELIMITER ;

-- ─── 辅助存储过程：安全删除列 ────────────────────────
DROP PROCEDURE IF EXISTS _safe_drop_column;

DELIMITER //
CREATE PROCEDURE _safe_drop_column(IN tbl VARCHAR(128), IN col VARCHAR(128))
BEGIN
  DECLARE cnt INT DEFAULT 0;
  SELECT COUNT(*) INTO cnt FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = tbl AND COLUMN_NAME = col;
  IF cnt > 0 THEN
    SET @drop_sql = CONCAT('ALTER TABLE `', tbl, '` DROP COLUMN `', col, '`');
    PREPARE stmt FROM @drop_sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
    SET @drop_sql = NULL;
  END IF;
END //
DELIMITER ;

-- ═══════════════════════════════════════════════════
-- 1. venues — 移除 org_id，场地变为全局
-- ═══════════════════════════════════════════════════
CALL _safe_drop_index('venues', 'idx_venues_org');
CALL _safe_drop_column('venues', 'org_id');

-- ═══════════════════════════════════════════════════
-- 2. venue_open_rules — 移除 org_id，开放规则只与场地关联
-- ═══════════════════════════════════════════════════
CALL _safe_drop_index('venue_open_rules', 'idx_vor_org');
CALL _safe_drop_column('venue_open_rules', 'org_id');

-- ═══════════════════════════════════════════════════
-- 3. venue_activity_rules — 移除 org_id，活动规则只与场地关联
-- ═══════════════════════════════════════════════════
CALL _safe_drop_index('venue_activity_rules', 'idx_var_org');
CALL _safe_drop_column('venue_activity_rules', 'org_id');

-- ═══════════════════════════════════════════════════
-- 4. venue_bookings — 移除 org_id，借用记录全局可见
--    跨组织冲突检测：任何组织的借用都占用时段
-- ═══════════════════════════════════════════════════
CALL _safe_drop_index('venue_bookings', 'idx_vb_org');
CALL _safe_drop_column('venue_bookings', 'org_id');

-- ─── 清理辅助存储过程 ──────────────────────────────
DROP PROCEDURE IF EXISTS _safe_drop_index;
DROP PROCEDURE IF EXISTS _safe_drop_column;

-- ═══════════════════════════════════════════════════
-- 验证：以下查询应返回 0 行（确认 org_id 列已移除）
-- ═══════════════════════════════════════════════════
SELECT COLUMN_NAME FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME IN ('venues','venue_open_rules','venue_activity_rules','venue_bookings')
    AND COLUMN_NAME = 'org_id';
-- 期望：Empty set

-- ═══════════════════════════════════════════════════
-- 注意：以下表保留 org_id，每组织独立配置：
--   - venue_booking_rules     (借用审批规则)
--   - venue_approval_flows    (审批流程)
--   - venue_approval_flow_steps
--   - venue_approval_flow_step_rules
--   - venue_booking_purposes  (借用事由)
-- 切换组织后需重新配置审批规则/流程/事由（身份和人事 ID 属于新组织）
-- ═══════════════════════════════════════════════════
