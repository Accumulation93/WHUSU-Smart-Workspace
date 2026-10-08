// 由 scripts/sync-shared-modules.js 从唯一源生成，请勿直接修改；修改唯一源后重新运行 node scripts/sync-shared-modules.js --write
'use strict';

/**
 * 主包语言资源聚合。
 *
 * 登录、门户、消息中心的文案已经并入共享语言库（唯一源 shared/locales/zh-CN/**），
 * 这里只做聚合，不再保存文案本身；本文件与 shared 的副本由
 * scripts/sync-shared-modules.js 保持同步，副本不一致时检查失败。
 */

import home from './home.js';
import login from './login.js';
import portal from './portal.js';
import messageCenter from './messages.js';
const passwordBinding = Object.freeze({
  title: '绑定当前微信',
  note: '是否将当前微信绑定到刚刚口令登录的账号？仅在这是你本人的账号时绑定，也可以暂不绑定。',
  confirm: '确认绑定',
  cancel: '暂不绑定',
  success: '绑定成功',
  failed: '未绑定，请稍后重试'
});

const authContext = Object.freeze({
  switchFailed: '切换失败，请重试',
  reopenWorkContext: '请重新打开组织与工作角色',
  selectAccessibleOrganization: '请选择可访问的组织',
  relogin: '请重新微信登录'
});

const sharedModule = Object.freeze({ login, portal, messageCenter, home, authContext, passwordBinding });

export { login, portal, messageCenter, home, authContext, passwordBinding };
export default sharedModule;
