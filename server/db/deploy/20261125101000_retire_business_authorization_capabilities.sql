-- 普通角色退出已归属子应用的业务使用项。关联基础角色及原有发布版本保持原字节。
DROP FUNCTION IF EXISTS authorization_center_capabilities;
DROP PROCEDURE IF EXISTS authorization_retire_business_roles;

DELIMITER $$
CREATE FUNCTION authorization_center_capabilities(input_caps JSON) RETURNS JSON DETERMINISTIC
BEGIN
  IF JSON_TYPE(input_caps) <> 'ARRAY' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='invalid_authorization_capabilities';
  END IF;
  RETURN (SELECT COALESCE(JSON_ARRAYAGG(c.capability_key),JSON_ARRAY())
    FROM JSON_TABLE(input_caps,'$[*]' COLUMNS(capability_key VARCHAR(96) PATH '$')) c
    WHERE NOT JSON_CONTAINS(authorization_retired_business_capabilities(),
      JSON_QUOTE(IF(LEFT(c.capability_key,7)='assign:',SUBSTRING(c.capability_key,8),c.capability_key))));
END$$

CREATE PROCEDURE authorization_retire_business_roles()
BEGIN
  DECLARE done BOOLEAN DEFAULT FALSE;
  DECLARE role_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE row_org VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE rule_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE pub_version INT UNSIGNED;
  DECLARE draft JSON;
  DECLARE live JSON;
  DECLARE next_draft JSON;
  DECLARE next_live JSON;
  DECLARE original_legacy JSON;
  DECLARE original_allocation JSON;
  DECLARE original_policy JSON;
  DECLARE next_policy JSON;
  DECLARE next_legacy JSON;
  DECLARE next_allocation JSON;
  DECLARE next_caps JSON;
  DECLARE legacy_caps JSON;
  DECLARE has_allocation BOOLEAN;
  DECLARE roles CURSOR FOR SELECT s.id,s.org_id,s.published_version,s.draft_capabilities_json,v.capabilities_json
    FROM authorization_schemes s LEFT JOIN authorization_scheme_versions v
      ON v.org_id=s.org_id AND v.scheme_id=s.id AND v.version=s.published_version
    WHERE NOT EXISTS (SELECT 1 FROM authorization_relationship_role_assignments b WHERE b.org_id=s.org_id AND b.scheme_id=s.id)
    ORDER BY s.org_id,s.id;
  DECLARE rules CURSOR FOR SELECT r.id,r.org_id,r.policy_json,r.allocation_policy_json FROM authorization_rules r
    WHERE NOT EXISTS (SELECT 1 FROM authorization_relationship_role_assignments b WHERE b.org_id=r.org_id AND b.scheme_id=r.scheme_id)
    ORDER BY r.org_id,r.id;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done=TRUE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  OPEN roles;
  role_loop: LOOP
    FETCH roles INTO role_id,row_org,pub_version,draft,live;
    IF done THEN LEAVE role_loop; END IF;
    IF pub_version > 0 AND live IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='authorization_scheme_history_missing';
    END IF;
    SET next_draft=authorization_center_capabilities(draft);
    SET next_live=IF(pub_version>0,authorization_center_capabilities(live),JSON_ARRAY());
    IF NOT (next_draft <=> draft) OR (pub_version>0 AND NOT (next_live <=> live)) THEN
      IF pub_version>0 AND NOT (next_live <=> live) THEN
        INSERT INTO authorization_scheme_versions(id,org_id,scheme_id,version,capabilities_json,actor_context_id)
          VALUES(UUID(),row_org,role_id,pub_version+1,next_live,'migration:20261125101000');
      END IF;
      UPDATE authorization_schemes SET draft_capabilities_json=next_draft,
        published_version=pub_version+IF(pub_version>0 AND NOT (next_live <=> live),1,0),version=version+1
        WHERE org_id=row_org AND id=role_id;
      INSERT INTO authorization_changes(id,org_id,actor_context_id,action,target_id,before_json,after_json)
        VALUES(UUID(),row_org,'migration:20261125101000','business_role_retire',role_id,
          JSON_OBJECT('capabilities',draft,'publishedVersion',pub_version,'publishedCapabilities',live),
          JSON_OBJECT('capabilities',next_draft,'publishedCapabilities',next_live,
            'retired',JSON_EXTRACT(IF(JSON_LENGTH(next_draft)=0 AND JSON_LENGTH(next_live)=0,'true','false'),'$')));
    END IF;
  END LOOP;
  CLOSE roles;
  SET done=FALSE;
  OPEN rules;
  rule_loop: LOOP
    FETCH rules INTO rule_id,row_org,original_legacy,original_allocation;
    IF done THEN LEAVE rule_loop; END IF;
    SET original_policy=COALESCE(original_allocation,original_legacy);
    SET next_caps=authorization_center_capabilities(JSON_EXTRACT(original_policy,'$.capabilities'));
    IF NOT (next_caps <=> JSON_EXTRACT(original_policy,'$.capabilities')) THEN
      IF JSON_LENGTH(next_caps)=0 THEN
        -- 兼容投影继续使用已知旧键并停用；空cap或已退役assign键不得污染整组授权计算。
        SET legacy_caps=(SELECT JSON_ARRAYAGG(IF(LEFT(c.capability_key,7)='assign:',SUBSTRING(c.capability_key,8),c.capability_key))
          FROM JSON_TABLE(JSON_EXTRACT(original_policy,'$.capabilities'),'$[*]' COLUMNS(capability_key VARCHAR(96) PATH '$')) c);
        SET next_legacy=JSON_SET(JSON_REMOVE(original_policy,'$.allocationSubjects'),'$.capabilities',legacy_caps,
          '$.enabled',JSON_EXTRACT('false','$'));
        SET next_allocation=NULL;
        SET next_policy=next_legacy;
      ELSE
        SET next_policy=JSON_SET(original_policy,'$.capabilities',next_caps);
        SET legacy_caps=(SELECT JSON_ARRAYAGG(IF(LEFT(c.capability_key,7)='assign:',SUBSTRING(c.capability_key,8),c.capability_key))
          FROM JSON_TABLE(next_caps,'$[*]' COLUMNS(capability_key VARCHAR(96) PATH '$')) c);
        SET has_allocation=EXISTS (SELECT 1 FROM JSON_TABLE(next_caps,'$[*]' COLUMNS(capability_key VARCHAR(96) PATH '$')) c
          WHERE LEFT(c.capability_key,7)='assign:');
        SET next_legacy=JSON_SET(JSON_REMOVE(next_policy,'$.allocationSubjects'),'$.capabilities',legacy_caps);
        IF has_allocation THEN SET next_legacy=JSON_SET(next_legacy,'$.enabled',JSON_EXTRACT('false','$')); END IF;
        SET next_allocation=IF(has_allocation OR JSON_CONTAINS_PATH(next_policy,'one','$.allocationSubjects'),next_policy,NULL);
      END IF;
      IF NOT (original_legacy <=> next_legacy) OR NOT (original_allocation <=> next_allocation) THEN
        UPDATE authorization_rules SET policy_json=next_legacy,allocation_policy_json=next_allocation,version=version+1
          WHERE org_id=row_org AND id=rule_id;
        INSERT INTO authorization_changes(id,org_id,actor_context_id,action,target_id,before_json,after_json)
          VALUES(UUID(),row_org,'migration:20261125101000','business_rule_retire',rule_id,original_policy,next_policy);
      END IF;
    END IF;
  END LOOP;
  CLOSE rules;
END$$
DELIMITER ;

START TRANSACTION;
SELECT org_id FROM authorization_organizations ORDER BY org_id FOR UPDATE;
CALL authorization_retire_business_roles();
COMMIT;
DROP PROCEDURE authorization_retire_business_roles;
