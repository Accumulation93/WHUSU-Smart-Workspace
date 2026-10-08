/**
 * 消息中心文案。
 *
 * 取值逐条照抄小程序 miniprogram/locales/zh-CN/main.js 的 messageCenter 对象。
 * 小程序在成功删除、成功标记已读时不弹提示，只在失败时提示，网页保持同一行为。
 */
export default Object.freeze({
  navigationTitle: '消息中心 - WHUSU智慧工作台',
  title: '消息中心',
  categoryLabels: Object.freeze({
    audit: '审核',
    venue: '场地',
    scoring: '考核',
    hr: '人事',
    system: '其他'
  }),
  tabTodo: '待办',
  tabNotification: '通知',
  currentTodos: '当前待办',
  allNotifications: '全部通知',
  organizationScope: '组织范围',
  selectOrganization: '选择组织',
  allOrganizations: '全部组织',
  partialOrganizationLoading: '部分组织暂未加载，正在重试',
  loading: '正在加载…',
  markAllRead: '全部已读',
  clearAll: '全部清除',
  clearAllConfirmTitle: '清除全部通知',
  clearAllConfirmBody: '将清除当前可见组织范围内的全部通知，待我审批事项不受影响。',
  deleteOne: '删除通知',
  emptyTodo: '暂无待处理事项',
  emptyNotification: '暂无通知',
  deleteFailed: '删除失败，请重试',
  clearFailed: '清除失败，请重试',
  readFailed: '标记已读失败，请重试',
  incomplete: '操作未完成，请重试',
  partialBulkAction: '部分未完成',
  retryLater: '请稍后重试',
  loadMore: '正在加载更多…',
  organization: '所属组织',
  current: '当前',
  enter: '进入',
  selected: '已选择',
  confirm: '确定',
  close: '关闭',
  switchAndView: '切换并查看',
  crossOrganizationItem: '跨组织事项',
  switchDescription: '切换到以下组织后查看'
});
