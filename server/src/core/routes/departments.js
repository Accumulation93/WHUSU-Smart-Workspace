const localeCopy = require('../../locales/zh-CN/generated/core/routes/departments');
const express = require('express');
const router = express.Router();
const { safeString, generateId } = require('../../utils/helpers');
const { getCurrentOrgId } = require('../../utils/orgContext');
const departmentModel = require('../models/department');
const adminInfoModel = require('../models/adminInfo');
const pool = require('../../config/db');

async function ensureAdmin(openid) {
  return adminInfoModel.getByOpenid(openid);
}

// listDepartments
router.post('/listDepartments', async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) return res.json({ status: 'forbidden', message: localeCopy.copy_20ca49e5e7 });

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
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const id = safeString(req.body.id);
    const name = safeString(req.body.name);
    const description = safeString(req.body.description);

    if (!name) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_d8e285efa5 });
    }

    const orgId = await getCurrentOrgId();
    const [dups] = await pool.query('SELECT id FROM departments WHERE name = ? AND org_id = ?', [name, orgId]);
    if (dups.some((r) => String(r.id) !== id)) {
      return res.json({ status: 'duplicate', message: localeCopy.copy_6bd58acd2e });
    }

    if (id) {
      const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await departmentModel.update(id, name, description, nowUtc);
      res.json({ status: 'success', message: localeCopy.copy_47ce504d84 });
    } else {
      const newId = generateId();
      await departmentModel.create(newId, name, description);
      res.json({ status: 'success', id: newId, message: localeCopy.copy_3e47a3372b });
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
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: localeCopy.copy_9f09d6a2b3 });

    // Check references before deletion
    const orgId = await getCurrentOrgId();
    const [hrRef] = await pool.query('SELECT id FROM hr_info WHERE department_id = ? AND org_id = ? LIMIT 1', [id, orgId]);
    if (hrRef.length) return res.json({ status: 'in_use', message: localeCopy.copy_40bf61128c });
    const [wgRef] = await pool.query('SELECT id FROM work_groups WHERE department_id = ? AND org_id = ? LIMIT 1', [id, orgId]);
    if (wgRef.length) return res.json({ status: 'in_use', message: localeCopy.copy_c209f2986b });
    const [ruleRef] = await pool.query('SELECT id FROM rate_target_rules WHERE scorer_department_id = ? AND org_id = ? LIMIT 1', [id, orgId]);
    if (ruleRef.length) return res.json({ status: 'in_use', message: localeCopy.copy_77b4594829 });

    await departmentModel.remove(id);
    res.json({ status: 'success', message: localeCopy.copy_e7dcd6f241 });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
