const PORTAL_ROUTE = '/subpackages/main/pages/portal/portal';

function finishSwitch() {
  // 显式切换必须销毁旧页面栈。旧页即使在新角色下仍“可用”，其请求、
  // 页签和组件状态也属于切换前的会话，不能通过 navigateBack 继续复用。
  wx.reLaunch({ url: PORTAL_ROUTE });
  return 'portal';
}

module.exports = {
  PORTAL_ROUTE,
  finishSwitch
};
