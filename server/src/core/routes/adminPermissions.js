const localeCopy = require('../../locales/zh-CN/generated/core/routes/adminPermissions');
const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const pool = require('../../config/db');
const { safeString } = require('../../utils/helpers');
const adminPermissionModel = require('../models/adminPermission');
const unifiedIdentityModel = require('../models/unifiedIdentity');
const { resolveCurrentAdmin } = require('../services/adminRequestContext');
const {
  PERMISSION_DEFINITIONS,
  loadEffectivePermissions,
  isApplicable,
  canConfigureAdminPermissions,
  editablePermissionKeys,
  serializeCatalog
} = require('../services/adminPermissions');

async function resolveOperator(req) {
  return resolveCurrentAdmin(req);
}

async function resolvePermissionManager(req) {
  const operator = await resolveOperator(req);
  if (!operator) return { operator: null, effective: null, orgId: '' };
  // 管理权限必须跟随本次统一会话中已经选定的组织。system_config 中的
  // 默认组织只影响新会话默认值，不能覆盖用户已经切换到的工作角色。
  const orgId = safeString(req.authContext && req.authContext.organizationId);
  if (!orgId) return { operator: null, effective: null, orgId: '' };
  const effective = await loadEffectivePermissions(operator, orgId);
  return { operator, effective, orgId };
}

function levelLabel(level) {
  return level === 'super_admin' ? '超级管理员' : '普通管理员';
}

router.post('/getMyAdminPermissions', async (req, res) => {
  try {
    const { operator, effective, orgId } = await resolvePermissionManager(req);
    if (!operator) return res.status(403).json({ status: 'forbidden', message: localeCopy.copy_b0eb464235 });
    res.json({
      status: 'success',
      organizationId: orgId,
      adminLevel: operator.admin_level,
      permissions: effective.permissions,
      permissionKeys: effective.keys,
      canAccessPermissionSystem: effective.canAccessPermissionSystem
    });
  } catch (error) {
    req.logger.error('Get own permissions failed', { error: error.message });
    res.status(500).json({ status: 'error', message: localeCopy.copy_e52119b17e });
  }
});

router.post('/listPermissionManagedAdmins', async (req, res) => {
  try {
    const { operator, effective, orgId } = await resolvePermissionManager(req);
    if (!operator || !effective.canAccessPermissionSystem) {
      return res.status(403).json({ status: 'permission_denied', message: localeCopy.copy_9980d48bf5 });
    }
    const rows = await adminPermissionModel.listTargets(orgId, ['admin']);
    const authenticationStates = await unifiedIdentityModel.listLegacyAdminAuthenticationStates(
      rows.map((item) => item.id)
    );
    const items = [];
    for (const row of rows.filter((item) => item.id !== operator.id)) {
      const targetEffective = await loadEffectivePermissions(Object.assign({ org_id: orgId }, row), orgId);
      const applicableCount = Array.from(PERMISSION_DEFINITIONS.keys()).filter((key) => isApplicable(key, row.admin_level)).length;
      const grantedCount = Array.from(PERMISSION_DEFINITIONS.keys()).filter((key) => isApplicable(key, row.admin_level) && targetEffective.permissions[key]).length;
      const authenticationStatus = authenticationStates[row.id] || 'pending_verification';
      const authenticationLabels = {
        verified: '已认证',
        frozen: '已冻结',
        recovery_required: '待恢复',
        pending_verification: '待认证'
      };
      items.push({
        id: row.id,
        name: safeString(row.name),
        studentId: safeString(row.student_id),
        adminLevel: row.admin_level,
        adminLevelLabel: levelLabel(row.admin_level),
        authenticationStatus,
        bindStatusLabel: authenticationLabels[authenticationStatus] || localeCopy.copy_5342fa4b24,
        grantedCount,
        applicableCount
      });
    }
    res.json({ status: 'success', list: items, operatorLevel: operator.admin_level });
  } catch (error) {
    req.logger.error('List permission targets failed', { error: error.message });
    res.status(500).json({ status: 'error', message: localeCopy.copy_6026566679 });
  }
});

