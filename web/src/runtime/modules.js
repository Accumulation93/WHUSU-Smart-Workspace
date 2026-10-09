import copy from '@/locales/zh-CN/index.js';

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
    iconName: 'user',
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
    iconName: 'list',
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
  }
]);

export const ADMIN_CARDS = Object.freeze([
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
    iconName: 'list',
    status: READY,
    route: { name: 'adminConsole', query: { subApp: 'hr' } }
  },
  {
    key: 'system',
    label: copy.portal.system,
    iconName: 'shield',
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
    iconName: 'calendar',
    status: READY,
    route: { name: 'venueManage' }
  },
  {
    key: 'permissions',
    label: copy.portal.permissions,
    iconName: 'shield',
    status: READY,
    route: { name: 'adminPermissions' }
  }
]);

export function cardsForRole(role) {
  return role === 'admin' ? ADMIN_CARDS : USER_CARDS;
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
