'use strict';

const crypto = require('crypto');
const legacy = require('./adminPermissions');
const { CATALOG, capabilitiesForLegacy } = require('./authorizationCatalog');

// 迁移前留存实际旧权限及入口条件。这里只生成核对材料，不能把目录草案当作已完成迁移。
function inspect({ organizationId, adminGrantId, admin, overrides }) {
  if (!organizationId || !adminGrantId || !admin || admin.admin_level !== 'admin'
    || admin.org_id !== organizationId || !Array.isArray(overrides)) {
    throw Object.assign(new Error('invalid_legacy_authorization_context'), { code: 'invalid_legacy_authorization_context' });
  }
  const issues = [];
  const effective = {};
  for (const [key, definition] of legacy.PERMISSION_DEFINITIONS) {
    effective[key] = legacy.defaultGranted(admin.admin_level, definition);
  }
  const seen = new Set();
  for (const row of overrides) {
    const key = row.permission_key;
    if (!legacy.PERMISSION_DEFINITIONS.has(key)) {
      issues.push({ kind: 'unknown_permission', key });
      continue;
    }
    if (seen.has(key)) issues.push({ kind: 'duplicate_override', key });
    seen.add(key);
    if (![0, 1, false, true].includes(row.granted)) {
      issues.push({ kind: 'invalid_granted', key });
      continue;
    }
    if (!legacy.isApplicable(key, admin.admin_level)) {
      if (row.granted === 1 || row.granted === true) issues.push({ kind: 'inapplicable_grant', key });
      continue;
    }
    effective[key] = row.granted === 1 || row.granted === true;
  }
  if (effective['system.admin_accounts.write']) effective['system.admin_accounts.read'] = true;
  if (effective['audit.submissions_delete']) effective['audit.submissions'] = true;
  const keys = Object.keys(effective).filter(key => effective[key]).sort();
  const routes = [...legacy.ROUTE_RULES].map(([path, rule]) => ({ path,
    allowed: rule.anyOf.some(key => effective[key]), requiredAny: rule.anyOf.slice().sort(),
    // 普通岗位的既有业务资格必须单独核对，不能迁移成该管理员的授权。
    hasBusinessRoleEntry: rule.allowUserRole === true
  })).sort((a, b) => a.path.localeCompare(b.path));
  const candidateCapabilities = capabilitiesForLegacy(keys);
  const delegationRequested = keys.includes('permissions.manage_regular_admins');
  const unmappedKeys = keys.filter(key => key !== 'permissions.manage_regular_admins'
    && ![...CATALOG.values()].some(definition => definition.legacyKeys.includes(key)));
  for (const key of unmappedKeys) issues.push({ kind: 'missing_capability_mapping', key });
  const baseline = { organizationId, adminGrantId, legacyAdminId: admin.id, keys, routes };
  return { ...baseline, candidateCapabilities, delegationRequested, issues, readyForCutover: false,
    digest: crypto.createHash('sha256').update(JSON.stringify(baseline)).digest('hex') };
}

module.exports = { inspect };
