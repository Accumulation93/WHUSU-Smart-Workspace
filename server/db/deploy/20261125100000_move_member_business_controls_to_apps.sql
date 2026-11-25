-- 普通业务按子应用关系规则执行；基础角色及版本只保留作历史和滚动回退兼容。
-- 身份卡已有独立管理设置，保留迁移时的关闭结果，不覆盖日后在该子应用中的调整。
CREATE TABLE IF NOT EXISTS authorization_business_policy_transfers (
  org_id VARCHAR(64) NOT NULL PRIMARY KEY,
  source_scheme_id VARCHAR(64) NOT NULL,
  source_version INT UNSIGNED NULL,
  last_mirrored_version INT UNSIGNED NULL,
  issue_enabled TINYINT(1) NOT NULL,
  public_verification_enabled TINYINT(1) NOT NULL,
  applied_at DATETIME(3) NULL,
  CONSTRAINT fk_business_policy_transfer_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT chk_business_policy_issue CHECK (issue_enabled IN (0, 1)),
  CONSTRAINT chk_business_policy_verify CHECK (public_verification_enabled IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

START TRANSACTION;
SELECT org_id FROM authorization_organizations ORDER BY org_id FOR UPDATE;

INSERT IGNORE INTO authorization_business_policy_transfers
  (org_id, source_scheme_id, source_version, last_mirrored_version, issue_enabled, public_verification_enabled)
SELECT a.org_id, a.scheme_id, s.published_version, s.published_version,
  a.enabled = 1
    AND JSON_CONTAINS(COALESCE(v.capabilities_json, JSON_ARRAY()), JSON_QUOTE('identity.cards.read'))
    AND JSON_CONTAINS(COALESCE(v.capabilities_json, JSON_ARRAY()), JSON_QUOTE('identity.cards.create'))
    AND JSON_CONTAINS(COALESCE(v.capabilities_json, JSON_ARRAY()), JSON_QUOTE('identity.cards.verify')),
  a.enabled = 1
    AND JSON_CONTAINS(COALESCE(v.capabilities_json, JSON_ARRAY()), JSON_QUOTE('identity.cards.read'))
    AND JSON_CONTAINS(COALESCE(v.capabilities_json, JSON_ARRAY()), JSON_QUOTE('identity.cards.verify'))
FROM authorization_relationship_role_assignments a
LEFT JOIN authorization_schemes s ON s.org_id = a.org_id AND s.id = a.scheme_id
LEFT JOIN authorization_scheme_versions v
  ON v.org_id = s.org_id AND v.scheme_id = s.id AND v.version = s.published_version;

INSERT INTO identity_card_policies (org_id, issue_enabled, public_verification_enabled, version)
SELECT org_id, issue_enabled, public_verification_enabled, 1
FROM authorization_business_policy_transfers WHERE applied_at IS NULL
ON DUPLICATE KEY UPDATE
  version = identity_card_policies.version
    + (identity_card_policies.issue_enabled <> (identity_card_policies.issue_enabled AND VALUES(issue_enabled))
      OR identity_card_policies.public_verification_enabled
        <> (identity_card_policies.public_verification_enabled AND VALUES(public_verification_enabled))),
  issue_enabled = identity_card_policies.issue_enabled AND VALUES(issue_enabled),
  public_verification_enabled = identity_card_policies.public_verification_enabled AND VALUES(public_verification_enabled);

UPDATE authorization_business_policy_transfers SET applied_at = UTC_TIMESTAMP(3) WHERE applied_at IS NULL;
COMMIT;

-- 滚动切换及回退期间，旧进程仍可能发布原基础角色；只同步身份卡实际变化的两项业务设置。
DELIMITER $$
CREATE TRIGGER IF NOT EXISTS authorization_mirror_legacy_identity_card_policy
AFTER INSERT ON authorization_changes FOR EACH ROW
FOLLOWS authorization_mirror_legacy_basic_toggle
BEGIN
  DECLARE role_id VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  DECLARE live_version INT UNSIGNED;
  DECLARE previous_version INT UNSIGNED;
  DECLARE live JSON;
  DECLARE previous JSON;
  DECLARE relationship_enabled BOOLEAN;
  DECLARE next_issue BOOLEAN;
  DECLARE next_verify BOOLEAN;
  DECLARE issue_changed BOOLEAN;
  DECLARE verify_changed BOOLEAN;
  IF NEW.action IN ('scheme_publish','business_controls_sync')
    OR (NEW.action = 'basic_permission_toggle' AND NEW.target_id IN ('identity.cards.read','identity.cards.create','identity.cards.verify')) THEN
    SELECT a.scheme_id, s.published_version, a.enabled, v.capabilities_json
      INTO role_id, live_version, relationship_enabled, live
      FROM authorization_relationship_role_assignments a
      JOIN authorization_schemes s ON s.org_id=a.org_id AND s.id=a.scheme_id
      JOIN authorization_scheme_versions v ON v.org_id=s.org_id AND v.scheme_id=s.id AND v.version=s.published_version
      WHERE a.org_id=NEW.org_id AND (NEW.action='basic_permission_toggle' OR a.scheme_id=NEW.target_id);
    IF role_id IS NOT NULL THEN
      -- 新组织在旧版初始化后尚无转移记录，以不可变首版作为比较起点。
      INSERT IGNORE INTO authorization_business_policy_transfers
        (org_id,source_scheme_id,source_version,last_mirrored_version,issue_enabled,public_verification_enabled,applied_at)
      VALUES (NEW.org_id,role_id,1,1,1,1,UTC_TIMESTAMP(3));
      SELECT last_mirrored_version INTO previous_version FROM authorization_business_policy_transfers
        WHERE org_id=NEW.org_id FOR UPDATE;
      IF previous_version <> live_version THEN
        SELECT capabilities_json INTO previous FROM authorization_scheme_versions
          WHERE org_id=NEW.org_id AND scheme_id=role_id AND version=previous_version;
        SET next_issue = relationship_enabled
          AND JSON_CONTAINS(live,JSON_QUOTE('identity.cards.read'))
          AND JSON_CONTAINS(live,JSON_QUOTE('identity.cards.create'))
          AND JSON_CONTAINS(live,JSON_QUOTE('identity.cards.verify'));
        SET next_verify = relationship_enabled
          AND JSON_CONTAINS(live,JSON_QUOTE('identity.cards.read'))
          AND JSON_CONTAINS(live,JSON_QUOTE('identity.cards.verify'));
        SET issue_changed = next_issue <> (relationship_enabled
          AND JSON_CONTAINS(COALESCE(previous,JSON_ARRAY()),JSON_QUOTE('identity.cards.read'))
          AND JSON_CONTAINS(COALESCE(previous,JSON_ARRAY()),JSON_QUOTE('identity.cards.create'))
          AND JSON_CONTAINS(COALESCE(previous,JSON_ARRAY()),JSON_QUOTE('identity.cards.verify')));
        SET verify_changed = next_verify <> (relationship_enabled
          AND JSON_CONTAINS(COALESCE(previous,JSON_ARRAY()),JSON_QUOTE('identity.cards.read'))
          AND JSON_CONTAINS(COALESCE(previous,JSON_ARRAY()),JSON_QUOTE('identity.cards.verify')));
        IF issue_changed OR verify_changed THEN
          INSERT INTO identity_card_policies(org_id,issue_enabled,public_verification_enabled,version)
            VALUES (NEW.org_id,next_issue,next_verify,1)
          ON DUPLICATE KEY UPDATE
            version=version+(issue_changed AND issue_enabled<>next_issue OR verify_changed AND public_verification_enabled<>next_verify),
            issue_enabled=IF(issue_changed,next_issue,issue_enabled),
            public_verification_enabled=IF(verify_changed,next_verify,public_verification_enabled);
        END IF;
        UPDATE authorization_business_policy_transfers SET last_mirrored_version=live_version WHERE org_id=NEW.org_id;
      END IF;
    END IF;
  END IF;
END$$
DELIMITER ;

-- 覆盖首次回填与兼容触发器建立之间，旧进程已经提交的角色变化。
DROP TEMPORARY TABLE IF EXISTS pending_identity_card_policy_sync;
CREATE TEMPORARY TABLE pending_identity_card_policy_sync AS
SELECT a.org_id,a.scheme_id,t.last_mirrored_version,s.published_version
FROM authorization_relationship_role_assignments a
JOIN authorization_schemes s ON s.org_id=a.org_id AND s.id=a.scheme_id
JOIN authorization_business_policy_transfers t ON t.org_id=a.org_id
WHERE t.last_mirrored_version<>s.published_version;
INSERT INTO authorization_changes(id,org_id,actor_context_id,action,target_id,before_json,after_json)
SELECT UUID(),org_id,'migration:20261125100000','business_controls_sync',scheme_id,
  JSON_OBJECT('publishedVersion',last_mirrored_version),JSON_OBJECT('publishedVersion',published_version)
FROM pending_identity_card_policy_sync;
DROP TEMPORARY TABLE pending_identity_card_policy_sync;
