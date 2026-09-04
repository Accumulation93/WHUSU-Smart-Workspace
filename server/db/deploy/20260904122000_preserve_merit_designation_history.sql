-- 评优名单是公示活动的业务事实，规则调整不得通过外键级联删除。
DELIMITER $$
DROP PROCEDURE IF EXISTS preserve_merit_designation_history$$
CREATE PROCEDURE preserve_merit_designation_history()
BEGIN
  DECLARE delete_rule VARCHAR(20) DEFAULT NULL;
  DECLARE orphan_count BIGINT DEFAULT 0;

  SELECT COUNT(*) INTO orphan_count
    FROM merit_list_designations designation_row
    LEFT JOIN pub_merit_rule_clauses clause_row
      ON clause_row.id = designation_row.clause_id
     AND clause_row.org_id = designation_row.org_id
   WHERE clause_row.id IS NULL;

  IF orphan_count > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '评优名单存在无法关联的规则条款，停止迁移并等待人工核对';
  END IF;

  SELECT DELETE_RULE INTO delete_rule
    FROM information_schema.REFERENTIAL_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'merit_list_designations'
     AND CONSTRAINT_NAME = 'fk_mld_clause'
   LIMIT 1;

  IF delete_rule IS NOT NULL AND delete_rule <> 'RESTRICT' THEN
    ALTER TABLE merit_list_designations DROP FOREIGN KEY fk_mld_clause;
    SET delete_rule = NULL;
  END IF;

  IF delete_rule IS NULL THEN
    ALTER TABLE merit_list_designations
      ADD CONSTRAINT fk_mld_clause
      FOREIGN KEY (clause_id) REFERENCES pub_merit_rule_clauses(id)
      ON DELETE RESTRICT;
  END IF;
END$$
CALL preserve_merit_designation_history()$$
DROP PROCEDURE IF EXISTS preserve_merit_designation_history$$
DELIMITER ;
