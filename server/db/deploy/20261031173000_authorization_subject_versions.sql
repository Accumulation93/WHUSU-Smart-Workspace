-- 岗位、管理身份及字典改变时，在原业务事务中使授权预览和跨进程目录失效。
-- 不改既有缓存触发器；这些触发器只更新已初始化的授权组织。
DROP TRIGGER IF EXISTS cv_authz_assignments_i;
CREATE TRIGGER cv_authz_assignments_i AFTER INSERT ON membership_assignments FOR EACH ROW
  UPDATE authorization_organizations SET revision = revision + 1 WHERE org_id = NEW.org_id;
DROP TRIGGER IF EXISTS cv_authz_assignments_u;
CREATE TRIGGER cv_authz_assignments_u AFTER UPDATE ON membership_assignments FOR EACH ROW
  UPDATE authorization_organizations SET revision = revision + 1 WHERE org_id IN (OLD.org_id, NEW.org_id);
DROP TRIGGER IF EXISTS cv_authz_assignments_d;
CREATE TRIGGER cv_authz_assignments_d AFTER DELETE ON membership_assignments FOR EACH ROW
  UPDATE authorization_organizations SET revision = revision + 1 WHERE org_id = OLD.org_id;

DROP TRIGGER IF EXISTS cv_authz_memberships_i;
CREATE TRIGGER cv_authz_memberships_i AFTER INSERT ON organization_memberships FOR EACH ROW
  UPDATE authorization_organizations SET revision = revision + 1 WHERE org_id = NEW.org_id;
DROP TRIGGER IF EXISTS cv_authz_memberships_u;
CREATE TRIGGER cv_authz_memberships_u AFTER UPDATE ON organization_memberships FOR EACH ROW
  UPDATE authorization_organizations SET revision = revision + 1 WHERE org_id IN (OLD.org_id, NEW.org_id);
DROP TRIGGER IF EXISTS cv_authz_memberships_d;
CREATE TRIGGER cv_authz_memberships_d AFTER DELETE ON organization_memberships FOR EACH ROW
  UPDATE authorization_organizations SET revision = revision + 1 WHERE org_id = OLD.org_id;

DROP TRIGGER IF EXISTS cv_authz_admin_grants_i;
CREATE TRIGGER cv_authz_admin_grants_i AFTER INSERT ON admin_grants FOR EACH ROW
  UPDATE authorization_organizations SET revision = revision + 1
    WHERE org_id = NEW.org_id OR (NEW.org_id = '' AND NEW.admin_level = 'super_admin');
DROP TRIGGER IF EXISTS cv_authz_admin_grants_u;
CREATE TRIGGER cv_authz_admin_grants_u AFTER UPDATE ON admin_grants FOR EACH ROW
  UPDATE authorization_organizations SET revision = revision + 1
    WHERE org_id IN (OLD.org_id, NEW.org_id)
      OR (OLD.org_id = '' AND OLD.admin_level = 'super_admin')
      OR (NEW.org_id = '' AND NEW.admin_level = 'super_admin');
DROP TRIGGER IF EXISTS cv_authz_admin_grants_d;
CREATE TRIGGER cv_authz_admin_grants_d AFTER DELETE ON admin_grants FOR EACH ROW
  UPDATE authorization_organizations SET revision = revision + 1
    WHERE org_id = OLD.org_id OR (OLD.org_id = '' AND OLD.admin_level = 'super_admin');

DROP TRIGGER IF EXISTS cv_authz_departments_i;
CREATE TRIGGER cv_authz_departments_i AFTER INSERT ON departments FOR EACH ROW
  UPDATE authorization_organizations SET revision = revision + 1 WHERE org_id = NEW.org_id;
DROP TRIGGER IF EXISTS cv_authz_departments_u;
CREATE TRIGGER cv_authz_departments_u AFTER UPDATE ON departments FOR EACH ROW
  UPDATE authorization_organizations SET revision = revision + 1 WHERE org_id IN (OLD.org_id, NEW.org_id);
DROP TRIGGER IF EXISTS cv_authz_departments_d;
CREATE TRIGGER cv_authz_departments_d AFTER DELETE ON departments FOR EACH ROW
  UPDATE authorization_organizations SET revision = revision + 1 WHERE org_id = OLD.org_id;

DROP TRIGGER IF EXISTS cv_authz_identities_i;
CREATE TRIGGER cv_authz_identities_i AFTER INSERT ON identities FOR EACH ROW
  UPDATE authorization_organizations SET revision = revision + 1 WHERE org_id = NEW.org_id;
DROP TRIGGER IF EXISTS cv_authz_identities_u;
CREATE TRIGGER cv_authz_identities_u AFTER UPDATE ON identities FOR EACH ROW
  UPDATE authorization_organizations SET revision = revision + 1 WHERE org_id IN (OLD.org_id, NEW.org_id);
