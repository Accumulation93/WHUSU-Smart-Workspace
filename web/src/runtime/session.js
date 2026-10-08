import { computed, reactive } from 'vue';
import copy from '@/locales/zh-CN/index.js';
import { callApi, errorText, setAuthenticationLostHandler } from './api.js';
import { resetSystemTimezoneConfig } from './dateTime.js';

/**
 * 登录状态与当前工作角色。
 *
 * 登录凭证由服务端写在 HttpOnly Cookie 里，这里只保存页面渲染需要的账号资料、
 * 可切换的工作角色目录和当前角色。刷新页面时通过 auth/contexts 重新取得，
 * 不依赖任何本地缓存的登录信息。
 */

export const session = reactive({
  status: 'unknown',
  context: null,
  contexts: [],
  workContexts: [],
  organizations: [],
  user: null,
  activeRole: '',
  activeOrg: { id: '', name: '' },
  notice: ''
});

export const isAuthenticated = computed(() => session.status === 'authenticated');

export const currentWorkContext = computed(() => {
  if (!session.context) return null;
  return session.workContexts.find((item) => item.contextId === session.context.contextId)
    || session.workContexts.find((item) => item.isCurrent)
    || null;
});

let loadPromise = null;
let authenticationLostHandled = false;

function applyPayload(payload) {
  const data = payload && typeof payload === 'object' ? payload : {};
  session.context = data.context || null;
  session.contexts = Array.isArray(data.contexts) ? data.contexts : [];
  session.workContexts = Array.isArray(data.workContexts) ? data.workContexts : [];
  session.organizations = Array.isArray(data.organizations) ? data.organizations : [];
  session.user = data.user || null;
  session.activeRole = data.activeRole || (data.context && data.context.role) || '';
  session.activeOrg = data.activeOrg || {
    id: (data.context && data.context.organizationId) || '',
    name: (data.context && data.context.organizationName) || ''
  };
  session.status = 'authenticated';
  session.notice = '';
}

export function applyLoginResult(payload) {
  authenticationLostHandled = false;
  applyPayload(payload);
}

export function clearSession(notice) {
  session.status = 'anonymous';
  session.context = null;
  session.contexts = [];
  session.workContexts = [];
  session.organizations = [];
  session.user = null;
  session.activeRole = '';
  session.activeOrg = { id: '', name: '' };
  session.notice = notice || '';
  resetSystemTimezoneConfig();
}

/** 页面刷新或首次进入时确认登录状态；网络异常不冒充已登录，也不谎称未登录。 */
async function loadSession() {
  try {
    const result = await callApi('auth/contexts', {}, { skipAuthRedirect: true });
    applyPayload(result);
    return 'authenticated';
  } catch (error) {
    if (error && error.statusCode === 401) {
      clearSession('');
      return 'anonymous';
    }
    clearSession(errorText(error, copy.errors.networkFailed));
    return 'anonymous';
  }
}

export function ensureSessionLoaded() {
  if (session.status !== 'unknown') return Promise.resolve(session.status);
  if (!loadPromise) {
    loadPromise = loadSession().finally(() => { loadPromise = null; });
  }
  return loadPromise;
}

export function reloadSession() {
  return loadSession();
}

export async function activateContext(contextId) {
  const result = await callApi('auth/contexts/activate', { contextId });
  applyPayload(result);
  return result;
}

export async function activateSelection(organizationId, identityId) {
  const result = await callApi('auth/contexts/activate', { organizationId, identityId });
  applyPayload(result);
  return result;
}

export async function logout() {
  try {
    await callApi('auth/web/logout', {}, { skipAuthRedirect: true });
  } catch (_) {
    // 清本地状态优先：服务端没能确认身份时也必须让用户离开当前登录态。
  }
  clearSession('');
}

export function roleLabelOf(context) {
  return context && context.role === 'admin' ? copy.portal.roleAdmin : copy.portal.roleAssignment;
}

setAuthenticationLostHandler((error) => {
  if (authenticationLostHandled) return;
  authenticationLostHandled = true;
  clearSession(errorText(error, copy.errors.sessionExpired));
  window.setTimeout(() => { authenticationLostHandled = false; }, 1000);
});
