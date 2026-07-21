const express = require('express');
const router = express.Router();
const { safeString, toNumber } = require('../../utils/helpers');
const systemConfigModel = require('../models/systemConfig');
const adminInfoModel = require('../models/adminInfo');

// getSystemConfig
router.post('/getSystemConfig', async (req, res) => {
  try {
    const config = await systemConfigModel.get();
    res.json({
      status: 'success',
      config: config ? {
        timezone: config.timezone,
        currentOrganization: config.current_organization
      } : { timezone: 8, currentOrganization: null }
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) || '获取配置失败' });
  }
});

// saveSystemConfig
router.post('/saveSystemConfig', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await adminInfoModel.getByOpenid(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });
    if (req.body.currentOrganization !== undefined
      && (admin.admin_level !== 'super_admin' || admin.org_id !== '')) {
      return res.status(403).json({ status: 'permission_denied', message: '仅超级管理员可修改系统默认组织' });
    }

    const timezone = toNumber(req.body.timezone, 8);
    const currentOrganization = safeString(req.body.currentOrganization);

    await systemConfigModel.ensureExists();

    const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');

    if (req.body.timezone !== undefined) {
      await systemConfigModel.updateTimezone(timezone, nowUtc);
    }
    if (req.body.currentOrganization !== undefined) {
      await systemConfigModel.setCurrentOrganization(currentOrganization, nowUtc);
    }

    res.json({ status: 'success', message: '配置保存成功' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) || '保存配置失败' });
  }
});

module.exports = router;
