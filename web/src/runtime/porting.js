import copy from '@/locales/zh-CN/index.js';
import { showToast } from './notify.js';

/**
 * 尚未接入网页版的模块统一给出同一条说明。
 *
 * 服务端下发的消息目标地址仍是小程序路由，网页端在没有对应页面时
 * 必须明确告知用户去小程序办理，不能跳到一个空页面。
 */

export const MODULE_BUILDING_TITLE = copy.workbench.notPortedTitle;
export const MODULE_BUILDING_BODY = copy.workbench.notPortedBody;

export function notifyModuleBuilding() {
  showToast(MODULE_BUILDING_BODY);
}

export function isRunningInMiniProgramTarget(targetUrl) {
  return typeof targetUrl === 'string' && targetUrl.startsWith('/subpackages/');
}
