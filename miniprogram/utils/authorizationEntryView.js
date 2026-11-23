'use strict';

const COPY_KINDS = ['scoring.templates', 'hr.departments', 'hr.identities', 'hr.workGroups', 'hr.assignmentNatures',
  'hr.directoryRules', 'audit.templates', 'venue.approvals', 'venue.bookingRules', 'venue.bookingWindows',
  'venue.openRules', 'venue.activityRules', 'venue.purposes', 'calendar.rules', 'authorization.schemes'];
const accessView = require('./authorizationAccessView');

const DOMAIN_ENTRIES = Object.freeze({
  audit: { business: ['audit.submissions.read', 'audit.submissions.create', 'audit.submissions.approve', 'audit.verification.verify'],
    management: ['auditTemplates', 'auditStamps', 'auditSubmissions', 'auditVerification'] },
  venue: { business: ['venue.resources.read', 'venue.schedule.read', 'venue.bookings.read', 'venue.bookings.create', 'venue.bookings.approve'],
    management: ['venue', 'bookings', 'pending', 'purposes'] },
  hr: { business: ['contacts.entries.read'], management: ['hrInfo', 'hrTemplates', 'departments', 'workGroups', 'identities', 'assignmentNatures'] },
  scoring: { business: ['scoring.participation.read', 'scoring.publishedResults.read', 'scoring.meritSelections.read'],
    management: ['activities', 'templates', 'rules', 'results', 'publications'] },
  system: { business: [], management: ['settings'] },
  calendar: { business: ['calendar.events.read', 'calendar.events.create'], management: ['calendarRules'] },
  identityCard: { business: ['identity.cards.read', 'identity.cards.create'], management: ['identityCardSettings'] },
  messages: { business: ['notifications.items.read'], management: [] }
});

function domainAccess(access, key) {
  const domain = DOMAIN_ENTRIES[key];
  if (!domain) return { business: true, management: false };
  if (!access || access.mode !== 'enforced') return { business: false, management: false };
  const accountSelfService = key === 'hr';
  return {
    business: accountSelfService || domain.business.some(capability => accessView.hasCapability(access, capability, false)),
    management: domain.management.some(tab => accessView.managementTabAllowed(access, tab))
  };
}

function cardMatches(card, keyword) {
  return [card.label].concat(card.searchAliases || []).some(label => String(label || '').toLowerCase().includes(keyword));
}

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

module.exports = { canOpenAuthorization, canOpenConfigurationCopy, configurationCopyOptions, domainAccess, cardMatches };
