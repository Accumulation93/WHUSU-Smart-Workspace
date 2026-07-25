'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.resolve(__dirname, '../src/core/routes/org.js'),
  'utf8'
);

assert(
  source.includes('findOrganizationDependencies')
    && source.includes("COLUMN_NAME IN ('org_id', 'creator_org_id', 'approval_org_id')")
    && source.includes("status: 'organization_not_empty'"),
  '组织删除必须动态检查所有组织引用列，并拒绝删除仍含业务数据的组织'
);
assert(
  !source.includes('ORG_SCOPED_TABLES'),
  '组织删除不能依赖易遗漏的手写租户表清单'
);
assert(
  source.includes('SELECT id FROM organizations WHERE id = ? FOR UPDATE'),
  '组织删除检查与删除必须在事务内锁定目标组织'
);
assert(
  (source.match(/SELECT current_organization FROM system_config WHERE id = 'default' FOR UPDATE/g) || []).length >= 2,
  '组织切换与删除必须在事务内先锁定系统组织指针，避免 TOCTOU 竞态'
);
assert(
  source.includes("return { status: 'current' }")
    && source.includes('const switchResult = await withTransaction'),
  '当前组织保护和组织切换必须与写入处于同一事务'
);

console.log('组织删除安全边界回归测试通过');
