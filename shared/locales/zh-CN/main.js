'use strict';

/**
 * 主包语言资源聚合。
 *
 * 登录、门户、消息中心的文案已经并入共享语言库（唯一源 shared/locales/zh-CN/**），
 * 本文件聚合模块并保存登录后的共享提示；本文件与 shared 的副本由
 * scripts/sync-shared-modules.js 保持同步，副本不一致时检查失败。
 */

const home = require('./home');
const login = require('./login');
const portal = require('./portal');
const messageCenter = require('./messages');

const passwordBinding = Object.freeze({
  title: '绑定当前微信',
  note: '是否将当前微信绑定到刚刚口令登录的账号？仅在这是你本人的账号时绑定，也可以暂不绑定。',
  confirm: '确认绑定',
  cancel: '暂不绑定',
  success: '绑定成功',
  failed: '暂未确认绑定结果，请稍后查看；当前登录不受影响。'
});

const authContext = Object.freeze({
  switchFailed: '切换失败，请重试',
  reopenWorkContext: '请重新打开“组织与工作角色”选择页面',
  selectAccessibleOrganization: '请选择可访问的组织',
  relogin: '登录已失效，请重新登录'
});

module.exports = Object.freeze({ login, portal, messageCenter, home, authContext, passwordBinding });
