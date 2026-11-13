// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
'use strict';

const COPY_KINDS = ['scoring.templates', 'hr.departments', 'hr.identities', 'hr.workGroups', 'hr.assignmentNatures',
  'hr.directoryRules', 'audit.templates', 'venue.approvals', 'venue.bookingRules', 'venue.bookingWindows',
  'venue.openRules', 'venue.activityRules', 'venue.purposes', 'calendar.rules', 'authorization.schemes'];

function canOpenAuthorization(access) {
  return !!access && access.mode === 'enforced'
    && (access.canManageAuthorization === true || access.canInspectOwnAuthorization === true || access.canInspectAuthorization === true);
}

function canOpenConfigurationCopy(access) {
  if (!access || access.mode !== 'enforced' || !Array.isArray(access.grantedCapabilities)) return false;
  return COPY_KINDS.some(kind => access.grantedCapabilities.includes(kind + '.share')
    || access.grantedCapabilities.includes(kind + '.receive'));
}

function configurationCopyOptions(access, preferredKind, preferredTab) {
  const kinds = canOpenConfigurationCopy(access) ? COPY_KINDS.filter(kind =>
    access.grantedCapabilities.includes(kind + '.share') || access.grantedCapabilities.includes(kind + '.receive')) : [];
  const kind = kinds.includes(preferredKind) ? preferredKind : kinds[0] || '';
  const share = kind && access.grantedCapabilities.includes(kind + '.share');
  const receive = kind && access.grantedCapabilities.includes(kind + '.receive');
  const tabs = ['source', 'incoming', 'drafts', 'outgoing'].filter(tab =>
    (tab === 'source' || tab === 'outgoing') ? share : receive);
  return { kinds, kind, tabs, tab: tabs.includes(preferredTab) ? preferredTab : tabs[0] || '' };
}

const sharedModule = Object.freeze({ canOpenAuthorization, canOpenConfigurationCopy, configurationCopyOptions });

export { canOpenAuthorization, canOpenConfigurationCopy, configurationCopyOptions };
export default sharedModule;