DROP TRIGGER IF EXISTS cv_authz_identities_d;
CREATE TRIGGER cv_authz_identities_d AFTER DELETE ON identities FOR EACH ROW
  UPDATE authorization_organizations SET revision = revision + 1 WHERE org_id = OLD.org_id;

DROP TRIGGER IF EXISTS cv_authz_work_groups_i;
CREATE TRIGGER cv_authz_work_groups_i AFTER INSERT ON work_groups FOR EACH ROW
  UPDATE authorization_organizations SET revision = revision + 1 WHERE org_id = NEW.org_id;
DROP TRIGGER IF EXISTS cv_authz_work_groups_u;
CREATE TRIGGER cv_authz_work_groups_u AFTER UPDATE ON work_groups FOR EACH ROW
  UPDATE authorization_organizations SET revision = revision + 1 WHERE org_id IN (OLD.org_id, NEW.org_id);
DROP TRIGGER IF EXISTS cv_authz_work_groups_d;
CREATE TRIGGER cv_authz_work_groups_d AFTER DELETE ON work_groups FOR EACH ROW
  UPDATE authorization_organizations SET revision = revision + 1 WHERE org_id = OLD.org_id;

-- 自然人和账号跨组织；只使其成员组织及管理组织失效，全局超管涉及全部组织。
DROP TRIGGER IF EXISTS cv_authz_accounts_i;
CREATE TRIGGER cv_authz_accounts_i AFTER INSERT ON accounts FOR EACH ROW
  UPDATE authorization_organizations target SET revision = revision + 1
    WHERE EXISTS (SELECT 1 FROM organization_memberships m WHERE m.person_id = NEW.person_id AND m.org_id = target.org_id)
      OR EXISTS (SELECT 1 FROM admin_grants g WHERE g.person_id = NEW.person_id
        AND (g.org_id = target.org_id OR (g.org_id = '' AND g.admin_level = 'super_admin')));
DROP TRIGGER IF EXISTS cv_authz_accounts_u;
CREATE TRIGGER cv_authz_accounts_u AFTER UPDATE ON accounts FOR EACH ROW
  UPDATE authorization_organizations target SET revision = revision + 1
    WHERE (NOT (OLD.status <=> NEW.status) OR NOT (OLD.token_version <=> NEW.token_version)
      OR NOT (OLD.person_id <=> NEW.person_id))
      AND (EXISTS (SELECT 1 FROM organization_memberships m WHERE m.person_id IN (OLD.person_id, NEW.person_id) AND m.org_id = target.org_id)
      OR EXISTS (SELECT 1 FROM admin_grants g WHERE g.person_id IN (OLD.person_id, NEW.person_id)
        AND (g.org_id = target.org_id OR (g.org_id = '' AND g.admin_level = 'super_admin'))));
DROP TRIGGER IF EXISTS cv_authz_accounts_d;
CREATE TRIGGER cv_authz_accounts_d AFTER DELETE ON accounts FOR EACH ROW
  UPDATE authorization_organizations target SET revision = revision + 1
    WHERE EXISTS (SELECT 1 FROM organization_memberships m WHERE m.person_id = OLD.person_id AND m.org_id = target.org_id)
      OR EXISTS (SELECT 1 FROM admin_grants g WHERE g.person_id = OLD.person_id
        AND (g.org_id = target.org_id OR (g.org_id = '' AND g.admin_level = 'super_admin')));

DROP TRIGGER IF EXISTS cv_authz_persons_u;
CREATE TRIGGER cv_authz_persons_u AFTER UPDATE ON persons FOR EACH ROW
  UPDATE authorization_organizations target SET revision = revision + 1
    WHERE (NOT (OLD.status <=> NEW.status) OR NOT (OLD.name <=> NEW.name))
      AND (EXISTS (SELECT 1 FROM organization_memberships m WHERE m.person_id = NEW.id AND m.org_id = target.org_id)
      OR EXISTS (SELECT 1 FROM admin_grants g WHERE g.person_id = NEW.id
        AND (g.org_id = target.org_id OR (g.org_id = '' AND g.admin_level = 'super_admin'))));
DROP TRIGGER IF EXISTS cv_authz_persons_d;
CREATE TRIGGER cv_authz_persons_d AFTER DELETE ON persons FOR EACH ROW
  UPDATE authorization_organizations target SET revision = revision + 1
    WHERE EXISTS (SELECT 1 FROM organization_memberships m WHERE m.person_id = OLD.id AND m.org_id = target.org_id)
      OR EXISTS (SELECT 1 FROM admin_grants g WHERE g.person_id = OLD.id
        AND (g.org_id = target.org_id OR (g.org_id = '' AND g.admin_level = 'super_admin')));
