'use strict';

/**
 * 一次性维护脚本：清理指定组织及其成员。
 *
 * 安全设计：
 *   - 默认只做预检（不写任何数据），必须显式传 --apply 才执行删除；
 *   - 必须同时给出 --organization-id 与 --confirm-name，且组织名完全一致才继续；
 *   - 拒绝删除系统默认组织；
 *   - 成员删除复用人事永久删除服务（事务、锁、幂等、审计事件齐全）：
 *       只属于该组织的自然人 → person 范围（连账号一起清干净）；
 *       同时属于其他组织 → membership 范围（只清该组织内的信息）；
 *   - 成员清完后按白名单清理该组织的字典与配置残留，其余非空表一律拒绝删除并列出；
 *   - 全过程打印每一步数量，便于与备份对照。
 *
 * 用法：
 *   node server/scripts/purgeOrganization.js --organization-id <id> --confirm-name "<组织名>" \
 *     --actor-person-id <超级管理员personId> [--only-person-id <personId>] [--apply] [--batch-size 50]
 *
 * 注意：服务端禁止操作者删除自己，因此“操作者本人也是本组织成员”的那一条必须换一名
 * 超级管理员再跑一次（配合 --only-person-id 精准处理），审计会如实记录两次的真实操作者。
 */
const path = require('path');
const pool = require('../src/config/db');
const { safeString } = require('../src/utils/helpers');
const hrMemberDeletionService = require('../src/core/services/hrMemberDeletionService');

// 成员删完后的组织自身残留，按“先子后父”的顺序清理；白名单之外一律不删。
const ORG_SCOPED_CLEANUP_ORDER = [
  'hr_profile_review_events',
  'hr_profile_record_values',
  'hr_profile_records',
  'org_hr_profile_migration_items',
  'org_hr_profile_migrations',
  'org_hr_profile_template_switches',
  'org_hr_profile_template_snapshots',
  'membership_assignments',
  'hr_info',
  'user_info',
  'organization_memberships',
  'admin_permission_overrides',
  'admin_permission_audit_logs',
  'admin_info',
  'admin_grants',
  'venue_approval_flow_step_rules',
  'venue_approval_flow_steps',
  'venue_approval_flows',
  // 职能组引用部门（fk_wg_department），必须先删职能组再删部门/身份类别。
  'work_groups',
  'departments',
  'identities',
  'organization_dictionary_locks',
  'request_deduplication'
];

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    if (key === 'apply') {
      args.apply = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) continue;
    args[key] = value;
    index += 1;
  }
  return args;
}

function log(message) {
  process.stdout.write(message + '\n');
}

async function loadOrganization(organizationId) {
  const [rows] = await pool.query('SELECT id, name FROM organizations WHERE id = ? LIMIT 1', [organizationId]);
  return rows[0] || null;
}

async function isDefaultOrganization(organizationId) {
  const [rows] = await pool.query(
    "SELECT current_organization FROM system_config WHERE id = 'default' LIMIT 1"
  );
  return safeString(rows[0] && rows[0].current_organization) === organizationId;
}

async function listOrgMemberships(organizationId) {
  const [rows] = await pool.query(
    `SELECT m.id AS membership_id, m.person_id, m.legacy_hr_id, m.status AS membership_status,
            p.name, p.student_id,
            (SELECT COUNT(DISTINCT other.org_id)
               FROM organization_memberships other
              WHERE other.person_id = m.person_id) AS organization_count
       FROM organization_memberships m
       JOIN persons p ON p.id = m.person_id
      WHERE m.org_id = ?
      ORDER BY p.name`,
    [organizationId]
  );
  return rows;
}

async function listOrgDependencies(organizationId) {
  const [columns] = await pool.query(
    `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND COLUMN_NAME IN ('org_id', 'creator_org_id', 'approval_org_id')
      ORDER BY TABLE_NAME, ORDINAL_POSITION`
  );
  const present = [];
  for (const column of columns) {
    const tableName = safeString(column.table_name);
    const columnName = safeString(column.column_name);
    if (!tableName) continue;
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM ?? WHERE ?? = ?',
      [tableName, columnName, organizationId]
    );
    if (Number(rows[0] && rows[0].cnt || 0) > 0) {
      present.push({ table: tableName, column: columnName, count: Number(rows[0].cnt) });
    }
  }
  return present;
}

