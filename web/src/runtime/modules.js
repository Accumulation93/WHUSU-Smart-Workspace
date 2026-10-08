import copy from '@/locales/zh-CN/index.js';

/**
 * 网页版的应用服务入口，顺序与小程序门户保持一致。
 *
 * 第一期开放消息中心、工作角色、门户和工作台；考核评分、人事信息、审核、
 * 场地借用以及管理端入口按计划在后续阶段接入。未接入的入口明确标注"制作中"，
 * 点击后给出说明，不提供半成品页面。
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
    label: copy.portal.entryMessages,
    status: READY,
    route: { name: 'messages' }
  },
  {
    key: 'workRole',
    label: copy.portal.entryRole,
    status: READY,
    route: { name: 'workRole' }
  },
  {
    key: 'scoring',
    label: copy.portal.entryScoring,
    status: BUILDING,
    route: { name: 'workbench', query: { subApp: 'scoring' } }
  },
  {
    key: 'hr',
    label: copy.portal.entryHr,
    status: BUILDING,
    route: { name: 'workbench', query: { subApp: 'hr' } }
  },
  {
    key: 'audit',
    label: copy.portal.entryAudit,
    status: BUILDING,
    route: { name: 'workbench', query: { subApp: 'audit' } }
  },
  {
    key: 'venue',
    label: copy.portal.entryVenue,
    status: BUILDING,
    route: { name: 'workbench', query: { subApp: 'venue' } }
  }
]);

export const ADMIN_CARDS = Object.freeze([
  USER_CARDS[0],
  USER_CARDS[1],
  {
    key: 'scoring',
    label: copy.portal.entryScoring,
    status: BUILDING,
    route: { name: 'workbench', query: { subApp: 'scoring' } }
  },
  {
    key: 'hr',
    label: copy.portal.entryHr,
    status: BUILDING,
    route: { name: 'workbench', query: { subApp: 'hr' } }
  },
  {
    key: 'system',
    label: copy.portal.entrySystem,
    status: BUILDING,
    route: { name: 'workbench', query: { subApp: 'system' } }
  },
  {
    key: 'audit',
    label: copy.portal.entryAudit,
    status: BUILDING,
    route: { name: 'workbench', query: { subApp: 'audit' } }
  },
  {
    key: 'venueManage',
    label: copy.portal.entryVenueManage,
    status: BUILDING,
    route: { name: 'workbench', query: { subApp: 'venue' } }
  },
  {
    key: 'permissions',
    label: copy.portal.entryPermissions,
    status: BUILDING,
    route: { name: 'workbench', query: { subApp: 'permissions' } }
  }
]);

export function cardsForRole(role) {
  return role === 'admin' ? ADMIN_CARDS : USER_CARDS;
}

export const SIDEBAR_ENTRIES = Object.freeze([
  { key: 'portal', label: copy.portal.title, route: { name: 'portal' } },
  { key: 'workbench', label: copy.workbench.title, route: { name: 'workbench' } },
  { key: 'messages', label: copy.portal.entryMessages, route: { name: 'messages' } },
  { key: 'workRole', label: copy.portal.entryRole, route: { name: 'workRole' } }
]);
