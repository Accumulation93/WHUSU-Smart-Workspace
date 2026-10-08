import { createRouter, createWebHistory } from 'vue-router';
import copy from '@/locales/zh-CN/index.js';
import { ensureSessionLoaded, session } from '@/runtime/session.js';

/**
 * 网页路由。
 *
 * 电脑端由左侧导航直接进入模块，手机与平板竖屏从门户宫格逐级进入；
 * 两种入口指向同一批路由，不存在两套页面。
 * 未接入的模块统一落到工作台的说明页，不注册空路由。
 */

const routes = [
  { path: '/', redirect: { name: 'portal' } },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true, title: copy.login.navigationTitle }
  },
  {
    path: '/portal',
    name: 'portal',
    component: () => import('@/views/PortalView.vue'),
    meta: { requiresAuth: true, title: copy.portal.navigationTitle }
  },
  {
    path: '/workbench',
    name: 'workbench',
    component: () => import('@/views/WorkbenchView.vue'),
    meta: { requiresAuth: true, title: copy.workbench.navigationTitle }
  },
  {
    path: '/messages',
    name: 'messages',
    component: () => import('@/views/MessagesView.vue'),
    meta: { requiresAuth: true, title: copy.messages.navigationTitle }
  },
  {
    path: '/work-role',
    name: 'workRole',
    component: () => import('@/views/WorkRoleView.vue'),
    meta: { requiresAuth: true, title: copy.workRole.navigationTitle }
  },
  { path: '/switch', redirect: { name: 'workRole' } },
  {
    path: '/account-security',
    redirect: { name: 'workbench', query: { subApp: 'hr', section: 'account' } }
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'notFound',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { title: copy.common.appName }
  }
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior() {
    return { top: 0 };
  }
});

router.beforeEach(async (to) => {
  const status = await ensureSessionLoaded();
  if (to.meta.public) return true;
  if (status === 'authenticated') return true;
  // 登录失效或尚未登录时回到登录页，带上原因让页面给出明确提示。
  return { name: 'login', query: session.notice ? { reason: 'expired' } : {} };
});

router.afterEach((to) => {
  document.title = to.meta.title || copy.common.appName;
});

export default router;
