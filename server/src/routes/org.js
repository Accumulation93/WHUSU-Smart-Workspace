const express = require('express');
const router = express.Router();
const { safeString, generateId } = require('../utils/helpers');
const { getCurrentOrgId } = require('../utils/orgContext');
const organizationModel = require('../models/organization');
const systemConfigModel = require('../models/systemConfig');
const pool = require('../config/db');

// Tables that have org_id — must be cleaned up when deleting an org.
// admin_info is handled separately to protect root_admin entries.
const ORG_SCOPED_TABLES = [
  'departments', 'identities', 'work_groups',
  'hr_info', 'user_info',
  'score_activities', 'rate_target_rules', 'rate_rule_clauses',
  'clause_template_configs',
  'score_records', 'score_answers',
  'hr_profile_templates', 'hr_profile_template_fields',
  'hr_profile_records', 'hr_profile_record_values'
];

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

    // Auth: only root_admin
    if (!openid) {
      return res.json({ status: 'forbidden', message: '未登录' });
    }
    const [adminRows] = await pool.query(
      "SELECT * FROM admin_info WHERE openid = ? AND bind_status = 'active'",
      [openid]
    );
    const operator = adminRows[0] || null;
    if (!operator || operator.admin_level !== 'root_admin') {
      return res.json({ status: 'forbidden', message: '仅至高权限管理员可操作' });
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

// deleteOrganization — delete data from all org-scoped tables, then the org record
router.post('/deleteOrganization', async (req, res) => {
  try {
    const openid = req.openid;
    const id = safeString(req.body.organizationId || req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供组织ID' });

    // Auth: only root_admin
    const [adminRows] = await pool.query(
      "SELECT * FROM admin_info WHERE openid = ? AND bind_status = 'active' AND admin_level = 'root_admin' LIMIT 1",
      [openid]
    );
    if (!adminRows.length) {
      return res.json({ status: 'forbidden', message: '仅至高权限管理员可操作' });
    }

    // Safety: never allow deleting the root_admin pseudo-organization
    if (id === '') {
      return res.json({ status: 'invalid_params', message: '无效的组织标识' });
    }

    const config = await systemConfigModel.get();
    if (config && config.current_organization === id) {
      return res.json({ status: 'forbidden', message: '不能删除当前正在使用的组织，请先切换到其他组织' });
    }

    // Wrap all deletions in a transaction for atomicity
    const { withTransaction } = require('../config/db');
    await withTransaction(async (conn) => {
      // Delete from org-scoped tables
      for (const table of ORG_SCOPED_TABLES) {
        await conn.query('DELETE FROM ?? WHERE org_id = ?', [table, id]);
      }

      // Delete org-scoped admins ONLY — explicitly exclude root_admin
      // root_admin has org_id = '' and is global; they must never be deleted by org operations.
      await conn.query(
        "DELETE FROM admin_info WHERE org_id = ? AND admin_level != 'root_admin'",
        [id]
      );

      await conn.query('DELETE FROM organizations WHERE id = ?', [id]);
    });

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

    // Auth: only root_admin (global, org_id = '')
    const [adminRows] = await pool.query(
      "SELECT * FROM admin_info WHERE openid = ? AND bind_status = 'active' AND admin_level = 'root_admin' LIMIT 1",
      [openid]
    );
    if (!adminRows.length) {
      return res.json({ status: 'forbidden', message: '仅至高权限管理员可切换组织' });
    }

    const config = await systemConfigModel.get();
    const currentOrgId = config && config.current_organization;

    if (currentOrgId === targetOrgId) {
      return res.json({ status: 'success', message: '已是当前组织，无需切换' });
    }

    // Upsert organization record
    const [existingOrg] = await pool.query('SELECT id FROM organizations WHERE id = ?', [targetOrgId]);
    if (existingOrg.length) {
      await pool.query('UPDATE organizations SET name = ? WHERE id = ?', [targetOrgName, targetOrgId]);
    } else {
      await pool.query('INSERT INTO organizations (id, name) VALUES (?, ?)', [targetOrgId, targetOrgName]);
    }

    // Update system config — this is the ONLY thing needed for org switching now
    const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await systemConfigModel.ensureExists();
    await systemConfigModel.setCurrentOrganization(targetOrgId, nowUtc);

    res.json({ status: 'success', message: `已切换至组织「${targetOrgName}」` });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) || '组织切换失败' });
  }
});

module.exports = router;
