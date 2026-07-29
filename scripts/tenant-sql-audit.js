'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SERVER_ROOT = path.join(ROOT, 'server/src');
function listSqlFiles(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) listSqlFiles(fullPath, output);
    else if (entry.name.endsWith('.sql')) output.push(fullPath);
  }
  return output;
}

const schemaFiles = listSqlFiles(path.join(ROOT, 'server/db'));
const initSql = schemaFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const scopedTables = [];

for (const match of initSql.matchAll(/CREATE TABLE IF NOT EXISTS\s+`?(\w+)`?\s*\(([\s\S]*?)\)\s*ENGINE=/g)) {
  if (/\borg_id\b/i.test(match[2])) scopedTables.push(match[1]);
}

// These statements intentionally discover an actor or invitation across organizations.
// Each one is limited by an authenticated openid, a one-time invite, or a global-admin check.
const CROSS_ORG_ALLOWLIST = [
  { file: 'server/src/core/models/adminInfo.js', sql: /FROM admin_info WHERE openid = \?/i, reason: '跨组织管理员身份发现' },
  { file: 'server/src/core/models/adminInfo.js', sql: /FROM admin_info WHERE id = \? AND admin_level IN/i, reason: '权限管理精确主键锁定' },
  { file: 'server/src/core/models/adminInfo.js', sql: /FROM admin_info\s+WHERE invite_code = \?/i, reason: '一次性邀请码查找' },
  { file: 'server/src/core/models/hrInfo.js', sql: /FROM hr_info WHERE student_id = \?/i, reason: '登录时跨组织身份匹配' },
  { file: 'server/src/core/models/userInfo.js', sql: /FROM user_info WHERE openid = \?/i, reason: '登录时跨组织绑定发现' },
  { file: 'server/src/core/models/userInfo.js', sql: /DELETE FROM user_info WHERE openid IN/i, reason: '管理员按已锁定 OpenID 从所有组织解绑普通用户微信' },
  { file: 'server/src/core/routes/auth.js', sql: /SELECT DISTINCT student_id, name FROM hr_info WHERE id IN/i, reason: '登录时从已绑定主键推导身份' },
  { file: 'server/src/core/routes/auth.js', sql: /FROM admin_info\s+WHERE invite_code = \?/i, reason: '管理员一次性邀请码绑定' },
  { file: 'server/src/core/routes/auth.js', sql: /UPDATE admin_info[\s\S]*invite_consumed_at/i, reason: '同一事务消费已锁定邀请码' },
  { file: 'server/src/core/routes/org.js', sql: /FROM admin_info WHERE openid = \? AND bind_status = 'active'/i, reason: '全局组织管理鉴权' },
  { file: 'server/src/modules/venue/routes/venueUser.js', sql: /SELECT id, name FROM admin_info WHERE id IN/i, reason: '全局场地记录展示创建管理员名称' },
  { file: 'server/src/modules/audit/models/notification.js', sql: /DELETE FROM notifications WHERE created_at </i, reason: '后台全局保留期清理' },
  { file: 'server/src/modules/audit/models/notificationOutbox.js', sql: /notification_outbox/i, reason: '后台工作进程跨组织领取与清理事件' },
  { file: 'server/src/utils/requestDeduplication.js', sql: /DELETE FROM request_deduplication/i, reason: '后台全局幂等记录保留期清理' },
  { file: 'server/src/core/models/unifiedIdentity.js', sql: /FROM organization_memberships WHERE legacy_hr_id = \?/i, reason: '由已授权的旧人员主键解析统一成员关系' },
  { file: 'server/src/core/models/unifiedIdentity.js', sql: /FROM membership_assignments\s+WHERE membership_id = \?/i, reason: '在已授权成员关系内解析岗位' },
  { file: 'server/src/core/models/unifiedIdentity.js', sql: /UPDATE membership_assignments\s+SET is_primary = 0[\s\S]*WHERE membership_id = \?/i, reason: '在已锁定成员关系内原子切换主岗位' },
  { file: 'server/src/core/models/unifiedIdentity.js', sql: /UPDATE membership_assignments\s+SET assignment_kind = \?/i, reason: '按已授权岗位主键更新岗位' },
  { file: 'server/src/core/models/unifiedIdentity.js', sql: /UPDATE membership_assignments\s+SET status = 'revoked'[\s\S]*WHERE id = \?/i, reason: '按已授权岗位主键撤销岗位' },
  { file: 'server/src/core/models/unifiedIdentity.js', sql: /DELETE FROM membership_assignments WHERE membership_id = \?/i, reason: '旧人事删除事务同步清理成员岗位' },
  { file: 'server/src/core/models/unifiedIdentity.js', sql: /DELETE FROM organization_memberships WHERE id = \?/i, reason: '旧人事删除事务同步清理成员关系' },
  { file: 'server/src/core/models/unifiedIdentity.js', sql: /FROM organization_memberships WHERE person_id = \?/i, reason: '判断自然人是否仍有任一组织成员关系' },
  { file: 'server/src/core/models/unifiedIdentity.js', sql: /FROM admin_grants WHERE person_id = \?/i, reason: '解析自然人的全局管理员授权' },
  { file: 'server/src/core/models/unifiedIdentity.js', sql: /FROM admin_info WHERE id = \? LIMIT 1 FOR UPDATE/i, reason: '按已授权管理员主键锁定旧映射' },
  { file: 'server/src/core/models/unifiedIdentity.js', sql: /FROM admin_grants WHERE legacy_admin_id = \?/i, reason: '由已授权旧管理员主键解析统一授权' },
  { file: 'server/src/core/models/unifiedIdentity.js', sql: /SELECT ag\.legacy_admin_id, a\.status AS account_status/i, reason: '管理员列表批量解析统一账号认证状态' },
  { file: 'server/src/core/models/unifiedIdentity.js', sql: /UPDATE admin_info(?:\s+ai)?[\s\S]*(?:JOIN admin_grants|WHERE id = \?)/i, reason: '统一账号换绑事务同步旧管理员只读映射' },
  { file: 'server/src/core/models/unifiedIdentity.js', sql: /SELECT ag\.\*,[\s\S]*has_binding[\s\S]*FROM admin_grants\s+ag/i, reason: '全局超级管理员存续保护' },
  { file: 'server/src/core/models/unifiedIdentity.js', sql: /SELECT DISTINCT other\.person_id\s+FROM admin_grants/i, reason: '全局超级管理员存续保护' },
  { file: 'server/src/core/models/unifiedIdentity.js', sql: /UPDATE admin_grants SET status = 'revoked'[\s\S]*WHERE id = \?/i, reason: '按已授权管理员授权主键撤销' },
  { file: 'server/src/core/models/unifiedIdentity.js', sql: /SELECT a\.id AS account_id[\s\S]*FROM accounts a/i, reason: '获授权账号治理列表跨组织汇总' },
  { file: 'server/src/core/models/unifiedIdentity.js', sql: /SELECT a\.\*,[\s\S]*FROM accounts a[\s\S]*WHERE a\.person_id = \?/i, reason: '获授权账号治理按自然人锁定账号' },
  { file: 'server/src/core/models/unifiedIdentity.js', sql: /SELECT DISTINCT ag\.person_id\s+FROM admin_grants\s+ag/i, reason: '全局超级管理员存续保护' },
  { file: 'server/src/core/models/unifiedIdentity.js', sql: /SELECT 1\s+FROM admin_grants\s+WHERE person_id = \? AND admin_level = 'super_admin'/i, reason: '锁定目标自然人的超级管理员授权' },
  { file: 'server/src/utils/schemaContract.js', sql: /SELECT\s+\(SELECT COUNT\(\*\)\s+FROM persons p\s+LEFT JOIN organization_memberships/i, reason: '启动时统一身份全局一致性检查' },
  { file: 'server/src/utils/schemaContract.js', sql: /SELECT\s+COUNT\(DISTINCT ag\.id\) AS total,\s+COUNT/i, reason: '启动时超级管理员绑定存续检查' }
];

function walk(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath, output);
    else if (entry.name.endsWith('.js')) output.push(fullPath);
  }
  return output;
}

