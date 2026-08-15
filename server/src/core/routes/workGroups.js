const localeCopy = require('../../locales/zh-CN/generated/core/routes/workGroups');
const express = require('express');
const router = express.Router();
const { safeString, generateId } = require('../../utils/helpers');
const { getCurrentOrgId } = require('../../utils/orgContext');
const workGroupModel = require('../models/workGroup');
const departmentModel = require('../models/department');
const adminInfoModel = require('../models/adminInfo');
const pool = require('../../config/db');

async function ensureAdmin(openid) {
  return adminInfoModel.getByOpenid(openid);
}

// listWorkGroups
router.post('/listWorkGroups', async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) return res.json({ status: 'forbidden', message: localeCopy.copy_20ca49e5e7 });

    const departments = await departmentModel.getAll();
    const departmentsById = new Map(departments.map((d) => [d.id, safeString(d.name)]));

    const rows = await workGroupModel.getAll();
    const workGroups = rows.map((item) => ({
      id: safeString(item.id),
      name: safeString(item.name),
      departmentId: safeString(item.department_id),
      departmentName: safeString(departmentsById.get(safeString(item.department_id)) || item.department_name),
      description: safeString(item.description)
    })).sort((a, b) => {
      const dept = (a.departmentName || a.departmentId).localeCompare(b.departmentName || b.departmentId, 'zh-CN');
      return dept || a.name.localeCompare(b.name, 'zh-CN');
    });

    res.json({ status: 'success', workGroups });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// saveWorkGroup
router.post('/saveWorkGroup', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const id = safeString(req.body.id);
    const name = safeString(req.body.name);
    const departmentId = safeString(req.body.departmentId);
    const description = safeString(req.body.description);

    if (!name) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_52f38ea0cf });
    }
    if (!departmentId) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_502fd5f067 });
    }

    const orgId = await getCurrentOrgId();
    const [dups] = await pool.query(
      'SELECT id FROM work_groups WHERE department_id = ? AND name = ? AND org_id = ?',
      [departmentId, name, orgId]
    );
    if (dups.some((r) => String(r.id) !== id)) {
      return res.json({ status: 'duplicate', message: localeCopy.copy_a7a8b23213 });
    }

    if (id) {
      const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await workGroupModel.update(id, name, departmentId, description, nowUtc);
      res.json({ status: 'success', message: localeCopy.copy_4fdb08add2 });
    } else {
      const newId = generateId();
      await workGroupModel.create(newId, name, departmentId, description);
      res.json({ status: 'success', id: newId, message: localeCopy.copy_312debb693 });
    }
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// deleteWorkGroup
router.post('/deleteWorkGroup', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: localeCopy.copy_c4f6a0088b });

    // Check references before deletion
    const orgId = await getCurrentOrgId();
    const [hrRef] = await pool.query('SELECT id FROM hr_info WHERE work_group_id = ? AND org_id = ? LIMIT 1', [id, orgId]);
    if (hrRef.length) return res.json({ status: 'in_use', message: localeCopy.copy_6664216a6e });

    await workGroupModel.remove(id);
    res.json({ status: 'success', message: localeCopy.copy_1d828c61a6 });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
