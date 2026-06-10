const express = require('express');
const router = express.Router();
const { safeString } = require('../utils/helpers');
const userInfoModel = require('../models/userInfo');
const adminInfoModel = require('../models/adminInfo');

async function ensureAdmin(openid) {
  const admin = await adminInfoModel.getByOpenid(openid);
  return admin;
}

// listUserBindings — admin only
router.post('/listUserBindings', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });

    const data = await userInfoModel.getAll();
    res.json({ status: 'success', data });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
