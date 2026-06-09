const express = require('express');
const router = express.Router();
const { safeString } = require('../utils/helpers');
const userInfoModel = require('../models/userInfo');

// listUserBindings
router.post('/listUserBindings', async (req, res) => {
  try {
    const data = await userInfoModel.getAll();
    res.json({ status: 'success', data });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
