const express = require('express');
const router = express.Router();
const { safeString, generateId } = require('../../utils/helpers');
const { getCurrentOrgId } = require('../../utils/orgContext');
const identityModel = require('../models/identity');
const adminInfoModel = require('../models/adminInfo');

async function ensureAdmin(openid) {
  return adminInfoModel.getByOpenid(openid);
}

// listIdentities
router.post('/listIdentities', async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) return res.json({ status: 'forbidden', message: '未登录' });

    const rows = await identityModel.getAll();
    const identities = rows.map((item) => ({
      id: safeString(item.id),
      key: safeString(item.id),
      name: safeString(item.name),
      description: safeString(item.description)
    })).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    res.json({ status: 'success', identities });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// saveIdentity
router.post('/saveIdentity', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

    const id = safeString(req.body.id);
    const name = safeString(req.body.name);
    const description = safeString(req.body.description);

    if (!name) {
      return res.json({ status: 'invalid_params', message: '请输入身份名称' });
    }

    const pool = require('../../config/db');
    const orgId = await getCurrentOrgId();
    const [dups] = await pool.query('SELECT id FROM identities WHERE name = ? AND org_id = ?', [name, orgId]);
    if (dups.some((r) => String(r.id) !== id)) {
      return res.json({ status: 'duplicate', message: '身份名称重复' });
    }

    if (id) {
      const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await identityModel.update(id, name, description, nowUtc);
      res.json({ status: 'success', message: '身份更新成功' });
    } else {
      const newId = generateId();
      await identityModel.create(newId, name, description);
      res.json({ status: 'success', id: newId, message: '身份创建成功' });
    }
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// deleteIdentity
router.post('/deleteIdentity', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供身份ID' });

    // Check references before deletion
    const pool = require('../../config/db');
    const orgId = await getCurrentOrgId();
    const [hrRef] = await pool.query('SELECT id FROM hr_info WHERE identity_id = ? AND org_id = ? LIMIT 1', [id, orgId]);
    if (hrRef.length) return res.json({ status: 'in_use', message: '该身份类别已被人事成员引用，不能删除' });
    const [scorerRef] = await pool.query('SELECT id FROM rate_target_rules WHERE scorer_identity_id = ? AND org_id = ? LIMIT 1', [id, orgId]);
    if (scorerRef.length) return res.json({ status: 'in_use', message: '该身份类别已被评分规则引用（作为评分人身份），不能删除' });
    const [targetRef] = await pool.query('SELECT id FROM rate_rule_clauses WHERE target_identity_id = ? AND org_id = ? LIMIT 1', [id, orgId]);
    if (targetRef.length) return res.json({ status: 'in_use', message: '该身份类别已被评分规则引用（作为被评分人身份），不能删除' });

    await identityModel.remove(id);
    res.json({ status: 'success', message: '身份已删除' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
