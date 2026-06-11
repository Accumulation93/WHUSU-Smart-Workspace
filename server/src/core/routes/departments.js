const express = require('express');
const router = express.Router();
const { safeString, generateId } = require('../../utils/helpers');
const { getCurrentOrgId } = require('../../utils/orgContext');
const departmentModel = require('../models/department');
const adminInfoModel = require('../models/adminInfo');

async function ensureAdmin(openid) {
  return adminInfoModel.getByOpenid(openid);
}

// listDepartments
router.post('/listDepartments', async (req, res) => {
  try {
    const rows = await departmentModel.getAll();
    const departments = rows.map((item) => ({
      id: safeString(item.id),
      key: safeString(item.id),
      name: safeString(item.name),
      description: safeString(item.description)
    })).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    res.json({ status: 'success', departments });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// saveDepartment
router.post('/saveDepartment', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

    const id = safeString(req.body.id);
    const name = safeString(req.body.name);
    const description = safeString(req.body.description);

    if (!name) {
      return res.json({ status: 'invalid_params', message: '请输入部门名称' });
    }

    const pool = require('../../config/db');
    const orgId = await getCurrentOrgId();
    const [dups] = await pool.query('SELECT id FROM departments WHERE name = ? AND org_id = ?', [name, orgId]);
    if (dups.some((r) => String(r.id) !== id)) {
      return res.json({ status: 'duplicate', message: '部门名称重复' });
    }

    if (id) {
      const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await departmentModel.update(id, name, description, nowUtc);
      res.json({ status: 'success', message: '部门更新成功' });
    } else {
      const newId = generateId();
      await departmentModel.create(newId, name, description);
      res.json({ status: 'success', id: newId, message: '部门创建成功' });
    }
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// deleteDepartment
router.post('/deleteDepartment', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供部门ID' });

    // Check references before deletion
    const pool = require('../../config/db');
    const orgId = await getCurrentOrgId();
    const [hrRef] = await pool.query('SELECT id FROM hr_info WHERE department_id = ? AND org_id = ? LIMIT 1', [id, orgId]);
    if (hrRef.length) return res.json({ status: 'in_use', message: '该部门已被人事成员引用，不能删除' });
    const [wgRef] = await pool.query('SELECT id FROM work_groups WHERE department_id = ? AND org_id = ? LIMIT 1', [id, orgId]);
    if (wgRef.length) return res.json({ status: 'in_use', message: '该部门下还有工作分工，不能删除' });
    const [ruleRef] = await pool.query('SELECT id FROM rate_target_rules WHERE scorer_department_id = ? AND org_id = ? LIMIT 1', [id, orgId]);
    if (ruleRef.length) return res.json({ status: 'in_use', message: '该部门已被评分规则引用，不能删除' });

    await departmentModel.remove(id);
    res.json({ status: 'success', message: '部门已删除' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
