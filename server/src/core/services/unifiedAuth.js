const axios = require('axios');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../../middleware/auth');
const { safeString } = require('../../utils/helpers');
const identityModel = require('../models/unifiedIdentity');
const adminInfoModel = require('../models/adminInfo');
const { loadEffectivePermissions } = require('./adminPermissions');

const WECHAT_APPID = process.env.WECHAT_APPID;
const WECHAT_SECRET = process.env.WECHAT_SECRET;
if (!WECHAT_APPID || !WECHAT_SECRET) {
  throw new Error('WECHAT_APPID and WECHAT_SECRET environment variables are required');
}

const ALLOW_DEV_OPENID_LOGIN = process.env.NODE_ENV !== 'production'
  && process.env.ENABLE_DEV_OPENID_LOGIN === '1';
const ACCESS_AUDIENCE = 'whusu-smart-workspace-api';
const BOOTSTRAP_AUDIENCE = 'whusu-smart-workspace-bootstrap';

async function exchangeWechatCode(code, devOpenid) {
  if (ALLOW_DEV_OPENID_LOGIN && safeString(devOpenid)) return safeString(devOpenid);
  const jsCode = safeString(code);
  if (!jsCode) throw new identityModel.IdentityError('invalid_wechat_code', '微信登录失败，请重试', 401);
  let response;
  try {
    response = await axios.get('https://api.weixin.qq.com/sns/jscode2session', {
      params: {
        appid: WECHAT_APPID,
        secret: WECHAT_SECRET,
        js_code: jsCode,
        grant_type: 'authorization_code'
      },
      timeout: 5000
    });
  } catch (_) {
    throw new identityModel.IdentityError('wechat_unavailable', '微信登录服务暂不可用，请稍后重试', 503);
  }
  const openid = safeString(response && response.data && response.data.openid);
  if (!openid) throw new identityModel.IdentityError('invalid_wechat_code', '微信登录失败，请重试', 401);
  return openid;
}

function signAccessToken(session, account) {
  const contextId = safeString(
    session && session.context && session.context.contextId
      ? session.context.contextId
      : session && session.context_id
  );
  return jwt.sign({
    kind: 'unified_access',
    sid: session.id,
    accountId: account.id,
    tokenVersion: Number(session.tokenVersion || account.token_version || 1),
    contextId
  }, JWT_SECRET, {
    expiresIn: identityModel.SESSION_MINUTES * 60,
    audience: ACCESS_AUDIENCE,
    issuer: 'whusu-smart-workspace'
  });
}

function signBootstrapToken(bootstrap) {
  return jwt.sign({
    kind: 'unified_bootstrap',
    bid: bootstrap.id
  }, JWT_SECRET, {
    expiresIn: bootstrap.expiresInSeconds,
    audience: BOOTSTRAP_AUDIENCE,
    issuer: 'whusu-smart-workspace'
  });
}

function verifyBootstrapToken(token) {
  try {
    const decoded = jwt.verify(safeString(token), JWT_SECRET, {
      audience: BOOTSTRAP_AUDIENCE,
      issuer: 'whusu-smart-workspace'
    });
    return decoded && decoded.kind === 'unified_bootstrap' ? safeString(decoded.bid) : '';
  } catch (_) {
    return '';
  }
}

async function decorateContext(context) {
  const value = Object.assign({}, context);
  if (value.role !== 'admin') return value;
  const admin = value.legacyAdminId
    ? await adminInfoModel.getByIdGlobal(value.legacyAdminId)
    : null;
  if (!admin) {
    value.permissions = value.adminLevel === 'super_admin' ? ['*'] : [];
    return value;
  }
  const effective = await loadEffectivePermissions(admin, value.organizationId);
  value.permissions = effective.isSuper ? ['*'] : effective.keys;
  return value;
}

async function decorateContexts(contexts) {
  const values = [];
  for (const context of contexts) values.push(await decorateContext(context));
  return values;
}

