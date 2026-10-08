/**
 * 端到端测试用的服务端应答。
 *
 * 字段形状与 server/src 中对应路由保持一致：工作角色目录来自 auth/contexts，
 * 待办与通知来自 listTodos / listNotifications，通知行带 isRead 与 createdAt。
 */

export const STORED_STUDENT_ID = '20260001';
export const STORED_PASSPHRASE = 'good-passphrase-2026';

const ASSIGNMENT_CONTEXT = {
  contextId: 'ctx-assignment',
  organizationId: 'org-1',
  organizationName: '测试组织',
  role: 'user',
  name: '测试用户',
  studentId: STORED_STUDENT_ID,
  personId: 'person-1',
  assignmentId: 'assignment-1',
  assignmentLabel: '综合事务 · 办公室',
  identityName: '综合事务'
};

const ADMIN_CONTEXT = {
  contextId: 'ctx-admin',
  organizationId: 'org-1',
  organizationName: '测试组织',
  role: 'admin',
  name: '测试用户',
  studentId: STORED_STUDENT_ID,
  personId: 'person-1',
  adminLevel: 'organization_admin',
  identityName: '管理权限',
  permissions: ['auth.accounts.global_manage']
};

export const CURRENT_CONTEXT = ASSIGNMENT_CONTEXT;

export function workContexts(activeContextId) {
  return [
    {
      contextId: ASSIGNMENT_CONTEXT.contextId,
      type: 'assignment',
      label: ASSIGNMENT_CONTEXT.assignmentLabel,
      scope: 'organization',
      organizationId: 'org-1',
      organizationName: '测试组织',
      role: 'user',
      assignmentId: 'assignment-1',
      assignmentLabel: ASSIGNMENT_CONTEXT.assignmentLabel,
      isCurrent: activeContextId === ASSIGNMENT_CONTEXT.contextId
    },
    {
      contextId: ADMIN_CONTEXT.contextId,
      type: 'admin',
      label: '管理权限',
      scope: 'organization',
      organizationId: 'org-1',
      organizationName: '测试组织',
      role: 'admin',
      adminLevel: 'organization_admin',
      isCurrent: activeContextId === ADMIN_CONTEXT.contextId
    }
  ];
}

export function sessionPayload(options) {
  const settings = options || {};
  const activeContextId = settings.contextId || ASSIGNMENT_CONTEXT.contextId;
  const context = activeContextId === ADMIN_CONTEXT.contextId ? ADMIN_CONTEXT : ASSIGNMENT_CONTEXT;
  return {
    status: settings.status || 'success',
    currentContextId: activeContextId,
    context,
    contexts: [ASSIGNMENT_CONTEXT, ADMIN_CONTEXT],
    workContexts: workContexts(activeContextId),
    organizations: [
      { id: 'org-1', name: '测试组织', roles: ['user', 'admin'], contextIds: ['ctx-assignment', 'ctx-admin'] }
    ],
    identities: [],
    selection: { organizationId: 'org-1', contextId: activeContextId, identityId: 'identity-1' },
    user: { name: context.name, id: 'hr-1', personId: 'person-1' },
    activeRole: context.role,
    activeOrg: { id: 'org-1', name: '测试组织' },
    systemTimezoneOffset: 8,
    timezoneConfigVersion: '1'
  };
}

export const TODO_ITEM = {
  id: 'venue:booking-1',
  type: 'todo',
  sourceType: 'venue_approval',
  title: '场地借用审批',
  description: '综合事务 提交的活动室借用等待处理',
  category: 'venue',
  targetType: 'booking',
  targetId: 'booking-1',
  targetUrl: '/subpackages/venue/pages/pendingVenueApprovals/pendingVenueApprovals',
  createdAt: '2026-01-02T03:04:05.000Z'
};

export const NOTIFICATION_ITEM = {
  id: 'notification-1',
  type: 'pending_approval',
  title: '有一条新的审核申请',
  description: '请及时处理',
  category: 'audit',
  targetType: 'submission',
  targetId: 'submission-1',
  targetUrl: '/subpackages/audit/pages/submissionDetail/submissionDetail?id=submission-1',
  isRead: false,
  createdAt: '2026-01-03T06:07:08.000Z'
};

/**
 * 拦截网页发出的全部接口调用，按接口名给出固定应答，并记录调用顺序。
 */
export async function mockApi(page, options) {
  const settings = options || {};
  const calls = [];
  const state = { sessionAlive: settings.authenticated !== false };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const name = url.pathname.replace(/^\/api\//, '');
    let body = {};
    try {
      body = request.postDataJSON() || {};
    } catch (_) {
      body = {};
    }
    calls.push({ name, body, headers: request.headers() });

    const reply = (payload, status) => route.fulfill({
      status: status || 200,
      contentType: 'application/json',
      body: JSON.stringify(payload)
    });

    if (name === 'auth/contexts') {
      if (!state.sessionAlive) return reply({ status: 'auth_failed', message: '' }, 401);
      return reply(sessionPayload({ contextId: settings.activeContextId }));
    }
    if (name === 'auth/password/session') {
      const valid = body.studentId === STORED_STUDENT_ID && body.passphrase === STORED_PASSPHRASE;
      if (!valid) return reply({ status: 'login_failed', message: '' }, 401);
      // 登录成功后服务端会话即可用，后续业务请求按正常应答。
      state.sessionAlive = true;
      return reply(sessionPayload({ status: 'login_success', contextId: settings.loginContextId }));
    }
    if (name === 'auth/contexts/activate') {
      return reply(sessionPayload({ contextId: body.contextId || settings.activeContextId }));
    }
    if (name === 'auth/web/logout') {
      return reply({ status: 'success' });
    }
    // 会话失效后，业务接口统一按登录失效返回，网页据此回到登录页。
    if (!state.sessionAlive) return reply({ status: 'auth_failed', message: '' }, 401);
    if (name === 'listTodos') {
      return reply({
        status: 'success',
        items: settings.emptyTodos ? [] : [TODO_ITEM],
        total: settings.emptyTodos ? 0 : 1,
        nextCursor: ''
      });
    }
    if (name === 'listNotifications') {
      return reply({
        status: 'success',
        items: settings.emptyNotifications ? [] : [NOTIFICATION_ITEM],
        total: settings.emptyNotifications ? 0 : 1,
        unreadCount: settings.emptyNotifications ? 0 : 1,
        nextCursor: ''
      });
    }
    if (name === 'deleteAllNotifications') return reply({ status: 'success', deletedCount: 1 });
    return reply({ status: 'success' });
  });
  return {
    calls,
    setSessionAlive(alive) {
      state.sessionAlive = alive === true;
    }
  };
}

export function callsOf(calls, name) {
  return calls.filter((call) => call.name === name);
}
