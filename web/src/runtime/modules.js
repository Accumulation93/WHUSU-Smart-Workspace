import copy from '@/locales/zh-CN/index.js';
import identityCardCopy from '@/locales/zh-CN/shared/identityCard.js';
import calendarCopy from '@/locales/zh-CN/shared/calendar.js';
import portalCopy from '@/locales/zh-CN/shared/portal.js';
import authorizationCopy from '@/locales/zh-CN/shared/authorization.js';
import { canOpenAuthorization, canOpenConfigurationCopy, domainAccess } from '@/shared/authorizationEntryView.js';

export const MODULE_STATUS = Object.freeze({
  ready: 'ready',
  building: 'building'
});

const READY = MODULE_STATUS.ready;
const BUILDING = MODULE_STATUS.building;

export const USER_CARDS = Object.freeze([
  {
    key: 'messages',
    label: copy.portal.messages,
    iconName: 'bell',
    status: READY,
    route: { name: 'messages' }
  },
  {
    key: 'workRole',
    label: copy.portal.workContextSwitch,
    iconName: 'role-switch',
    status: READY,
    route: { name: 'workRole' }
  },
  {
    key: 'scoring',
    label: copy.portal.scoring,
    iconName: 'grid',
    status: READY,
    route: { name: 'scoringTasks' }
  },
  {
    key: 'hr',
    label: copy.portal.hr,
    iconName: 'personnel',
    status: READY,
    route: { name: 'hrProfile' }
  },
  {
    key: 'audit',
    label: copy.portal.audit,
    iconName: 'file',
    status: READY,
    route: { name: 'auditMySubmissions' }
  },
  {
    key: 'verification',
    label: copy.audit.verificationTitle,
    iconName: 'shield',
    status: READY,
    route: { name: 'auditVerification' }
  },
  {
    key: 'venue',
    label: copy.portal.venueBooking,
    iconName: 'venue',
    status: READY,
    route: { name: 'venueBookings' }
  },
  { key: 'identityCard', label: identityCardCopy.title, iconName: 'id-card', status: READY, route: { name: 'identityCard' } },
  { key: 'calendar', label: calendarCopy.title, iconName: 'calendar', status: READY, route: { name: 'calendar' } }
]);

export const ADMIN_CARDS = Object.freeze([
  { key: 'calendar', label: calendarCopy.title, iconName: 'calendar', status: READY, route: { name: 'calendar' } },
  { key: 'identityCard', label: identityCardCopy.title, iconName: 'id-card', status: READY, route: { name: 'identityCard' } },
  USER_CARDS[0],
  USER_CARDS[1],
  {
    key: 'scoring',
    label: copy.portal.scoring,
    iconName: 'grid',
    status: READY,
    route: { name: 'adminConsole', query: { subApp: 'scoring' } }
  },
  {
    key: 'hr',
    label: copy.portal.hr,
    iconName: 'personnel',
    status: READY,
    route: { name: 'adminConsole', query: { subApp: 'hr' } }
  },
  {
    key: 'system',
    label: copy.portal.system,
    iconName: 'settings',
    status: READY,
    route: { name: 'adminConsole', query: { subApp: 'system' } }
  },
  {
    key: 'audit',
    label: copy.portal.audit,
    iconName: 'file',
    status: READY,
    route: { name: 'adminConsole', query: { subApp: 'audit' } }
  },
  {
    key: 'verification',
    label: copy.audit.verificationTitle,
    iconName: 'shield',
    status: READY,
    route: { name: 'auditVerification' }
  },
  {
    key: 'venueManage',
    label: copy.portal.venueManage,
    iconName: 'venue',
    status: READY,
    route: { name: 'venueManage' }
  },
  {
    key: 'permissions',
    label: copy.portal.permissions,
    iconName: 'permission-key',
    status: READY,
    route: { name: 'authorization' }
  }
]);

export function cardsForRole(role) {
  return role === 'admin' ? ADMIN_CARDS : USER_CARDS;
}

export function cardsForContext(role, identityModel, access) {
  if (identityModel !== 'unified') return cardsForRole(role);
  const domains = USER_CARDS.filter(card => card.key !== 'verification')
    .concat(ADMIN_CARDS.filter(card => card.key === 'system'));
  const cards = domains.flatMap(card => {
    const permissions = domainAccess(access, card.key);
    if (!permissions.business && !permissions.management) return [];
    const startInManagement = !permissions.business && permissions.management && card.key !== 'system';
    const route = startInManagement ? { ...card.route, query: { area: 'management' } } : card.route;
    if (card.key === 'venue') return [{ ...card, route, label: portalCopy.cards.venue,
      searchAliases: [portalCopy.cards.venueBooking, portalCopy.cards.venueManage] }];
    if (card.key === 'audit') return [{ ...card, route, searchAliases: [portalCopy.cards.auditVerification, copy.audit.verificationTitle] }];
    return [{ ...card, route }];
  });
  if (canOpenAuthorization(access)) cards.push(ADMIN_CARDS.find(card => card.key === 'permissions'));
  if (canOpenConfigurationCopy(access)) cards.push({ key: 'organizationCopy',
    label: authorizationCopy.configurationCopy.title, iconName: 'org-transfer', status: READY, route: { name: 'organizationCopy' } });
  return cards;
}

export function shellTabsForRole(role) {
  return [
    { key: 'portal', label: copy.portal.pageName, route: { name: 'portal' }, match: '/portal' },
    {
      key: 'audit',
      label: copy.portal.audit,
      route: { name: 'auditMySubmissions' },
      match: '/audit'
    },
    {
      key: 'venue',
      label: copy.portal.venueBooking,
      route: { name: 'venueBookings' },
      match: '/venue'
    },
    role === 'admin'
      ? { key: 'admin', label: copy.admin.title, route: { name: 'adminConsole' }, match: '/admin' }
      : {
          key: 'scoring',
          label: copy.portal.scoring,
          route: { name: 'scoringTasks' },
          match: '/scoring'
        },
    {
      key: 'messages',
      label: copy.portal.messages,
      route: { name: 'messages' },
      match: '/messages'
    }
  ];
}

export const SIDEBAR_ENTRIES = Object.freeze([
  { key: 'portal', label: copy.portal.pageName, route: { name: 'portal' }, match: '/portal' },
  { key: 'workbench', label: copy.workbench.title, route: { name: 'workbench' }, match: '/workbench' },
  { key: 'scoring', label: copy.portal.scoring, route: { name: 'scoringTasks' }, match: '/scoring' },
  { key: 'hr', label: copy.portal.hr, route: { name: 'hrProfile' }, match: '/hr' },
  { key: 'audit', label: copy.portal.audit, route: { name: 'auditMySubmissions' }, match: '/audit' },
  { key: 'venue', label: copy.portal.venueBooking, route: { name: 'venueBookings' }, match: '/venue' },
  { key: 'admin', label: copy.admin.title, route: { name: 'adminConsole' }, match: '/admin' },
  { key: 'messages', label: copy.portal.messages, route: { name: 'messages' }, match: '/messages' },
  { key: 'workRole', label: copy.portal.workContextSwitch, route: { name: 'workRole' }, match: '/work-role' }
]);
