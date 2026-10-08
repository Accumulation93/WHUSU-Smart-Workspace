// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
'use strict';

/**
 * 门户（应用服务）的用户可见文案（共享语言库，唯一来源）。
 *
 * 小程序与网页都从这里取文案：网页侧由 scripts/sync-shared-modules.js 生成 ES 模块副本，
 * 小程序侧生成同名 CommonJS 副本，副本不一致时检查直接失败。
 * 修改文案只能改本文件，改完运行 node scripts/sync-shared-modules.js --write。
 */

import common from './common.js';
const sharedModule = Object.freeze({
  /* 网页端在门户展示的局部加载提示；小程序门户用同义提示，值保持一致 */
  partialOrganizationLoading: '部分组织暂未加载，正在重试',
  navigationTitle: '应用服务 - WHUSU智慧工作台',
  appName: common.brandName,
  pageName: '应用服务',
  organizationName: common.organizationName,
  categoryLabels: Object.freeze({ audit: '审核', venue: '场地', scoring: '考核', hr: '人事', system: '其他' }),
  cards: Object.freeze({
    scan: '扫一扫',
    messages: '消息中心',
    workContextSwitch: '组织与工作角色',
    scoring: '考核评分',
    hr: '人事信息',
    audit: '审核',
    venueBooking: '场地借用',
    system: '基本设置',
    venueManage: '场地管理',
    permissions: '权限管理'
  }),
  workContext: Object.freeze({
    signedOut: '未登录',
    superAdmin: '超级管理员',
    admin: '普通管理员',
    unset: '未设置岗位',
    welcome: '欢迎使用'
  }),
  messages: Object.freeze({
    notification: '通知',
    todo: '待办',
    readFailed: '标记已读失败，请重试',
    deleteFailed: '删除失败，请重试',
    incomplete: '操作未完成，请重试',
    partialBulkAction: '部分未完成',
    retryLater: common.actions.retryLater,
    switchWorkContext: '切换工作角色后查看',
    switchOrganizationAndWorkContext: '切换组织与工作角色后查看',
    targetOrganization: '目标组织',
    selectWorkContext: '请重新选择工作角色',
    selectOrganization: '请重新选择组织',
    switchFailed: '切换失败，请重试'
  }),
  view: Object.freeze({
    appName: common.brandName,
    pageName: '应用服务',
    organizationName: common.organizationName,
    workContextHint: '工作角色提示',
    loadingHint: '加载提示',
    partialOrganizationLoading: '部分组织暂未加载，正在重试',
    todoTitle: '待办事项',
    totalPrefix: '共',
    itemSuffix: '条',
    viewAll: '查看全部',
    noTodos: '暂无待处理事项',
    todoType: '待办类型',
    organization: '所属组织',
    current: '当前',
    enter: common.actions.enter,
    loadingMore: '正在加载更多…',
    notificationTitle: '通知',
    markAllRead: '全部已读',
    noNotifications: '暂无通知',
    notificationType: '通知类型',
    delete: '删除',
    servicesTitle: '应用服务',
    grid: '宫格',
    list: '列表',
    search: '搜索',
    searchPlaceholder: '搜索应用…',
    clearSearch: '清除搜索',
    scan: '扫一扫',
    scanResultTitle: '扫到的内容',
    scanExternalHint: '这不是站内地址，可复制后用浏览器打开',
    scanCopyAction: '复制内容',
    scanCloseAction: '关闭',
    scanFailed: '暂时无法打开扫一扫，请检查相机权限后重试',
    navLoginAction: '登录',
    authUnavailable: '暂时无法确认登录状态，可重试或手动登录',
    authFrozen: '账号已被冻结，登录后可查看处理方式',
    authRetryAction: '重试',
    authLoginAction: '去登录',
    noMatchingApps: '没有匹配的应用',
    noApps: '暂无应用',
    developing: '开发中',
    workContextSwitch: '组织与工作角色',
    logout: '退出登录',
    crossOrganization: '跨组织事项',
    switchDescription: '切换到以下组织后查看',
    cancel: common.actions.cancel,
    switchAndView: '切换并查看'
  })
});

export default sharedModule;
