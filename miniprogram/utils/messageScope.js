let selectedOrganizationId = '';
let selectedOrganizationName = '全部组织';

function getScope() {
  return {
    organizationId: selectedOrganizationId,
    organizationName: selectedOrganizationName
  };
}

function setScope(organization) {
  const next = organization || {};
  selectedOrganizationId = String(next.id || '');
  selectedOrganizationName = String(next.name || '全部组织');
  return getScope();
}

function resetScope() {
  selectedOrganizationId = '';
  selectedOrganizationName = '全部组织';
  return getScope();
}

module.exports = { getScope, setScope, resetScope };
