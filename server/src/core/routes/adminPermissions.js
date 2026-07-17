const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const pool = require('../../config/db');
const { safeString } = require('../../utils/helpers');
const { getCurrentOrgId } = require('../../utils/orgContext');
const adminInfoModel = require('../models/adminInfo');
const adminPermissionModel = require('../models/adminPermission');
const {
  PERMISSION_DEFINITIONS,
  loadEffectivePermissions,
  isApplicable,
  canConfigureAdminPermissions,
  serializeCatalog
} = require('../services/adminPermissions');

async function resolveOperator(req) {
  if (req.get('X-Role') !== 'admin') return null;
  return adminInfoModel.getByOpenid(req.openid);
}

async function resolvePermissionManager(req) {
  const operator = await resolveOperator(req);
  if (!operator) return { operator: null, effective: null, orgId: '' };
  const orgId = await getCurrentOrgId();
  const effective = await loadEffectivePermissions(operator, orgId);
  return { operator, effective, orgId };
}

function levelLabel(level) {
  return level === 'super_admin' ? '超级管理员' : '普通管理员';
}

router.post('/getMyAdminPermissions', async (req, res) => {
  try {
    const { operator, effective, orgId } = await resolvePermissionManager(req);
    if (!operator) return res.status(403).json({ status: 'forbidden', message: '当前管理员身份已失效' });
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
    res.status(500).json({ status: 'error', message: '读取权限失败' });
  }
});

router.post('/listPermissionManagedAdmins', async (req, res) => {
  try {
    const { operator, effective, orgId } = await resolvePermissionManager(req);
    if (!operator || !effective.canAccessPermissionSystem) {
      return res.status(403).json({ status: 'permission_denied', message: '没有访问权限系统的权限' });
    }
    const levels = operator.admin_level === 'root_admin' ? ['super_admin', 'admin'] : ['admin'];
    const rows = await adminPermissionModel.listTargets(orgId, levels);
    const items = [];
    for (const row of rows) {
      const targetEffective = await loadEffectivePermissions(Object.assign({ org_id: orgId }, row), orgId);
      const applicableCount = Array.from(PERMISSION_DEFINITIONS.keys()).filter((key) => isApplicable(key, row.admin_level)).length;
      const grantedCount = Array.from(PERMISSION_DEFINITIONS.keys()).filter((key) => isApplicable(key, row.admin_level) && targetEffective.permissions[key]).length;
      items.push({
        id: row.id,
        name: safeString(row.name),
        studentId: safeString(row.student_id),
        adminLevel: row.admin_level,
        adminLevelLabel: levelLabel(row.admin_level),
        bindStatus: row.bind_status,
        bindStatusLabel: row.bind_status === 'active' ? '已绑定' : '待绑定',
        grantedCount,
        applicableCount
      });
    }
    res.json({ status: 'success', list: items, operatorLevel: operator.admin_level });
  } catch (error) {
    req.logger.error('List permission targets failed', { error: error.message });
    res.status(500).json({ status: 'error', message: '读取管理员列表失败' });
  }
});

router.post('/getAdminPermissionDetail', async (req, res) => {
  try {
    const { operator, effective, orgId } = await resolvePermissionManager(req);
    const adminId = safeString(req.body.adminId);
    const target = await adminPermissionModel.getTarget(orgId, adminId);
    if (!canConfigureAdminPermissions(operator, effective, target, orgId)) {
      return res.status(403).json({ status: 'permission_denied', message: '不能配置该管理员的权限' });
    }
    const targetEffective = await loadEffectivePermissions(target, orgId);
    res.json({
      status: 'success',
      admin: {
        id: target.id,
        name: safeString(target.name),
        studentId: safeString(target.student_id),
        adminLevel: target.admin_level,
        adminLevelLabel: levelLabel(target.admin_level)
      },
      groups: serializeCatalog(target.admin_level, targetEffective.permissions)
    });
  } catch (error) {
    req.logger.error('Get admin permission detail failed', { error: error.message });
    res.status(500).json({ status: 'error', message: '读取权限详情失败' });
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
      return res.status(400).json({ status: 'invalid_params', message: '权限配置格式无效' });
    }
    connection = await pool.getConnection();
    await connection.beginTransaction();
    // 在写事务内重新读取操作者权限，避免授权被撤销时旧快照继续写入。
    const effective = await loadEffectivePermissions(operator, orgId, connection);
    const target = await adminPermissionModel.getTarget(orgId, adminId, connection, true);
    if (!canConfigureAdminPermissions(operator, effective, target, orgId)) {
      await connection.rollback();
      return res.status(403).json({ status: 'permission_denied', message: '不能配置该管理员的权限' });
    }

    const applicableKeys = Array.from(PERMISSION_DEFINITIONS.keys()).filter((key) => isApplicable(key, target.admin_level));
    const unknownKeys = Object.keys(submitted).filter((key) => !applicableKeys.includes(key));
    if (unknownKeys.length) {
      await connection.rollback();
      return res.status(400).json({ status: 'invalid_params', message: '包含不可配置的权限项' });
    }
    if (applicableKeys.some((key) => typeof submitted[key] !== 'boolean')) {
      await connection.rollback();
      return res.status(400).json({ status: 'invalid_params', message: '请提交完整的权限配置' });
    }

    await adminPermissionModel.replaceOverrides(connection, {
      orgId,
      adminId,
      operatorId: operator.id,
      items: applicableKeys.map((key) => ({ id: crypto.randomUUID(), permissionKey: key, granted: submitted[key] }))
    });
    await adminPermissionModel.createAuditLog(connection, {
      id: crypto.randomUUID(),
      orgId,
      operatorId: operator.id,
      targetAdminId: adminId,
      action: 'replace',
      snapshot: submitted
    });
    await connection.commit();
    const saved = await loadEffectivePermissions(target, orgId);
    res.json({
      status: 'success',
      message: '权限配置已生效',
      permissions: saved.permissions,
      groups: serializeCatalog(target.admin_level, saved.permissions)
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
    }
    req.logger.error('Save admin permissions failed', { error: error.message });
    res.status(500).json({ status: 'error', message: '保存权限失败' });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = router;
