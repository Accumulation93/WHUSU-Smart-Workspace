const localeCopy = require('../locales/zh-CN/generated/utils/messageScope');
let selectedOrganizationId = '';
let selectedOrganizationName = localeCopy.copy_d337157f74;

function getScope() {
  return {
    organizationId: selectedOrganizationId,
    organizationName: selectedOrganizationName
  };
}

function setScope(organization) {
  const next = organization || {};
  selectedOrganizationId = String(next.id || '');
  selectedOrganizationName = String(next.name || localeCopy.copy_d337157f74);
  return getScope();
}

function resetScope() {
  selectedOrganizationId = '';
  selectedOrganizationName = localeCopy.copy_d337157f74;
  return getScope();
}

module.exports = { getScope, setScope, resetScope };
