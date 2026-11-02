'use strict';

const pool = require('../../config/db');
const { createAuthorizationSession } = require('../services/authorizationSession');

// 只转换调用者提交的内容，不授予任何业务目录、成员资料或导出读取权。
async function allowed(reference, action) {
  return pool.withTransaction(async connection => {
    const session = await createAuthorizationSession(connection, reference, { lock: true });
    return session.mode === 'enforced' && session.check({ capability: 'files.tables.' + action,
      resource: { id: '', type: 'files.tables', organizationId: reference.organizationId },
      businessAllowed: true, legacyAllowed: false }).allowed;
  });
}

module.exports = { allowed };