function isAllowed(relativeFile, sql) {
  return CROSS_ORG_ALLOWLIST.some((entry) => entry.file === relativeFile && entry.sql.test(sql));
}

const findings = [];
for (const file of walk(SERVER_ROOT)) {
  const source = fs.readFileSync(file, 'utf8');
  const relativeFile = path.relative(ROOT, file).replace(/\\/g, '/');
  for (const match of source.matchAll(/([`'"])([\s\S]*?)\1/g)) {
    const sql = match[2].trim();
    if (!/^(?:SELECT|INSERT|UPDATE|DELETE)\b/i.test(sql)) continue;
    const referenced = scopedTables.filter((table) => new RegExp('\\b' + table + '\\b', 'i').test(sql));
    if (!referenced.length || /\borg_id\b/i.test(sql) || isAllowed(relativeFile, sql)) continue;
    findings.push({
      file: relativeFile,
      line: source.slice(0, match.index).split('\n').length,
      tables: referenced.join(', '),
      sql: sql.replace(/\s+/g, ' ').slice(0, 140)
    });
  }
}

console.log(`租户 SQL 审计：${scopedTables.length} 张组织表，未解释的跨组织语句 ${findings.length} 条`);
if (findings.length) console.table(findings);
if (findings.length) process.exitCode = 1;
