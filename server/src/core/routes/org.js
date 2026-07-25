const express = require('express');
const router = express.Router();
const { safeString, generateId } = require('../../utils/helpers');
const { getCurrentOrgId } = require('../../utils/orgContext');
const organizationModel = require('../models/organization');
const systemConfigModel = require('../models/systemConfig');
const pool = require('../../config/db');

const ORG_REFERENCE_COLUMNS = new Set([
  'org_id',
  'creator_org_id',
  'approval_org_id'
]);

async function findOrganizationDependencies(conn, organizationId) {
  const [columns] = await conn.query(
    `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND COLUMN_NAME IN ('org_id', 'creator_org_id', 'approval_org_id')
      ORDER BY TABLE_NAME, ORDINAL_POSITION`
  );
  const tables = new Set();
  for (const column of columns) {
    const tableName = safeString(column.table_name);
    const columnName = safeString(column.column_name);
    if (!tableName || !ORG_REFERENCE_COLUMNS.has(columnName)) continue;
    const [rows] = await conn.query(
      'SELECT 1 AS present FROM ?? WHERE ?? = ? LIMIT 1',
      [tableName, columnName, organizationId]
    );
    if (rows.length) tables.add(tableName);
  }
  return Array.from(tables).sort();
}

// listOrganizations — admin only
router.post('/listOrganizations', async (req, res) => {
  try {
    // Require admin authentication
    const openid = req.openid;
    if (!openid) {
      return res.json({ status: 'forbidden', message: '未登录' });
    }
    const [adminRows] = await pool.query(
      "SELECT * FROM admin_info WHERE openid = ? AND bind_status = 'active'",
      [openid]
    );
    if (!adminRows.length) {
      return res.json({ status: 'forbidden', message: '仅管理员可查看组织列表' });
    }

    const rows = await organizationModel.getAll();
    res.json({ status: 'success', list: rows });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// saveOrganization
router.post('/saveOrganization', async (req, res) => {
  try {
    const openid = req.openid;
    const id = safeString(req.body.id);
    const name = safeString(req.body.name);

    // 仅全局超级管理员可操作
    if (!openid) {
      return res.json({ status: 'forbidden', message: '未登录' });
    }
    const [adminRows] = await pool.query(
      "SELECT * FROM admin_info WHERE openid = ? AND bind_status = 'active'",
      [openid]
    );
    const operator = adminRows[0] || null;
    if (!operator || operator.admin_level !== 'super_admin' || operator.org_id !== '') {
      return res.json({ status: 'forbidden', message: '仅超级管理员可操作' });
    }

    if (!name) {
      return res.json({ status: 'invalid_params', message: '请填写组织名称' });
    }

    const [dups] = await pool.query('SELECT id FROM organizations WHERE name = ?', [name]);
    if (dups.some((r) => String(r.id) !== id)) {
      return res.json({ status: 'duplicate', message: '组织名称重复' });
    }

    if (id) {
      await organizationModel.update(id, name);
      res.json({ status: 'success', organization: { id, name }, message: '组织更新成功' });
    } else {
      const newId = generateId();
      await organizationModel.create(newId, name);
      res.json({ status: 'success', organization: { id: newId, name }, message: '组织创建成功' });
    }
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// deleteOrganization — only empty organizations may be deleted. Business data is
// never cascaded implicitly because independently owned modules must not be
// partially removed.
router.post('/deleteOrganization', async (req, res) => {
  try {
    const openid = req.openid;
    const id = safeString(req.body.organizationId || req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供组织ID' });

    // 仅全局超级管理员可操作
    const [adminRows] = await pool.query(
      "SELECT * FROM admin_info WHERE openid = ? AND bind_status = 'active' AND admin_level = 'super_admin' AND org_id = '' LIMIT 1",
      [openid]
    );
    if (!adminRows.length) {
      return res.json({ status: 'forbidden', message: '仅超级管理员可操作' });
    }

    // 禁止删除空组织标识
    if (id === '') {
      return res.json({ status: 'invalid_params', message: '无效的组织标识' });
    }

    const { withTransaction } = require('../../config/db');
    const result = await withTransaction(async (conn) => {
      const [configs] = await conn.query(
        "SELECT current_organization FROM system_config WHERE id = 'default' FOR UPDATE"
      );
      if (configs[0] && safeString(configs[0].current_organization) === id) {
        return { status: 'current' };
      }

      const [organizations] = await conn.query(
        'SELECT id FROM organizations WHERE id = ? FOR UPDATE',
        [id]
      );
      if (!organizations.length) return { status: 'not_found' };

      const dependencies = await findOrganizationDependencies(conn, id);
      if (dependencies.length) {
        return { status: 'not_empty', dependencies };
      }

      const [deleteResult] = await conn.query(
        'DELETE FROM organizations WHERE id = ?',
        [id]
      );
      return { status: deleteResult.affectedRows === 1 ? 'deleted' : 'not_found' };
    });

    if (result.status === 'not_found') {
      return res.json({ status: 'not_found', message: '组织不存在' });
    }
    if (result.status === 'current') {
      return res.json({ status: 'forbidden', message: '请先切换到其他组织' });
    }
    if (result.status === 'not_empty') {
      return res.json({
        status: 'organization_not_empty',
        message: '组织仍包含业务数据，为防止误删，请先归档或清理相关数据',
        dependencyCount: result.dependencies.length
      });
    }
    res.json({ status: 'success', message: '组织已删除' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// getCurrentOrganization
router.post('/getCurrentOrganization', async (req, res) => {
  try {
    const config = await systemConfigModel.get();
    const orgId = config && config.current_organization;
    if (!orgId) {
      return res.json({ status: 'success', organization: null });
    }
    const org = await organizationModel.getById(orgId);
    res.json({
      status: 'success',
      organization: org ? { id: org.id, name: org.name } : null
    });
  } catch (e) {
    res.json({ status: 'success', organization: null });
  }
});

// switchOrganization — simply update system_config, no data migration
router.post('/switchOrganization', async (req, res) => {
  try {
    const openid = req.openid;
    const targetOrgId = safeString(req.body.organizationId);
    const targetOrgName = safeString(req.body.organizationName);

    if (!targetOrgId || !targetOrgName) {
      return res.json({ status: 'invalid_params', message: '请提供组织ID和名称' });
    }

    // Safety: prevent switching to empty org
    if (targetOrgId === '') {
      return res.json({ status: 'invalid_params', message: '无效的组织标识' });
    }

    // 仅全局超级管理员可切换系统默认组织
    const [adminRows] = await pool.query(
      "SELECT * FROM admin_info WHERE openid = ? AND bind_status = 'active' AND admin_level = 'super_admin' AND org_id = '' LIMIT 1",
      [openid]
    );
    if (!adminRows.length) {
      return res.json({ status: 'forbidden', message: '仅超级管理员可切换组织' });
    }

    const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await systemConfigModel.ensureExists();
    const { withTransaction } = require('../../config/db');
    const switchResult = await withTransaction(async (conn) => {
      const [configs] = await conn.query(
        "SELECT current_organization FROM system_config WHERE id = 'default' FOR UPDATE"
      );
      const currentOrgId = configs[0] && safeString(configs[0].current_organization);
      if (currentOrgId === targetOrgId) return { unchanged: true };

      const [existingOrg] = await conn.query(
        'SELECT id FROM organizations WHERE id = ? FOR UPDATE',
        [targetOrgId]
      );
      if (existingOrg.length) {
        await conn.query(
          'UPDATE organizations SET name = ? WHERE id = ?',
          [targetOrgName, targetOrgId]
        );
      } else {
        await conn.query(
          'INSERT INTO organizations (id, name) VALUES (?, ?)',
          [targetOrgId, targetOrgName]
        );
      }
      await conn.query(
        "UPDATE system_config SET current_organization = ?, updated_at = ? WHERE id = 'default'",
        [targetOrgId, nowUtc]
      );
      return { unchanged: false };
    });

    res.json({
      status: 'success',
      message: switchResult.unchanged
        ? '已是当前组织，无需切换'
        : `已切换至组织「${targetOrgName}」`
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) || '组织切换失败' });
  }
});

module.exports = router;
