'use strict';

/**
 * 消息中心的用户可见文案（共享语言库，唯一来源）。
 *
 * 小程序与网页都从这里取文案：网页侧由 scripts/sync-shared-modules.js 生成 ES 模块副本，
 * 小程序侧生成同名 CommonJS 副本，副本不一致时检查直接失败。
 * 修改文案只能改本文件，改完运行 node scripts/sync-shared-modules.js --write。
 */

const common = require('./common');

module.exports = Object.freeze({
  navigationTitle: '消息中心 - WHUSU智慧工作台',
  categoryLabels: Object.freeze({
    audit: '审核',
    venue: '场地',
    scoring: '考核',
    hr: '人事',
    calendar: '日程',
    system: '其他'
  }),
  messages: Object.freeze({
    notification: '通知',
    allOrganizations: '全部组织',
    selectOrganizationOrWorkContext: '请重新选择组织或工作角色',
    refreshLater: '请稍后重试',
    retryLater: '请稍后重试',
    switchWorkContext: '切换工作角色后查看',
    switchOrganizationAndWorkContext: '切换组织与工作角色后查看',
    targetOrganization: '目标组织',
    notificationReadFailed: '标记已读失败，请重试',
    selectWorkContext: '请重新选择工作角色',
    selectOrganization: '请重新选择组织',
    switchFailed: '切换失败，请重试',
    incomplete: '操作未完成，请刷新查看结果',
    partialBulkAction: '部分操作未完成，请刷新后核对',
    deleteFailed: '删除失败，请重试',
    clearFailed: '清除失败，请重试',
    clearTitle: '清除全部通知',
    clearDescription: '清除当前所选组织范围内的全部通知后，你在其他设备和工作角色下也不会再看到这些通知。待办和业务记录不受影响。',
    clearConfirm: '全部清除'
  }),
  view: Object.freeze({
    appName: common.brandName,
    pageName: '消息中心',
    todos: '待办',
    notifications: '通知',
    organizationScope: '组织范围',
    selectOrganization: '选择组织',
    loadingHint: '加载提示',
    partialOrganizationLoading: '部分组织的内容暂未加载，请重试',
    currentTodos: '当前待办',
    allNotifications: '全部通知',
    markAllRead: '全部标为已读',
    clearAll: '全部清除',
    noTodos: '暂无待处理事项',
    noNotifications: '暂无通知',
    organization: '所属组织',
    current: '当前',
    enter: common.actions.enter,
    deleteNotification: '删除通知',
    loading: '正在加载消息',
    crossOrganizationItem: '跨组织事项',
    switchDescription: '切换到以下组织与工作角色后查看',
    cancel: common.actions.cancel,
    switchAndView: '切换并查看',
    selectOrganizationScope: '选择组织范围',
    close: common.actions.close,
    selected: '已选择',
    confirm: '确定'
  })
});
