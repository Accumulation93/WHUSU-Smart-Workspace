import { createRouter, createWebHistory } from 'vue-router';
import copy from '@/locales/zh-CN/index.js';
import { ensureSessionLoaded, session } from '@/runtime/session.js';
import { adminModule } from '@/runtime/adminNavigation.js';

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

  { path: '/audit', redirect: { name: 'auditMySubmissions' } },
  {
    path: '/audit/my-submissions',
    name: 'auditMySubmissions',
    component: () => import('@/views/AuditMySubmissionsView.vue'),
    meta: { requiresAuth: true, title: copy.audit.navigationTitle }
  },
  {
    path: '/audit/pending',
    name: 'auditPending',
    component: () => import('@/views/AuditPendingView.vue'),
    meta: { requiresAuth: true, title: copy.audit.navigationTitle }
  },
  {
    path: '/audit/history',
    name: 'auditHistory',
    component: () => import('@/views/AuditHistoryView.vue'),
    meta: { requiresAuth: true, title: copy.audit.navigationTitle }
  },
  {
    path: '/audit/submission/:id',
    name: 'auditSubmission',
    component: () => import('@/views/AuditSubmissionView.vue'),
    meta: { requiresAuth: true, title: copy.audit.detailTitle }
  },
  {
    path: '/audit/create',
    name: 'auditCreate',
    component: () => import('@/views/AuditCreateView.vue'),
    meta: { requiresAuth: true, title: copy.audit.createTitle }
  },
  {
    path: '/audit/signatures',
    name: 'auditSignatures',
    component: () => import('@/views/AuditSignatureView.vue'),
    meta: { requiresAuth: true, title: copy.audit.signatureTitle }
  },
  {
    path: '/audit/verification',
    name: 'auditVerification',
    component: () => import('@/views/audit/AuditVerificationView.vue'),
    meta: { requiresAuth: true, title: copy.verify.navigationTitle }
  },
  {
    path: '/audit/verification-report/:id',
    name: 'auditVerificationReport',
    component: () => import('@/views/audit/AuditVerificationReportView.vue'),
    meta: { requiresAuth: true, title: copy.verify.reportTitle }
  },

  {
    path: '/hr/profile',
    name: 'hrProfile',
    component: () => import('@/views/hr/HrProfileView.vue'),
    meta: { requiresAuth: true, title: copy.hr.navigationTitle }
  },

  { path: '/scoring', redirect: { name: 'scoringTasks' } },
  {
    path: '/scoring/tasks',
    name: 'scoringTasks',
    component: () => import('@/views/scoring/ScoringTasksView.vue'),
    meta: { requiresAuth: true, title: copy.scoring.navigationTitle }
  },
  {
    path: '/scoring/fill/:id',
    name: 'scoringFill',
    component: () => import('@/views/scoring/ScoringFillView.vue'),
    meta: { requiresAuth: true, title: copy.scoring.fillTitle }
  },

  { path: '/venue', redirect: { name: 'venueBookings' } },
  {
    path: '/venue/bookings',
    name: 'venueBookings',
    component: () => import('@/views/venue/VenueBookingsView.vue'),
    meta: { requiresAuth: true, title: copy.venue.navigationTitle }
  },
  {
    path: '/venue/manage',
    name: 'venueManage',
    component: () => import('@/views/venue/VenueManageView.vue'),
    meta: { requiresAuth: true, title: copy.venue.adminTitle }
  },
  {
    path: '/venue/create',
    name: 'venueBookingCreate',
    component: () => import('@/views/venue/VenueBookingView.vue'),
    meta: { requiresAuth: true, title: copy.venue.createTitle }
  },
  {
    path: '/venue/mine',
    name: 'venueMyBookings',
    component: () => import('@/views/venue/VenueMyBookingsView.vue'),
    meta: { requiresAuth: true, title: copy.venue.mineTitle }
  },
  {
    path: '/venue/pending',
    name: 'venuePending',
    component: () => import('@/views/venue/VenuePendingView.vue'),
    meta: { requiresAuth: true, title: copy.venue.pendingTitle }
  },
  {
    path: '/venue/history',
    name: 'venueHistory',
    component: () => import('@/views/venue/VenueHistoryView.vue'),
    meta: { requiresAuth: true, title: copy.venue.historyTitle }
  },
  {
    path: '/venue/history/:id',
    name: 'venueHistoryDetail',
    component: () => import('@/views/venue/VenueHistoryDetailView.vue'),
    meta: { requiresAuth: true, title: copy.venue.detailTitle }
  },

  {
    path: '/admin',
    name: 'adminConsole',
    component: () => import('@/views/admin/AdminConsoleView.vue'),
    meta: { requiresAuth: true, title: copy.admin.navigationTitle }
  },
  {
    path: '/admin/permissions',
    name: 'adminPermissions',
    component: () => import('@/views/admin/AdminPermissionsView.vue'),
    meta: { requiresAuth: true, title: copy.admin.permissionsTitle }
  },
  {
    path: '/admin/auth',
    name: 'adminAuth',
    redirect: { name: 'adminConsole', query: { subApp: 'hr', tab: 'hrInfo' } },
    meta: { requiresAuth: true, title: copy.admin.authTitle }
  },

  { path: '/system', redirect: { name: 'systemConfig' } },
  {
    path: '/system/config',
    name: 'systemConfig',
    component: () => import('@/views/system/SystemConfigView.vue'),
    meta: { requiresAuth: true, title: copy.system.configTitle }
  },
  {
    path: '/system/dictionary',
    name: 'systemDictionary',
    redirect: { name: 'adminConsole', query: { subApp: 'hr', tab: 'departments' } },
    meta: { requiresAuth: true, title: copy.system.dictionaryTitle }
  },
  {
    path: '/system/audit-template',
    name: 'systemAuditTemplate',
    component: () => import('@/views/system/SystemAuditTemplateView.vue'),
    meta: { requiresAuth: true, title: copy.system.auditTemplateTitle }
  },
  {
    path: '/system/permissions',
    name: 'systemPermissions',
    component: () => import('@/views/system/PermissionsView.vue'),
    meta: { requiresAuth: true, title: copy.system.permissionsTitle }
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
  return { name: 'login', query: session.notice ? { reason: 'expired' } : {} };
});

router.afterEach((to, from, failure) => {
  if (failure) return;
  document.title = to.name === 'adminConsole' ? adminModule(to.query.subApp).label + ' - ' + copy.common.appName : to.meta.title || copy.common.appName;
});

export default router;
