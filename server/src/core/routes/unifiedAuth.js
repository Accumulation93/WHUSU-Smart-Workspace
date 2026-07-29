const express = require('express');
const { safeString } = require('../../utils/helpers');
const identityModel = require('../models/unifiedIdentity');
const unifiedAuth = require('../services/unifiedAuth');

const router = express.Router();

function metadata(req) {
  return {
    requestId: safeString(req.requestId),
    ip: safeString(req.ip)
  };
}

function sendError(req, res, error) {
  if (error instanceof identityModel.IdentityError) {
    return res.status(error.httpStatus).json({
      status: error.code,
      message: error.message
    });
  }
  req.logger.error('Unified authentication operation failed', {
    error: error.message,
    path: req.path
  });
  return res.status(500).json({ status: 'error', message: '认证服务暂不可用，请稍后重试' });
}

function requireUnifiedSession(req) {
  if (!req.authSession || !req.authAccount || !req.authContext) {
    throw new identityModel.IdentityError('client_upgrade_required', '请更新小程序后重新登录', 426);
  }
}

async function requireAdminPermission(req, permissionKey) {
  requireUnifiedSession(req);
  if (req.authContext.role !== 'admin') {
    throw new identityModel.IdentityError('admin_role_required', '请切换到管理员身份后重试', 403);
  }
  const context = await unifiedAuth.decorateContext(req.authContext);
  const permissions = context.permissions || [];
  if (!permissions.includes('*') && !permissions.includes(permissionKey)) {
    throw new identityModel.IdentityError('permission_denied', '当前身份没有执行此操作的权限', 403);
  }
  return context;
}

function claimPolicyOpen(policy) {
  if (!policy || !policy.initial_claim_enabled) return false;
  const now = Date.now();
  if (policy.claim_starts_at && new Date(policy.claim_starts_at).getTime() > now) return false;
  if (policy.claim_ends_at && new Date(policy.claim_ends_at).getTime() < now) return false;
  return true;
}

