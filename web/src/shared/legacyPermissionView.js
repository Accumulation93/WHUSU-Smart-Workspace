// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
'use strict';

function createLegacyPermissionView(copy) {
  function permission(item) {
    const key = String(item.key || '');
    const definition = Object.prototype.hasOwnProperty.call(copy.permissions, key) ? copy.permissions[key] : null;
    const base = key.endsWith('.delete') ? key.slice(0, -7) : '';
    const deletion = base && Object.prototype.hasOwnProperty.call(copy.deletePermissions, base) ? copy.deletePermissions[base] : '';
    const known = Boolean(definition || deletion);
    return Object.assign({}, item, {
      label: definition ? definition[0] : deletion || copy.unknown,
      description: definition ? definition[1] : deletion ? copy.deleteDescription : copy.unknownDescription,
      editable: known && item.editable === true,
      recognized: known
    });
  }
  function groups(source) {
    return (Array.isArray(source) ? source : []).map(function(group) {
      return Object.assign({}, group, {
        label: Object.prototype.hasOwnProperty.call(copy.groups, group.key) ? copy.groups[group.key] : copy.unknownGroup,
        description: '',
        permissions: (Array.isArray(group.permissions) ? group.permissions : [])
          .filter(function(item) { return item && item.key !== 'auth.accounts.audit'; }).map(permission)
      });
    });
  }
  function admin(source) {
    const item = source || {};
    return Object.assign({}, item, {
      adminLevelLabel: Object.prototype.hasOwnProperty.call(copy.adminLevels, item.adminLevel)
        ? copy.adminLevels[item.adminLevel] : copy.unknownAdminLevel,
      bindStatusLabel: Object.prototype.hasOwnProperty.call(copy.accountStates, item.authenticationStatus)
        ? copy.accountStates[item.authenticationStatus] : copy.unknownAccountState
    });
  }
  return { groups: groups, admin: admin };
}

const sharedModule = Object.freeze({ createLegacyPermissionView });

export { createLegacyPermissionView };
export default sharedModule;