function buildAvailableOrganizations(contexts, currentContext) {
  const map = new Map();
  contexts.forEach((context) => {
    if (!context.organizationId) return;
    const current = map.get(context.organizationId) || {
      id: context.organizationId,
      name: context.organizationName,
      roles: [],
      contextIds: []
    };
    if (!current.roles.includes(context.role)) current.roles.push(context.role);
    current.contextIds.push(context.contextId);
    map.set(context.organizationId, current);
  });
  return Array.from(map.values()).map((item) => Object.assign(item, {
    isCurrent: Boolean(currentContext && item.id === currentContext.organizationId)
  }));
}

function profileFromContext(context) {
  if (!context) return null;
  if (context.role === 'admin') {
    return {
      id: context.legacyAdminId || context.adminGrantId,
      adminGrantId: context.adminGrantId,
      personId: context.personId,
      name: context.name,
      studentId: context.studentId,
      adminLevel: context.adminLevel,
      identity: context.identityName,
      permissions: context.permissions || []
    };
  }
  return {
    id: context.legacyHrId,
    hrId: context.legacyHrId,
    personId: context.personId,
    membershipId: context.membershipId,
    assignmentId: context.assignmentId,
    name: context.name,
    studentId: context.studentId,
    departmentId: context.departmentId,
    department: context.department,
    identityId: context.identityId,
    identity: context.identity,
    workGroupId: context.workGroupId,
    workGroup: context.workGroup,
    assignmentName: context.identityName
  };
}

async function buildAuthenticatedPayload(account, session) {
  const rawContexts = await identityModel.listContexts(account.id);
  const contexts = await decorateContexts(rawContexts);
  const currentContext = contexts.find((item) => item.contextId === session.context.contextId)
    || await decorateContext(session.context);
  return {
    status: 'login_success',
    token: signAccessToken(session, account),
    expiresIn: session.expiresInSeconds,
    account: {
      id: account.id,
      personId: account.person_id,
      name: safeString(account.name),
      studentId: safeString(account.student_id),
      status: safeString(account.status)
    },
    context: currentContext,
    contexts,
    user: profileFromContext(currentContext),
    activeRole: currentContext.role,
    activeOrg: {
      id: currentContext.organizationId,
      name: currentContext.organizationName
    },
    availableOrgs: buildAvailableOrganizations(contexts, currentContext)
  };
}

async function createAuthenticatedSession(account, requestedContextId, metadata) {
  const session = await identityModel.createSession(account, requestedContextId, metadata);
  return buildAuthenticatedPayload(account, session);
}

async function startWechatSession(data, metadata) {
  const openid = await exchangeWechatCode(data.code, data.openid || data.deviceOpenid);
  const account = await identityModel.findAccountByOpenid(openid);
  if (account && account.status === 'frozen') {
    throw new identityModel.IdentityError('account_frozen', '账号已冻结，请联系管理员', 403);
  }
  if (account) return createAuthenticatedSession(account, data.contextId, metadata);
  const bootstrap = await identityModel.createBootstrapSession(openid);
  const [policy, organizations] = await Promise.all([
    identityModel.getPolicy(),
    identityModel.listClaimOrganizations()
  ]);
  return {
    status: 'need_claim',
    bootstrapToken: signBootstrapToken(bootstrap),
    claimAvailable: Boolean(policy && policy.initial_claim_enabled),
    recoveryAvailable: true,
    recoveryMethods: {
      recoveryCode: Boolean(policy && policy.allow_recovery_code),
      passphrase: Boolean(policy && policy.allow_passphrase)
    },
    organizations,
    message: '请完成身份认证'
  };
}

function bootstrapIdFromRequest(req) {
  const authHeader = safeString(req.headers.authorization);
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const bootstrapId = verifyBootstrapToken(token);
  if (!bootstrapId) throw new identityModel.IdentityError('bootstrap_expired', '微信验证已过期，请重新登录', 401);
  return bootstrapId;
}

module.exports = {
  ACCESS_AUDIENCE,
  BOOTSTRAP_AUDIENCE,
  exchangeWechatCode,
  signAccessToken,
  signBootstrapToken,
  verifyBootstrapToken,
  decorateContext,
  decorateContexts,
  profileFromContext,
  buildAvailableOrganizations,
  buildAuthenticatedPayload,
  createAuthenticatedSession,
  startWechatSession,
  bootstrapIdFromRequest
};
