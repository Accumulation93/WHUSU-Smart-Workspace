const localeCopy = require('../../../locales/zh-CN/generated/modules/scoring/routes/activities');
const express = require('express');
const router = express.Router();
const { safeString, generateId } = require('../../../utils/helpers');
const { nowMysqlUtc } = require('../../../utils/dateTime');
const adminInfoModel = require('../../../core/models/adminInfo');
const activityModel = require('../models/scoreActivity');
const rateRuleModel = require('../models/rateRule');
const rateRuleClauseModel = require('../models/rateRuleClause');
const clauseTemplateConfigModel = require('../models/clauseTemplateConfig');
const scoreRecordModel = require('../models/scoreRecord');
const scoreAnswerModel = require('../models/scoreAnswer');
const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const pubCache = require('../utils/pubCache');
const sharedCache = require('../utils/sharedCache');

async function ensureAdmin(req) {
  if (req && Object.prototype.hasOwnProperty.call(req, 'admin')) return req.admin || null;
  return req && req.openid ? adminInfoModel.getByOpenid(req.openid) : null;
}

// listScoreActivities
router.post('/listScoreActivities', async (req, res) => {
  try {
    const admin = await ensureAdmin(req);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    function fmtDate(v) {
      if (!v) return '';
      const s = String(v);
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      if (v instanceof Date && !isNaN(v)) {
        const y = v.getFullYear();
        const m = String(v.getMonth() + 1).padStart(2, '0');
        const d = String(v.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
      }
      return s.slice(0, 10);
    }
    const data = await activityModel.getAll();
    const list = data.map((item) => ({
      id: item.id,
      name: item.name || '',
      description: item.description || '',
      startDate: fmtDate(item.start_date),
      endDate: fmtDate(item.end_date),
      isCurrent: !!item.is_current,
      participantGranularity: 'assignment',
      isPaused: !!item.is_paused,
      updatedAt: item.updated_at || null
    })).sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
    });

    res.json({
      status: 'success',
      list,
      currentActivityId: (list.find((item) => item.isCurrent) || {}).id || ''
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// saveScoreActivity
router.post('/saveScoreActivity', async (req, res) => {
  try {
    const admin = await ensureAdmin(req);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const id = safeString(req.body.id);
    const name = safeString(req.body.name);
    const description = safeString(req.body.description);
    const startDate = safeString(req.body.startDate);
    const endDate = safeString(req.body.endDate);
    const hasPausedValue = Object.prototype.hasOwnProperty.call(req.body, 'isPaused');
    const requestedPaused = req.body.isPaused === true || req.body.isPaused === 1 ? 1 : 0;
    const participantGranularity = 'assignment';

    if (!name) return res.json({ status: 'invalid_params', message: localeCopy.copy_e394895492 });
    if (startDate && endDate && startDate > endDate) {
      return res.json({ status: 'invalid_params', message: localeCopy.copy_0b091cba77 });
    }

    if (id) {
      const nowUtc = nowMysqlUtc();
      const current = await activityModel.getById(id);
      if (!current) return res.json({ status: 'not_found', message: localeCopy.copy_4f0d449737 });
      if (current && current.participant_granularity !== participantGranularity) {
        const orgId = await getCurrentOrgId();
        const [recordRows] = await pool.query(
          'SELECT 1 FROM score_records WHERE activity_id = ? AND org_id = ? LIMIT 1',
          [id, orgId]
        );
        if (recordRows.length) {
          return res.json({ status: 'conflict', message: localeCopy.copy_48f70c55c9 });
        }
      }
      await activityModel.update(id, {
        name, description, startDate: startDate || null, endDate: endDate || null,
        isCurrent: current ? !!current.is_current : false,
        isPaused: hasPausedValue ? requestedPaused : Boolean(current.is_paused),
        participantGranularity,
        updatedBy: admin.id, updatedAt: nowUtc
      });
    } else {
      const orgId = await getCurrentOrgId();
      const [existing] = await pool.query('SELECT * FROM score_activities WHERE name = ? AND org_id = ? LIMIT 1', [name, orgId]);
      if (existing.length) {
        return res.json({ status: 'duplicate', message: localeCopy.copy_8aeb0338bf });
      } else {
        const newId = generateId();
        await activityModel.create(newId, {
          name, description, startDate: startDate || null, endDate: endDate || null,
          isCurrent: false, isPaused: requestedPaused, participantGranularity, createdBy: admin.id
        });
      }
    }
    const orgId = await getCurrentOrgId();
    if (id) await pubCache.invalidate(id, orgId);
    await sharedCache.invalidatePrefix('overview_' + orgId + '_');
    res.json({ status: 'success' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// deleteScoreActivity
router.post('/deleteScoreActivity', async (req, res) => {
  try {
    const admin = await ensureAdmin(req);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: localeCopy.copy_4314b97854 });

    const orgId = await getCurrentOrgId();

    // Wrap all cascading deletes in a transaction for atomicity
    const { withTransaction } = require('../../../config/db');
    await withTransaction(async (conn) => {
      // Clean up associated rules and records
      const [rules] = await conn.query('SELECT * FROM rate_target_rules WHERE activity_id = ? AND org_id = ?', [id, orgId]);
      for (const rule of rules) {
        const [clauses] = await conn.query('SELECT * FROM rate_rule_clauses WHERE rule_id = ? AND org_id = ?', [rule.id, orgId]);
        for (const clause of clauses) {
          await conn.query('DELETE FROM clause_template_configs WHERE clause_id = ? AND org_id = ?', [clause.id, orgId]);
        }
        await conn.query('DELETE FROM rate_rule_clauses WHERE rule_id = ? AND org_id = ?', [rule.id, orgId]);
      }
      await conn.query('DELETE FROM rate_target_rules WHERE activity_id = ? AND org_id = ?', [id, orgId]);

      // Clean up score records
      const [records] = await conn.query('SELECT * FROM score_records WHERE activity_id = ? AND org_id = ?', [id, orgId]);
      for (const record of records) {
        await conn.query('DELETE FROM score_answers WHERE record_id = ? AND org_id = ?', [record.id, orgId]);
      }
      await conn.query('DELETE FROM score_records WHERE activity_id = ? AND org_id = ?', [id, orgId]);

      await conn.query('DELETE FROM score_activities WHERE id = ? AND org_id = ?', [id, orgId]);
    });

    res.json({ status: 'success' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// setCurrentScoreActivity
router.post('/setCurrentScoreActivity', async (req, res) => {
  try {
    const admin = await ensureAdmin(req);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: localeCopy.copy_4314b97854 });

    const target = await activityModel.getById(id);
    if (!target) return res.json({ status: 'not_found', message: localeCopy.copy_4f0d449737 });

    await activityModel.clearAllCurrent();
    const nowUtc = nowMysqlUtc();
    await activityModel.update(id, {
      name: target.name,
      description: target.description,
      startDate: target.start_date,
      endDate: target.end_date,
      isCurrent: true,
      participantGranularity: 'assignment',
      updatedBy: admin.id, updatedAt: nowUtc
    });
    res.json({ status: 'success' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// getCurrentScoreActivity
router.post('/getCurrentScoreActivity', async (req, res) => {
  try {
    const item = await activityModel.getCurrent();
    if (!item) return res.json({ status: 'success', activity: null });

    function fmtDate(v) {
      if (!v) return '';
      const s = String(v);
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      if (v instanceof Date && !isNaN(v)) {
        const y = v.getFullYear();
        const m = String(v.getMonth() + 1).padStart(2, '0');
        const d = String(v.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + d;
      }
      return s.slice(0, 10);
    }
    res.json({
      status: 'success',
      activity: {
        id: item.id,
        name: item.name || '',
        description: item.description || '',
        startDate: fmtDate(item.start_date),
        endDate: fmtDate(item.end_date),
        isPaused: !!item.is_paused,
        participantGranularity: 'assignment'
      }
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// 用户查看结果时使用最近一次已发布活动。它与“当前评分活动”相互独立，
// 避免活动结束后历史结果和评优名单入口随 is_current 一起消失。
router.post('/getLatestPublishedScoreActivity', async (req, res) => {
  try {
    const item = await activityModel.getLatestPublished();
    res.json({
      status: 'success',
      activity: item ? {
        id: item.id,
        name: item.name || ''
      } : null
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// toggleActivityPause
router.post('/toggleActivityPause', async (req, res) => {
  try {
    const admin = await ensureAdmin(req);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: localeCopy.copy_4314b97854 });

    const activity = await activityModel.getById(id);
    if (!activity) return res.json({ status: 'not_found', message: localeCopy.copy_4f0d449737 });

    const newPaused = activity.is_paused ? 0 : 1;
    await activityModel.togglePause(id, newPaused);

    res.json({
      status: 'success',
      isPaused: !!newPaused,
      message: newPaused ? localeCopy.copy_122bce702a : localeCopy.copy_adb9a74154
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) || localeCopy.copy_0531ed9e78 });
  }
});

module.exports = router;
