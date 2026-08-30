-- 评分模板属于单一组织。历史评分仍由记录内不可变快照解释，迁移只补齐模板归属，
-- 不修改题目、答案、评分记录或计算快照。
DROP PROCEDURE IF EXISTS isolate_score_templates_by_org;
DELIMITER $$
CREATE PROCEDURE isolate_score_templates_by_org()
BEGIN
  DECLARE column_exists INT DEFAULT 0;
  DECLARE ambiguous_templates INT DEFAULT 0;
  DECLARE unresolved_templates INT DEFAULT 0;
  DECLARE name_index_exists INT DEFAULT 0;
  DECLARE org_index_exists INT DEFAULT 0;
  DECLARE org_fk_exists INT DEFAULT 0;
  DECLARE fallback_org_id VARCHAR(64) DEFAULT NULL;

  SELECT COUNT(*) INTO column_exists
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'score_question_templates'
     AND COLUMN_NAME = 'org_id';

  IF column_exists = 0 THEN
    ALTER TABLE score_question_templates
      ADD COLUMN org_id VARCHAR(64) DEFAULT NULL AFTER updated_by;
  END IF;

  SELECT COUNT(*) INTO ambiguous_templates
    FROM (
      SELECT ref.template_id
        FROM (
          SELECT template_id, org_id
            FROM clause_template_configs
           WHERE org_id IS NOT NULL AND org_id <> ''
          UNION
          SELECT sto.template_id, activity.org_id
            FROM score_template_order sto
            INNER JOIN score_activities activity ON activity.id = sto.activity_id
           WHERE activity.org_id IS NOT NULL AND activity.org_id <> ''
        ) ref
       GROUP BY ref.template_id
      HAVING COUNT(DISTINCT ref.org_id) > 1
    ) ambiguous;

  IF ambiguous_templates > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '评分模板同时被多个组织引用，禁止猜测归属；请先完成显式拆分迁移';
  END IF;

  UPDATE score_question_templates template_row
  INNER JOIN (
    SELECT ref.template_id, MIN(ref.org_id) AS org_id
      FROM (
        SELECT template_id, org_id
          FROM clause_template_configs
         WHERE org_id IS NOT NULL AND org_id <> ''
        UNION
        SELECT sto.template_id, activity.org_id
          FROM score_template_order sto
          INNER JOIN score_activities activity ON activity.id = sto.activity_id
         WHERE activity.org_id IS NOT NULL AND activity.org_id <> ''
      ) ref
     GROUP BY ref.template_id
  ) ownership ON ownership.template_id = template_row.id
     SET template_row.org_id = ownership.org_id
   WHERE template_row.org_id IS NULL OR template_row.org_id = '';

  SELECT current_organization INTO fallback_org_id
    FROM system_config
   WHERE id = 'default'
   LIMIT 1;

  IF fallback_org_id IS NULL OR fallback_org_id = '' THEN
    SELECT MIN(id) INTO fallback_org_id FROM organizations;
  END IF;

  IF fallback_org_id IS NOT NULL AND fallback_org_id <> '' THEN
    UPDATE score_question_templates
       SET org_id = fallback_org_id
     WHERE org_id IS NULL OR org_id = '';
  END IF;

  SELECT COUNT(*) INTO unresolved_templates
    FROM score_question_templates template_row
    LEFT JOIN organizations organization_row ON organization_row.id = template_row.org_id
   WHERE template_row.org_id IS NULL
      OR template_row.org_id = ''
      OR organization_row.id IS NULL;

  IF unresolved_templates > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '存在无法证明组织归属的评分模板，迁移已停止';
  END IF;

  ALTER TABLE score_question_templates
    MODIFY COLUMN org_id VARCHAR(64) NOT NULL;

  SELECT COUNT(*) INTO name_index_exists
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'score_question_templates'
     AND INDEX_NAME = 'idx_sqt_name';
  IF name_index_exists > 0 THEN
    ALTER TABLE score_question_templates DROP INDEX idx_sqt_name;
  END IF;
  ALTER TABLE score_question_templates
    ADD UNIQUE INDEX idx_sqt_name (name, org_id);

  SELECT COUNT(*) INTO org_index_exists
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'score_question_templates'
     AND INDEX_NAME = 'idx_sqt_org';
  IF org_index_exists = 0 THEN
    ALTER TABLE score_question_templates ADD INDEX idx_sqt_org (org_id);
  END IF;

  SELECT COUNT(*) INTO org_fk_exists
    FROM information_schema.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'score_question_templates'
     AND CONSTRAINT_NAME = 'fk_sqt_org';
  IF org_fk_exists = 0 THEN
    ALTER TABLE score_question_templates
      ADD CONSTRAINT fk_sqt_org FOREIGN KEY (org_id)
      REFERENCES organizations(id) ON DELETE RESTRICT;
  END IF;
END$$
DELIMITER ;

CALL isolate_score_templates_by_org();
DROP PROCEDURE IF EXISTS isolate_score_templates_by_org;
