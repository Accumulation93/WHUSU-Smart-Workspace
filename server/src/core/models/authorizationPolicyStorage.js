'use strict';

const { CATALOG } = require('../services/authorizationCatalog');

function extended(policy) {
  return Boolean(policy && (policy.allocationSubjects || policy.capabilities.some(key => CATALOG.get(key)?.allocationCapability)));
}

function encode(policy) {
  if (!extended(policy)) return { legacy: JSON.stringify(policy), allocation: null };
  const { allocationSubjects: _subjects, ...legacy } = policy;
  const containsAllocation = policy.capabilities.some(key => CATALOG.get(key)?.allocationCapability);
  legacy.capabilities = [...new Set(policy.capabilities.map(key => CATALOG.get(key)?.allocationCapability || key))].sort();
  if (containsAllocation) legacy.enabled = false;
  return { legacy: JSON.stringify(legacy), allocation: JSON.stringify(policy) };
}

module.exports = { encode, extended };