router.post('/auth/wechat/session', async (req, res) => {
  try {
    const result = await unifiedAuth.startWechatSession(req.body || {}, metadata(req));
    return res.json(result);
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.post('/auth/claims', async (req, res) => {
  try {
    const bootstrapId = unifiedAuth.bootstrapIdFromRequest(req);
    const policy = await identityModel.getPolicy();
    if (!claimPolicyOpen(policy)) {
      return res.status(403).json({
        status: 'claim_paused',
        message: '身份认证暂未开放，请联系管理员'
      });
    }
    const result = await identityModel.createClaim(bootstrapId, {
      name: req.body && req.body.name,
      studentId: req.body && req.body.studentId,
      organizationId: req.body && req.body.organizationId,
      requestId: req.requestId,
      ip: req.ip
    });
    return res.json({
      status: 'accepted',
      claimId: result.claimId,
      message: '请向所属组织管理员获取个人认证码'
    });
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.post('/auth/claims/verify', async (req, res) => {
  try {
    const bootstrapId = unifiedAuth.bootstrapIdFromRequest(req);
    const account = await identityModel.verifyClaim(
      bootstrapId,
      req.body && req.body.claimId,
      req.body && req.body.verificationCode,
      metadata(req)
    );
    const result = await unifiedAuth.createAuthenticatedSession(account, '', metadata(req));
    if (account.rotatedRecoveryCode) result.recoveryCode = account.rotatedRecoveryCode;
    return res.json(result);
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.get('/auth/contexts', async (req, res) => {
  try {
    requireUnifiedSession(req);
    const contexts = await unifiedAuth.decorateContexts(
      await identityModel.listContexts(req.authAccount.id)
    );
    const currentContext = contexts.find((item) => item.contextId === req.authContext.contextId)
      || req.authContext;
    const catalog = unifiedAuth.buildContextCatalog(contexts, currentContext);
    return res.json({
      status: 'success',
      currentContextId: req.authContext.contextId,
      contexts,
      selection: catalog.selection,
      organizations: catalog.organizations,
      identities: catalog.identities
    });
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.post('/auth/contexts', async (req, res) => {
  try {
    requireUnifiedSession(req);
    const contexts = await unifiedAuth.decorateContexts(
      await identityModel.listContexts(req.authAccount.id)
    );
    const currentContext = contexts.find((item) => item.contextId === req.authContext.contextId)
      || req.authContext;
    const catalog = unifiedAuth.buildContextCatalog(contexts, currentContext);
    return res.json({
      status: 'success',
      currentContextId: req.authContext.contextId,
      contexts,
      selection: catalog.selection,
      organizations: catalog.organizations,
      identities: catalog.identities
    });
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.post('/auth/contexts/activate', async (req, res) => {
  try {
    requireUnifiedSession(req);
    const requestedContextId = safeString(req.body && req.body.contextId);
    const requestedOrganizationId = safeString(req.body && req.body.organizationId);
    const requestedIdentityId = safeString(req.body && req.body.identityId);
    if (!requestedContextId && (!requestedOrganizationId || !requestedIdentityId)) {
      throw new identityModel.IdentityError('invalid_params', '请选择组织和身份', 400);
    }
    const previousContext = req.authContext;
    const context = await identityModel.activateSelection(
      req.authSession.id,
      req.authAccount.id,
      {
        contextId: requestedContextId,
        organizationId: requestedOrganizationId,
        identityId: requestedIdentityId
      }
    );
    const decorated = await unifiedAuth.decorateContext(context);
    await identityModel.appendAuditEvent({
      eventType: 'auth_context_activated',
      actorPersonId: req.authAccount.personId,
      targetPersonId: req.authAccount.personId,
      accountId: req.authAccount.id,
      organizationId: decorated.organizationId,
      contextId: decorated.contextId,
      requestId: req.requestId,
      ip: req.ip,
      detail: {
        previousOrganizationId: previousContext.organizationId,
        previousIdentityId: previousContext.authIdentityId,
        organizationId: decorated.organizationId,
        identityId: decorated.authIdentityId,
        role: decorated.role,
        identityType: decorated.identityType,
        identityScope: decorated.identityScope
      }
    });
    return res.json({
      status: 'success',
      token: unifiedAuth.signAccessToken(
        Object.assign({}, req.authSession, { context: decorated }),
        {
          id: req.authAccount.id,
          token_version: req.authAccount.tokenVersion
        }
      ),
      context: decorated,
      selection: {
        organizationId: decorated.organizationId,
        identityId: decorated.authIdentityId,
        contextId: decorated.contextId
      },
      user: unifiedAuth.profileFromContext(decorated),
      activeRole: decorated.role,
      activeOrg: { id: decorated.organizationId, name: decorated.organizationName }
    });
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.all('/auth/security', async (req, res) => {
  try {
    requireUnifiedSession(req);
    const [policy, sessions] = await Promise.all([
      identityModel.getPolicy(),
      identityModel.listSessions(req.authAccount.id)
    ]);
    return res.json({
      status: 'success',
      bindingStatus: 'verified',
      account: {
        name: req.authAccount.name,
        studentId: req.authAccount.studentId
      },
      policy: {
        allowRecoveryCode: Boolean(policy && policy.allow_recovery_code),
        allowPassphrase: Boolean(policy && policy.allow_passphrase),
        passphraseMinLength: Number(policy && policy.passphrase_min_length) || 12
      },
      sessions: sessions.map((item) => ({
        id: safeString(item.id),
        contextId: safeString(item.context_id),
        organizationId: safeString(item.organization_id),
        role: safeString(item.role),
        current: safeString(item.id) === safeString(req.authSession.id),
        createdAt: item.created_at,
        lastSeenAt: item.last_seen_at,
        expiresAt: item.expires_at
      }))
    });
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.post('/auth/security/recovery-credential', async (req, res) => {
  try {
    requireUnifiedSession(req);
    const method = safeString(req.body && req.body.method);
    if (!['recovery_code', 'passphrase'].includes(method)) {
      throw new identityModel.IdentityError('invalid_params', '请选择恢复方式', 400);
    }
    const result = await identityModel.configureRecoveryCredential(
      req.authAccount.id,
      method,
      req.body && req.body.value
    );
    await identityModel.appendAuditEvent({
      eventType: 'recovery_credential_configured',
      actorPersonId: req.authAccount.personId,
      targetPersonId: req.authAccount.personId,
      accountId: req.authAccount.id,
      organizationId: req.authContext.organizationId,
      contextId: req.authContext.contextId,
      requestId: req.requestId,
      ip: req.ip,
      detail: { method }
    });
    return res.json(Object.assign({ status: 'success' }, result));
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.post('/auth/security/sessions/revoke', async (req, res) => {
  try {
    requireUnifiedSession(req);
    const revoked = await identityModel.revokeSession(
      req.authAccount.id,
      req.body && req.body.sessionId,
      req.authSession.id
    );
    return res.json({
      status: revoked ? 'success' : 'not_found',
      message: revoked ? '该设备已退出' : '该设备已退出'
    });
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.post('/auth/recovery/start', async (req, res) => {
  try {
    const bootstrapId = unifiedAuth.bootstrapIdFromRequest(req);
    const result = await identityModel.startRecovery(bootstrapId, {
      name: req.body && req.body.name,
      studentId: req.body && req.body.studentId,
      organizationId: req.body && req.body.organizationId
    }, metadata(req));
    return res.json({
      status: 'accepted',
      recoveryRequestId: result.recoveryRequestId,
      message: '请使用恢复码或恢复口令，或等待管理员审核'
    });
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.post('/auth/recovery/complete', async (req, res) => {
  try {
    const bootstrapId = unifiedAuth.bootstrapIdFromRequest(req);
    const method = safeString(req.body && req.body.method);
    if (!['recovery_code', 'passphrase'].includes(method)) {
      throw new identityModel.IdentityError('invalid_params', '请选择恢复方式', 400);
    }
    const account = await identityModel.completeRecoveryWithCredential(
      bootstrapId,
      req.body && req.body.recoveryRequestId,
      method,
      req.body && req.body.credential,
      metadata(req)
    );
    const result = await unifiedAuth.createAuthenticatedSession(account, '', metadata(req));
    if (account.rotatedRecoveryCode) result.recoveryCode = account.rotatedRecoveryCode;
    return res.json(result);
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.get('/admin/auth/claims', async (req, res) => {
  try {
    const actor = await requireAdminPermission(req, 'auth.identity.verify');
    const orgId = actor.adminLevel === 'super_admin'
      ? safeString(req.query && req.query.organizationId)
      : actor.organizationId;
    const rows = await identityModel.listClaims(orgId, { limit: req.query && req.query.limit });
    return res.json({ status: 'success', list: rows });
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.post('/admin/auth/claims', async (req, res) => {
  try {
    const actor = await requireAdminPermission(req, 'auth.identity.verify');
    const action = safeString(req.body && req.body.action) || 'list';
    if (action === 'list') {
      const orgId = actor.adminLevel === 'super_admin'
        ? safeString(req.body && req.body.organizationId)
        : actor.organizationId;
      const rows = await identityModel.listClaims(orgId, { limit: req.body && req.body.limit });
      return res.json({ status: 'success', list: rows });
    }
    if (action === 'issue_code') {
      const result = await identityModel.issueVerificationCode(
        req.body && req.body.claimId,
        actor,
        metadata(req)
      );
      return res.json({
        status: 'success',
        verificationCode: result.code,
        expiresInHours: result.expiresInHours,
        message: '请将认证码单独发给本人'
      });
    }
    if (action === 'issue_codes') {
      const claimIds = Array.isArray(req.body && req.body.claimIds)
        ? req.body.claimIds.map(safeString).filter(Boolean).slice(0, 50)
        : [];
      const results = await identityModel.issueVerificationCodes(claimIds, actor, metadata(req));
      const issued = results.map((result) => ({
        claimId: result.claimId,
        verificationCode: result.code,
        expiresInHours: result.expiresInHours
      }));
      return res.json({
        status: 'success',
        issued,
        message: '请将认证码分别发给本人'
      });
    }
    throw new identityModel.IdentityError('invalid_action', '请重新打开页面后再试', 400);
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.get('/admin/auth/recoveries', async (req, res) => {
  try {
    const actor = await requireAdminPermission(req, 'auth.accounts.recover');
    const orgId = actor.adminLevel === 'super_admin'
      ? safeString(req.query && req.query.organizationId)
      : actor.organizationId;
    const rows = await identityModel.listRecoveryRequests(orgId, { limit: req.query && req.query.limit });
    return res.json({ status: 'success', list: rows });
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.post('/admin/auth/recoveries', async (req, res) => {
  try {
    const actor = await requireAdminPermission(req, 'auth.accounts.recover');
    const action = safeString(req.body && req.body.action) || 'list';
    if (action === 'list') {
      const orgId = actor.adminLevel === 'super_admin'
        ? safeString(req.body && req.body.organizationId)
        : actor.organizationId;
      const rows = await identityModel.listRecoveryRequests(orgId, { limit: req.body && req.body.limit });
      return res.json({ status: 'success', list: rows });
    }
    if (action === 'approve') {
      await identityModel.approveRecovery(
        req.body && req.body.recoveryRequestId,
        actor,
        metadata(req)
      );
      return res.json({ status: 'success', message: '已更换微信，原微信和其他设备已退出' });
    }
    throw new identityModel.IdentityError('invalid_action', '请重新打开页面后再试', 400);
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.post('/admin/auth/accounts', async (req, res) => {
  try {
    const actor = await requireAdminPermission(req, 'auth.accounts.recover');
    const action = safeString(req.body && req.body.action) || 'list';
    if (action === 'list') {
      const orgId = actor.adminLevel === 'super_admin'
        ? safeString(req.body && req.body.organizationId)
        : actor.organizationId;
      const rows = await identityModel.listAccounts(orgId, { limit: req.body && req.body.limit });
      return res.json({
        status: 'success',
        list: rows.map((row) => ({
          accountId: safeString(row.account_id),
          personId: safeString(row.person_id),
          name: safeString(row.name),
          studentId: safeString(row.student_id),
          accountStatus: safeString(row.status),
          hasActiveBinding: Boolean(row.has_active_binding),
          isSuperAdmin: Boolean(row.is_super_admin),
          verifiedAt: row.verified_at,
          recoveryRequiredAt: row.recovery_required_at
        }))
      });
    }
    if (action === 'freeze' || action === 'unfreeze') {
      const result = await identityModel.setAccountFrozen(
        req.body && req.body.personId,
        action === 'freeze',
        actor,
        metadata(req)
      );
      return res.json({
        status: 'success',
        accountStatus: result.status,
        message: action === 'freeze' ? '账号已冻结，其他设备已退出' : '账号已解除冻结'
      });
    }
    throw new identityModel.IdentityError('invalid_action', '请重新打开页面后再试', 400);
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.get('/admin/auth/policy', async (req, res) => {
  try {
    await requireAdminPermission(req, 'auth.policy.manage');
    return res.json({ status: 'success', policy: await identityModel.getPolicy() });
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.post('/admin/auth/policy', async (req, res) => {
  try {
    const actor = await requireAdminPermission(req, 'auth.policy.manage');
    if (safeString(req.body && req.body.action) === 'get') {
      return res.json({ status: 'success', policy: await identityModel.getPolicy() });
    }
    const policy = await identityModel.savePolicy(req.body || {}, actor);
    return res.json({ status: 'success', policy });
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.post('/admin/auth/audit', async (req, res) => {
  try {
    const actor = await requireAdminPermission(req, 'auth.accounts.audit');
    const orgId = actor.adminLevel === 'super_admin'
      ? safeString(req.body && req.body.organizationId)
      : actor.organizationId;
    const rows = await identityModel.listAuditEvents(orgId, req.body && req.body.limit);
    return res.json({
      status: 'success',
      list: rows.map((row) => ({
        id: safeString(row.id),
        eventType: safeString(row.event_type),
        actorName: safeString(row.actor_name),
        targetName: safeString(row.target_name),
        organizationId: safeString(row.organization_id),
        outcome: safeString(row.outcome),
        createdAt: row.created_at
      }))
    });
  } catch (error) {
    return sendError(req, res, error);
  }
});

module.exports = router;
