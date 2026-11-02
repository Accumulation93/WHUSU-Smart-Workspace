'use strict';

const crypto = require('crypto');
const legacy = require('./adminPermissions');
const { CATALOG, capabilitiesForLegacy } = require('./authorizationCatalog');
const { normalizePolicy } = require('./authorizationPolicy');
const { authorizationError } = require('./authorizationError');
const copy = require('../../locales/zh-CN/authorization');

const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function effective(baseline) {
  return { permissions: Object.fromEntries(baseline.keys.map(key => [key, true])),
    canAccessPermissionSystem: baseline.delegationRequested, keys: baseline.keys };
}

function plan(inventory) {
  if (!inventory || !inventory.organizationId || !Array.isArray(inventory.baselines)
    || !Array.isArray(inventory.issues) || inventory.issues.length) throw authorizationError('authorization_migration_unresolved');
  const organizationId = inventory.organizationId;
  const rules = [];
  const delegations = [];
  for (const baseline of inventory.baselines) {
    if (baseline.organizationId !== organizationId || baseline.issues.length) throw authorizationError('authorization_migration_unresolved');
    for (const key of baseline.keys) {
      if (key === 'permissions.manage_regular_admins') continue;
      const capabilities = capabilitiesForLegacy([key]);
      if (!capabilities.length) throw authorizationError('authorization_migration_unresolved');
      const id = digest(['legacy-rule', organizationId, baseline.adminGrantId, key]);
      const policy = normalizePolicy({ id, organizationId, effect: 'allow', enabled: true,
        subjects: [{ kind: 'adminGrants', ids: [baseline.adminGrantId] }], capabilities,
        scopes: [{ kind: 'organization' }], fields: null }, CATALOG);
      rules.push({ id, sourceRef: id, name: legacy.PERMISSION_DEFINITIONS.get(key).label,
        legacyKey: key, adminGrantId: baseline.adminGrantId, policy });
    }
    if (!baseline.delegationRequested) continue;
    const operator = { id: baseline.legacyAdminId, org_id: organizationId, admin_level: 'admin' };
    for (const target of inventory.baselines) {
      const targetAdmin = { id: target.legacyAdminId, org_id: organizationId, admin_level: 'admin' };
      const keys = legacy.editablePermissionKeys(operator, effective(baseline), targetAdmin, organizationId, effective(target));
      const capabilities = capabilitiesForLegacy(keys);
      if (!capabilities.length) continue;
      const id = digest(['legacy-delegation', organizationId, baseline.adminGrantId, target.adminGrantId]);
      const envelope = normalizePolicy({ id, organizationId, effect: 'allow', enabled: true,
        subjects: [{ kind: 'adminGrants', ids: [target.adminGrantId] }], capabilities,
        scopes: [{ kind: 'organization' }], fields: null }, CATALOG);
      delegations.push({ id, name: copy.legacyDelegationName,
        subjects: [{ kind: 'adminGrants', ids: [baseline.adminGrantId] }], envelope });
    }
  }
  rules.sort((a, b) => a.id.localeCompare(b.id));
  delegations.sort((a, b) => a.id.localeCompare(b.id));
  const result = { organizationId, sourceDigests: inventory.baselines.map(item => ({ id: item.adminGrantId, digest: item.digest }))
    .sort((a, b) => a.id.localeCompare(b.id)), rules, delegations };
  return { ...result, digest: digest(result) };
}

module.exports = { plan };
