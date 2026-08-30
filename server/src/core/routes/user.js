const retiredCopy = require('../../locales/zh-CN/generated/core/routes/admin');
const express = require('express');
const router = express.Router();

router.post('/listUserBindings', (req, res) => {
  return res.status(410).json({
    status: 'legacy_api_retired',
    message: retiredCopy.copy_0429e2ed3a
  });
});

module.exports = router;