router.post('/getAdminPermissionDetail', async (req, res) => {
  try {
    const { operator, effective, orgId } = await resolvePermissionManager(req);
    const adminId = safeString(req.body.adminId);
    const target = await adminPermissionModel.getTarget(orgId, adminId);
    if (!canConfigureAdminPermissions(operator, effective, target, orgId)) {
      return res.status(403).json({ status: 'permission_denied', message: localeCopy.copy_1cf137dd0d });
    }
    const targetEffective = await loadEffectivePermissions(target, orgId);
    const editableKeys = editablePermissionKeys(operator, effective, target, orgId, targetEffective);
    res.json({
      status: 'success',
      admin: {
        id: target.id,
        name: safeString(target.name),
        studentId: safeString(target.student_id),
        adminLevel: target.admin_level,
        adminLevelLabel: levelLabel(target.admin_level)
      },
      groups: serializeCatalog(target.admin_level, targetEffective.permissions, editableKeys)
    });
  } catch (error) {
    req.logger.error('Get admin permission detail failed', { error: error.message });
    res.status(500).json({ status: 'error', message: localeCopy.copy_22c4d68f78 });
  }
});

router.post('/saveAdminPermissions', async (req, res) => {
  let connection;
  try {
    const manager = await resolvePermissionManager(req);
    const operator = manager.operator;
    const orgId = manager.orgId;
    const adminId = safeString(req.body.adminId);
    const submitted = req.body.permissions && typeof req.body.permissions === 'object' ? req.body.permissions : null;
    if (!submitted || Array.isArray(submitted)) {
      return res.status(400).json({ status: 'invalid_params', message: localeCopy.copy_8e40bbeebe });
    }
    connection = await pool.getConnection();
    await connection.beginTransaction();
    // 在写事务内重新读取操作者权限，避免授权被撤销时旧快照继续写入。
    const effective = await loadEffectivePermissions(operator, orgId, connection);
    const target = await adminPermissionModel.getTarget(orgId, adminId, connection, true);
    if (!canConfigureAdminPermissions(operator, effective, target, orgId)) {
      await connection.rollback();
      return res.status(403).json({ status: 'permission_denied', message: localeCopy.copy_1cf137dd0d });
    }

    const targetEffective = await loadEffectivePermissions(target, orgId, connection);
    const applicableKeys = Array.from(PERMISSION_DEFINITIONS.keys()).filter((key) => isApplicable(key, target.admin_level));
    const editableKeys = editablePermissionKeys(operator, effective, target, orgId, targetEffective);
    const submittedKeys = Object.keys(submitted);
    const unknownKeys = submittedKeys.filter((key) => !applicableKeys.includes(key));
    if (unknownKeys.length) {
      await connection.rollback();
      return res.status(400).json({ status: 'invalid_params', message: localeCopy.copy_8e40bbeebe });
    }
    if (submittedKeys.some((key) => typeof submitted[key] !== 'boolean')) {
      await connection.rollback();
      return res.status(400).json({ status: 'invalid_params', message: localeCopy.copy_8e40bbeebe });
    }
    if (submittedKeys.some((key) => !editableKeys.includes(key))) {
      await connection.rollback();
      return res.status(403).json({ status: 'permission_denied', message: localeCopy.copy_8e40bbeebe });
    }
    if (submitted['system.admin_accounts.write'] === true
      && submitted['system.admin_accounts.read'] !== true
      && editableKeys.includes('system.admin_accounts.read')) {
      submitted['system.admin_accounts.read'] = true;
    }

    await adminPermissionModel.upsertOverrides(connection, {
      orgId,
      adminId,
      operatorId: operator.id,
      items: Object.keys(submitted).map((key) => ({ id: crypto.randomUUID(), permissionKey: key, granted: submitted[key] }))
    });
    await adminPermissionModel.createAuditLog(connection, {
      id: crypto.randomUUID(),
      orgId,
      operatorId: operator.id,
      targetAdminId: adminId,
      action: 'partial_update',
      snapshot: submitted
    });
    await connection.commit();
    const saved = await loadEffectivePermissions(target, orgId);
    res.json({
      status: 'success',
      message: localeCopy.copy_f301163b57,
      permissions: saved.permissions,
      groups: serializeCatalog(
        target.admin_level,
        saved.permissions,
        editablePermissionKeys(operator, effective, target, orgId, saved)
      )
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
    }
    req.logger.error('Save admin permissions failed', { error: error.message });
    res.status(500).json({ status: 'error', message: localeCopy.copy_215e3c57da });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
