/**
 * 门户文案。
 *
 * 取值逐条照抄小程序 miniprogram/locales/zh-CN/main.js 的 portal 对象，
 * 不做改写、不换说法；网页端没有的能力（扫一扫、微信登录）不在这里登记。
 */
export default Object.freeze({
  navigationTitle: '应用服务 - WHUSU智慧工作台',
  appName: 'WHUSU智慧工作台',
  title: '应用服务',
  pageName: '应用服务',
  organizationName: '武汉大学学生会',
  categoryLabels: Object.freeze({ audit: '审核', venue: '场地', scoring: '考核', hr: '人事', system: '其他' }),
  cards: Object.freeze({
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
  todoTitle: '待办事项',
  totalPrefix: '共',
  itemSuffix: '条',
  viewAll: '查看全部',
  noTodos: '暂无待处理事项',
  partialOrganizationLoading: '部分组织暂未加载，正在重试',
  organization: '所属组织',
  current: '当前',
  enter: '进入',
  loadingMore: '正在加载更多…',
  notificationTitle: '通知',
  markAllRead: '全部已读',
  noNotifications: '暂无通知',
  delete: '删除',
  servicesTitle: '应用服务',
  grid: '宫格',
  list: '列表',
  search: '搜索',
  searchPlaceholder: '搜索应用…',
  clearSearch: '清除搜索',
  noMatchingApps: '没有匹配的应用',
  noApps: '暂无应用',
  developing: '开发中',
  workContextSwitchLabel: '组织与工作角色',
  logout: '退出登录',
  crossOrganization: '跨组织事项',
  switchDescription: '切换到以下组织后查看',
  cancel: '取消',
  switchAndView: '切换并查看',
  retryLater: '请稍后再试',
  close: '关闭'
});
