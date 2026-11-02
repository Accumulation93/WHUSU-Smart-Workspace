'use strict';

const model = require('../models/organizationConfigCopy');
const { createAuthorizationSession } = require('./authorizationSession');
const { CATALOG } = require('./authorizationCatalog');

function createGuard() {
  const sessions = new WeakMap();
  return async function authorize(connection, reference, kind, action, id) {
    if (!sessions.has(connection)) sessions.set(connection, await createAuthorizationSession(connection, reference, { lock: true }));
    const session = sessions.get(connection);
    const decision = session.check({ capability: kind + '.' + action,
      resource: { id, type: kind, organizationId: reference.organizationId },
      businessAllowed: true, legacyAllowed: false,
      requestedFields: ['read', 'create', 'update'].includes(action) ? (CATALOG.get(kind + '.' + action)?.fields || []) : [] });
    // 新增分享/接收不从旧维护权限推导；切换前不开放复制，避免以试算结果执行授权。
    if (session.mode !== 'enforced' || !decision.allowed) {
      throw Object.assign(new Error('authorization_forbidden'), { code: 'authorization_forbidden' });
    }
  };
}

module.exports = {
  share: (input, reference) => model.share(input, reference, createGuard()),
  revoke: (input, reference) => model.revoke(input, reference, createGuard()),
  receive: (input, reference) => model.receive(input, reference, createGuard()),
  apply: (input, reference) => model.apply(input, reference, createGuard()),
  enable: (input, reference) => model.enable(input, reference, createGuard()),
  available: (input, reference) => model.available(input, reference, createGuard()),
  detail: (input, reference) => model.detail(input, reference, createGuard()),
  workspace: (input, reference) => model.workspace(input, reference, createGuard()),
  candidates: (input, reference) => model.candidates(input, reference, createGuard())
};
