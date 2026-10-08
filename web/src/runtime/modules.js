import copy from '@/locales/zh-CN/index.js';

/**
 * 网页版的应用服务入口，顺序、图标与小程序门户保持一致。
 *
 * 图标名取自 web/public/icons 下与小程序 assets/icons 字节一致的那批 SVG。
 * 未接入的入口明确标注「制作中」，点击后给出说明，不提供半成品页面。
 */

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
    route: { name: 'adminConsole' }
  },
  {
    key: 'hr',
    label: copy.portal.hr,
    iconName: 'list',
    status: READY,
    route: { name: 'hrProfile' }
  },
  {
    key: 'system',
    label: copy.portal.system,
    iconName: 'shield',
    status: READY,
    route: { name: 'adminConsole' }
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

/**
 * 顶部玻璃分段页签。
 *
 * 小程序在手机、Pad 竖屏、Pad 横屏都保持同一套顶部分段页签语言，
 * 所以网页端也不使用宽侧边栏。可见页签控制在五项以内，单行等宽排列；
 * 超过五项时由外壳改为横向滚动，不会出现孤立的第二行。
 */
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

/** 保留旧名，避免历史引用失效；外壳已改用 shellTabsForRole。 */
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
