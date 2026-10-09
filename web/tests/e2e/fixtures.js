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

// ---------- 审核审批 ----------

export const MY_SUBMISSION = {
  id: 'submission-1',
  submissionNumber: 'SP-2026-0001',
  title: '活动室使用申请',
  description: '申请 3 月 12 日使用活动室',
  type: 'template',
  status: 'in_progress',
  currentStepIndex: 1,
  resubmitMode: 'fresh',
  createdAt: '2026-03-01T02:00:00.000Z',
  updatedAt: '2026-03-02T02:00:00.000Z',
  isUnread: true
};

export const PENDING_STEP = {
  id: 'step-2',
  submissionId: 'submission-1',
  submissionNumber: 'SP-2026-0001',
  title: '活动室使用申请',
  submittedBy: 'hr-2',
  submitterName: '张同学',
  sortOrder: 1,
  approverType: 'identity',
  scopeType: 'all',
  actionType: 'pass',
  round: 1,
  createdAt: '2026-03-02T02:00:00.000Z'
};

export const HISTORY_ROW = {
  id: 'submission-1',
  submissionNumber: 'SP-2026-0001',
  title: '活动室使用申请',
  description: '申请 3 月 12 日使用活动室',
  type: 'template',
  status: 'in_progress',
  currentStepIndex: 1,
  submittedBy: 'hr-2',
  submitterName: '张同学',
  createdAt: '2026-03-01T02:00:00.000Z',
  updatedAt: '2026-03-02T02:00:00.000Z',
  mySteps: [{ _key: 0, sortOrder: 0, status: 'approved', processedAt: '2026-03-02T02:00:00.000Z', comment: '同意' }],
  myLastActionAt: '2026-03-02T02:00:00.000Z'
};

export const SIGNATURE_ITEM = {
  id: 'signature-1',
  name: '我的签名',
  imageData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  isDefault: true,
  createdAt: '2026-03-01T02:00:00.000Z'
};

export function submissionDetail(options) {
  const settings = options || {};
  const actionType = settings.actionType || 'pass';
  return {
    status: 'success',
    userIsSubmitter: settings.userIsSubmitter === true,
    userIsApprover: settings.userIsApprover !== false,
    canApproveCurrentStep: settings.canApproveCurrentStep !== false,
    userIsAdmin: false,
    submission: {
      id: 'submission-1',
      submissionNumber: 'SP-2026-0001',
      title: '活动室使用申请',
      description: '申请 3 月 12 日使用活动室',
      type: 'template',
      templateId: 'template-1',
      templateName: '活动申请流程',
      status: 'in_progress',
      submittedBy: 'hr-2',
      submitterName: '张同学',
      currentStepIndex: 1,
      resubmitMode: 'fresh',
      createdAt: '2026-03-01T02:00:00.000Z',
      updatedAt: '2026-03-02T02:00:00.000Z'
    },
    steps: [
      {
        id: 'step-1',
        sortOrder: 0,
        stepName: '部门初审',
        approverType: 'identity',
        approverDesc: '由 综合事务 审批',
        actionType: 'pass',
        allowApproverDesignation: false,
        status: 'approved',
        comment: '同意',
        rejectionReason: '',
        round: 1,
        processedAt: '2026-03-02T02:00:00.000Z'
      },
      {
        id: 'step-2',
        sortOrder: 1,
        stepName: '负责人审批',
        approverType: 'identity',
        approverDesc: '由 负责人 审批',
        actionType,
        allowApproverDesignation: settings.allowApproverDesignation === true,
        status: 'pending',
        comment: '',
        rejectionReason: '',
        round: 1,
        processedAt: null
      }
    ],
    files: [
      {
        id: 'file-1',
        fileName: '申请表.pdf',
        mimeType: 'application/pdf',
        fileSize: 20480,
        fileHash: 'hash-1',
        sortOrder: 0
      }
    ],
    signatures: [],
    events: [
      {
        id: 'event-1',
        eventType: 'submit',
        stepIndex: 0,
        round: 1,
        operatorName: '张同学',
        comment: '',
        createdAt: '2026-03-01T02:00:00.000Z'
      },
      {
        id: 'event-2',
        eventType: 'approve',
        stepIndex: 0,
        round: 1,
        operatorName: '李老师',
        comment: '同意',
        createdAt: '2026-03-02T02:00:00.000Z'
      }
    ]
  };
}

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
    if (name === 'getCurrentScoreActivity') return reply({ status: 'success', activity: { name: 'Activity' } });
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
    if (name === 'listMySubmissions') {
      return reply({
        status: 'success',
        submissions: settings.emptySubmissions ? [] : [MY_SUBMISSION]
      });
    }
    if (name === 'listPendingApprovals') {
      return reply({ status: 'success', pending: settings.emptyPending ? [] : [PENDING_STEP] });
    }
    if (name === 'listMyApprovalHistory') {
      return reply({ status: 'success', items: settings.emptyHistory ? [] : [HISTORY_ROW] });
    }
    if (name === 'getSubmissionDetail') {
      return reply(submissionDetail(settings.detail));
    }
    if (name === 'listAvailableFlowTemplates') {
      return reply({
        status: 'success',
        templates: settings.emptyTemplates ? [] : [
          { id: 'template-1', name: '活动申请流程', description: '活动室与活动用品申请', stepCount: 2, resubmitMode: 'fresh' }
        ]
      });
    }
    if (name === 'uploadAuditFile') {
      return reply({
        status: 'success',
        fileId: 'uploaded-1',
        fileName: body.fileName || 'uploaded.pdf',
        mimeType: body.mimeType || 'application/pdf',
        fileSize: 1024,
        fileHash: 'hash-uploaded',
        fileToken: 'token-uploaded'
      });
    }
    if (name === 'getLatestPublishedScoreActivity') {
      return reply({ status: 'success', activity: null });
    }
    if (name === 'listMySignatures') {
      return reply({ status: 'success', signatures: settings.emptySignatures ? [] : [SIGNATURE_ITEM] });
    }
    if (name === 'saveSignature') {
      return reply({ status: 'success', id: 'signature-new' });
    }
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