function buildPreviewInput(member, organizationId) {
  const exclusive = Number(member.organization_count || 0) <= 1;
  return exclusive
    ? { scope: 'person', personId: safeString(member.person_id), organizationId }
    : { scope: 'membership', legacyHrId: safeString(member.legacy_hr_id), organizationId };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const organizationId = safeString(args['organization-id']);
  const confirmName = safeString(args['confirm-name']);
  const actorPersonId = safeString(args['actor-person-id']);
  const onlyPersonId = safeString(args['only-person-id']);
  const apply = args.apply === true;
  const batchSize = Math.max(1, Number(args['batch-size'] || 50));

  if (!organizationId || !confirmName || !actorPersonId) {
    throw new Error('必须提供 --organization-id、--confirm-name 与 --actor-person-id');
  }
  const organization = await loadOrganization(organizationId);
  if (!organization) throw new Error('组织不存在：' + organizationId);
  if (safeString(organization.name) !== confirmName) {
    throw new Error(`组织名不匹配：期望「${confirmName}」，实际「${safeString(organization.name)}」`);
  }
  if (await isDefaultOrganization(organizationId)) {
    throw new Error('拒绝删除系统默认组织');
  }

  const actor = {
    personId: actorPersonId,
    adminLevel: 'super_admin',
    adminLevelValue: 'super_admin',
    organizationId: '',
    contextId: 'purge-organization-script'
  };

  const members = await listOrgMemberships(organizationId);
  const exclusiveMembers = members.filter((item) => Number(item.organization_count || 0) <= 1);
  const sharedMembers = members.filter((item) => Number(item.organization_count || 0) > 1);
  log(`[purge] 组织：${safeString(organization.name)}（${organizationId}）`);
  log(`[purge] 成员 ${members.length}：仅属本组织 ${exclusiveMembers.length}，同时属于其他组织 ${sharedMembers.length}`);
  log(`[purge] 模式：${apply ? 'APPLY（真实删除）' : 'DRY-RUN（只预检）'}`);

  const businessBlocked = [];
  const safetySkipped = [];
  const planned = [];
  for (let index = 0; index < members.length; index += 1) {
    const member = members[index];
    if (onlyPersonId && safeString(member.person_id) !== onlyPersonId) continue;
    const input = buildPreviewInput(member, organizationId);
    try {
      const preview = await hrMemberDeletionService.previewHrMemberDeletion(input, actor);
      planned.push({ member, input, version: preview.version, scope: preview.scope });
      if (!preview.eligible) {
        const entry = {
          name: safeString(member.name),
          scope: preview.scope,
          blockers: (preview.blockers || []).map((item) => `${item.category}:${item.count}`).join(','),
          safety: (preview.safetyBlocks || []).map((item) => item.category).join(',')
        };
        // 安全类（操作者本人、最后一名超级管理员）跳过即可；业务历史类必须停下来。
        if (preview.blockers && preview.blockers.length) businessBlocked.push(entry);
        else safetySkipped.push(entry);
      }
    } catch (error) {
      businessBlocked.push({
        name: safeString(member.name),
        scope: input.scope,
        blockers: 'preview_failed',
        safety: safeString(error && error.message)
      });
    }
    if ((index + 1) % batchSize === 0) {
      log(`[purge] 预检进度 ${index + 1}/${members.length}（业务受阻 ${businessBlocked.length}，安全跳过 ${safetySkipped.length}）`);
    }
  }

  const executable = planned.filter((item) => !safetySkipped.some((skip) => skip.name === safeString(item.member.name)));
  log(`[purge] 预检完成：可删除 ${executable.length}，安全跳过 ${safetySkipped.length}，业务受阻 ${businessBlocked.length}`);
  safetySkipped.slice(0, 20).forEach((item) => {
    log(`[purge]   安全跳过 ${item.name}（${item.scope}）${item.safety}`);
  });
  businessBlocked.slice(0, 20).forEach((item) => {
    log(`[purge]   受阻 ${item.name}（${item.scope}）${item.blockers} ${item.safety}`);
  });
  if (!apply) {
    log('[purge] DRY-RUN 结束，未做任何写入');
    return;
  }
  if (businessBlocked.length) {
    log('[purge] 存在受阻成员，先处理后再执行；本次不写入');
    return;
  }

  const results = { person: 0, membership: 0, failed: [] };
  for (let index = 0; index < executable.length; index += 1) {
    const item = executable[index];
    const clientRequestId = `purge-org-${organizationId.slice(0, 12)}-${index}`;
    const data = Object.assign({}, item.input, {
      clientRequestId,
      expectedVersion: item.version,
      acceptCleanup: true,
      ip: 'maintenance-script'
    });
    if (item.scope === 'person') data.confirmStudentId = safeString(item.member.student_id);
    try {
      if (item.scope === 'person') {
        await hrMemberDeletionService.deletePersonPermanently(data, actor);
        results.person += 1;
      } else {
        await hrMemberDeletionService.deleteHrMembershipPermanently(data, actor);
        results.membership += 1;
      }
    } catch (error) {
      results.failed.push({ name: safeString(item.member.name), error: safeString(error && error.message) });
    }
    if ((index + 1) % batchSize === 0) {
      log(`[purge] 删除进度 ${index + 1}/${executable.length}（自然人 ${results.person}，仅成员关系 ${results.membership}，失败 ${results.failed.length}）`);
    }
  }
  log(`[purge] 成员删除完成：自然人 ${results.person}，仅成员关系 ${results.membership}，失败 ${results.failed.length}`);
  results.failed.slice(0, 20).forEach((item) => log(`[purge]   失败 ${item.name}：${item.error}`));

  const beforeCleanup = await listOrgDependencies(organizationId);
  log(`[purge] 成员清完后仍有数据的表：${beforeCleanup.map((item) => `${item.table}(${item.count})`).join('、') || '（无）'}`);

  const allowed = new Set(ORG_SCOPED_CLEANUP_ORDER);
  const byTable = new Map(beforeCleanup.map((item) => [item.table, item]));
  const refusal = beforeCleanup.filter((item) => !allowed.has(item.table) || item.column !== 'org_id');
  if (refusal.length) {
    log(`[purge] 发现白名单之外的组织数据，已停止：${refusal.map((item) => `${item.table}.${item.column}(${item.count})`).join('、')}`);
    return;
  }

  await pool.withTransaction(async (connection) => {
    for (const table of ORG_SCOPED_CLEANUP_ORDER) {
      const present = byTable.get(table);
      if (!present) continue;
      const [result] = await connection.query('DELETE FROM ?? WHERE org_id = ?', [table, organizationId]);
      log(`[purge] 清理 ${table}: ${Number(result.affectedRows || 0)} 行`);
    }
  });

  const remaining = await listOrgDependencies(organizationId);
  if (remaining.length) {
    log(`[purge] 清理后仍有关联数据，未删除组织：${remaining.map((item) => `${item.table}.${item.column}(${item.count})`).join('、')}`);
    return;
  }
  const [deleted] = await pool.query('DELETE FROM organizations WHERE id = ?', [organizationId]);
  log(`[purge] 组织删除：${Number(deleted.affectedRows || 0)} 行`);

  const [orgLeft] = await pool.query('SELECT COUNT(*) AS cnt FROM organizations WHERE id = ?', [organizationId]);
  const [exclusiveLeft] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM persons p WHERE p.id IN (${exclusiveMembers.map(() => '?').join(',') || 'NULL'})`,
    exclusiveMembers.map((item) => safeString(item.person_id))
  );
  log(`[purge] 校验：组织剩余 ${Number(orgLeft[0].cnt)}，应删光但仍存在的自然人 ${Number(exclusiveLeft[0].cnt)}`);
  log('[purge] 完成');
}

run()
  .then(() => pool.end())
  .catch(async (error) => {
    process.stderr.write('[purge] 失败：' + (error && error.stack ? error.stack : String(error)) + '\n');
    try { await pool.end(); } catch (_) {}
    process.exitCode = 1;
  });
