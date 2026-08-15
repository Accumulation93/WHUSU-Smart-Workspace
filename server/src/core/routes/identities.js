const localeCopy = require('../../locales/zh-CN/generated/core/routes/identities');
const express = require('express');
const router = express.Router();
const { safeString, generateId } = require('../../utils/helpers');
const { getCurrentOrgId } = require('../../utils/orgContext');
const identityModel = require('../models/identity');
const adminInfoModel = require('../models/adminInfo');
const pool = require('../../config/db');

async function ensureAdmin(openid) {
  return adminInfoModel.getByOpenid(openid);
}

// listIdentities
router.post('/listIdentities', async (req, res) => {
  try {
    const openid = req.openid;
    if (!openid) return res.json({ status: 'forbidden', message: localeCopy.copy_20ca49e5e7 });

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
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const id = safeString(req.body.id);
    const name = safeString(req.body.name);
    const description = safeString(req.body.description);

    if (!name) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_268f818f6f });
    }

    const orgId = await getCurrentOrgId();
    const [dups] = await pool.query('SELECT id FROM identities WHERE name = ? AND org_id = ?', [name, orgId]);
    if (dups.some((r) => String(r.id) !== id)) {
      return res.json({ status: 'duplicate', message: localeCopy.copy_f325d1673b });
    }

    if (id) {
      const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await identityModel.update(id, name, description, nowUtc);
      res.json({ status: 'success', message: localeCopy.copy_4fb370f421 });
    } else {
      const newId = generateId();
      await identityModel.create(newId, name, description);
      res.json({ status: 'success', id: newId, message: localeCopy.copy_bbea341d01 });
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
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: localeCopy.copy_10d3269bb4 });

    // Check references before deletion
    const orgId = await getCurrentOrgId();
    const [hrRef] = await pool.query('SELECT id FROM hr_info WHERE identity_id = ? AND org_id = ? LIMIT 1', [id, orgId]);
    if (hrRef.length) return res.json({ status: 'in_use', message: localeCopy.copy_49f1c93054 });
    const [scorerRef] = await pool.query('SELECT id FROM rate_target_rules WHERE scorer_identity_id = ? AND org_id = ? LIMIT 1', [id, orgId]);
    if (scorerRef.length) return res.json({ status: 'in_use', message: localeCopy.copy_7d27c30831 });
    const [targetRef] = await pool.query('SELECT id FROM rate_rule_clauses WHERE target_identity_id = ? AND org_id = ? LIMIT 1', [id, orgId]);
    if (targetRef.length) return res.json({ status: 'in_use', message: localeCopy.copy_20bec31d0c });

    await identityModel.remove(id);
    res.json({ status: 'success', message: localeCopy.copy_c2fabccf92 });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
