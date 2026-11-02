'use strict';

const COPY_KINDS = ['scoring.templates', 'hr.departments', 'hr.identities', 'hr.workGroups', 'hr.assignmentNatures',
  'hr.directoryRules', 'audit.templates', 'venue.approvals', 'venue.bookingRules', 'venue.bookingWindows',
  'venue.openRules', 'venue.activityRules', 'venue.purposes', 'calendar.rules', 'authorization.schemes'];

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

module.exports = { canOpenConfigurationCopy, configurationCopyOptions };
