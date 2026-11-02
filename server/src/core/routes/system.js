const localeCopy = require('../../locales/zh-CN/generated/core/routes/system');
const timeCopy = require('../../locales/zh-CN/core/time');
const express = require('express');
const router = express.Router();
const { safeString } = require('../../utils/helpers');
const systemConfigModel = require('../models/systemConfig');
const { resolveRequestAdmin } = require('../services/adminRequestContext');
const { referenceFromRequest } = require('../services/authorizationReference');
const authorizationBusinessRoute = require('../models/authorizationBusinessRoute');
const { nowMysqlUtc, toIsoUtc, MIN_TIMEZONE_OFFSET, MAX_TIMEZONE_OFFSET } = require('../../utils/dateTime');

function publicTimeReviewState(state) {
  return {
    historicalTimeReviewRequired: Boolean(state && state.reviewRequired),
    timeReviewConfigVersion: state && state.reviewVersion ? toIsoUtc(state.reviewVersion) || '' : '',
    timeCutoverStatus: String(state && state.cutoverStatus || 'missing'),
    timeMigrationKey: String(state && state.migrationKey || '20260823190000'),
    timeReviewRecordCount: Number(state && state.reviewRecordCount || 0),
    timeVerifiedRecordCount: Number(state && state.verifiedRecordCount || 0),
    timeUnresolvedReviewCount: Number(state && state.unresolvedReviewCount || 0),
    timePresentationMappedReviewCount: Number(state && state.presentationMappedReviewCount || 0),
    timePresentationMappingVersion: String(state && state.presentationMappingVersion || '')
  };
}

function parseTimezoneOffset(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < MIN_TIMEZONE_OFFSET || parsed > MAX_TIMEZONE_OFFSET) return null;
  return parsed;
}

router.post('/getTimeConfig', async (req, res) => {
  try {
    const [config, reviewState] = await Promise.all([
      systemConfigModel.get(),
      systemConfigModel.getHistoricalTimeReviewState()
    ]);
    return res.json({
      status: 'success',
      systemTimezoneOffset: config ? config.timezone : 8,
      timezoneConfigVersion: config ? String(config.timezone_config_version || 1) : '1',
      ...publicTimeReviewState(reviewState)
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: localeCopy.copy_a7e2b86629 });
  }
});

// getSystemConfig
router.post('/getSystemConfig', async (req, res) => {
  try {
    const reference = referenceFromRequest(req);
    const enforced = reference && await authorizationBusinessRoute.isEnforced('/getSystemConfig', reference.organizationId);
    const [config, reviewState] = await Promise.all([
      enforced ? systemConfigModel.authorizedConfig(reference, null) : systemConfigModel.get(),
      systemConfigModel.getHistoricalTimeReviewState()
    ]);
    res.json({
      status: 'success',
      systemTimezoneOffset: config ? config.timezone : 8,
      timezoneConfigVersion: config ? String(config.timezone_config_version || 1) : '1',
      ...publicTimeReviewState(reviewState),
      config: config ? {
        timezone: config.timezone,
        timezoneConfigVersion: String(config.timezone_config_version || 1),
        ...publicTimeReviewState(reviewState),
        currentOrganization: config.current_organization,
        ...(enforced ? { canUpdateTimezone: config.can_update_timezone === true } : {})
      } : {
        timezone: 8,
        ...publicTimeReviewState(reviewState),
        currentOrganization: null
      }
    });
  } catch (e) {
    if (e.code === 'authorization_forbidden') return res.status(403).json({ status: 'permission_denied', message: localeCopy.copy_f048be09ae });
    res.json({ status: 'error', message: safeString(e.message) || localeCopy.copy_a7e2b86629 });
  }
});

// saveSystemConfig
router.post('/saveSystemConfig', async (req, res) => {
  try {
    const admin = await resolveRequestAdmin(req);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });
    if (req.body.currentOrganization !== undefined
      && (admin.admin_level !== 'super_admin' || admin.org_id !== '')) {
      return res.status(403).json({ status: 'permission_denied', message: localeCopy.copy_6809d8bae7 });
    }

    const timezone = req.body.timezone === undefined ? null : parseTimezoneOffset(req.body.timezone);
    if (req.body.timezone !== undefined && timezone === null) {
      return res.status(400).json({ status: 'invalid_timezone', message: timeCopy.invalidTimezoneOffset });
    }
    const currentOrganization = safeString(req.body.currentOrganization);

    const reference = referenceFromRequest(req);
    const input = {};
    if (req.body.timezone !== undefined) input.timezone = timezone;
    if (req.body.currentOrganization !== undefined) input.currentOrganization = currentOrganization;
    if (reference && await authorizationBusinessRoute.isEnforced('/saveSystemConfig', reference.organizationId)) {
      const config = await systemConfigModel.authorizedConfig(reference, input, nowMysqlUtc());
      return res.json({ status: 'success', message: localeCopy.copy_c1add6c36e,
        systemTimezoneOffset: config.timezone, timezoneConfigVersion: String(config.timezone_config_version || 1) });
    }

    const config = await systemConfigModel.saveLegacyConfig(input, nowMysqlUtc(), reference && reference.organizationId);
    res.json({
      status: 'success',
      message: localeCopy.copy_c1add6c36e,
      systemTimezoneOffset: config ? config.timezone : timezone,
      timezoneConfigVersion: config ? String(config.timezone_config_version || 1) : '1'
    });
  } catch (e) {
    if (e.code === 'authorization_forbidden' || e.code === 'authorization_stale_reference') {
      return res.status(403).json({ status: 'permission_denied', message: localeCopy.copy_f048be09ae });
    }
    res.json({ status: 'error', message: safeString(e.message) || localeCopy.copy_2b79f10002 });
  }
});

module.exports = router;
