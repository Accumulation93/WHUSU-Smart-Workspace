const express = require('express');
const router = express.Router();
const { safeString, generateId } = require('../../../utils/helpers');
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

async function ensureAdmin(openid) {
  return adminInfoModel.getByOpenid(openid);
}

// listScoreActivities
router.post('/listScoreActivities', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });

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
      participantGranularity: item.participant_granularity || 'person',
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
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });

    const id = safeString(req.body.id);
    const name = safeString(req.body.name);
    const description = safeString(req.body.description);
    const startDate = safeString(req.body.startDate);
    const endDate = safeString(req.body.endDate);
    const hasPausedValue = Object.prototype.hasOwnProperty.call(req.body, 'isPaused');
    const requestedPaused = req.body.isPaused === true || req.body.isPaused === 1 ? 1 : 0;
    const participantGranularity = safeString(req.body.participantGranularity || 'person');

    if (!name) return res.json({ status: 'invalid_params', message: '请填写评分活动名称' });
    if (!['person', 'assignment'].includes(participantGranularity)) {
      return res.json({ status: 'invalid_params', message: '请重新选择评分对象' });
    }
    if (startDate && endDate && startDate > endDate) {
      return res.json({ status: 'invalid_params', message: '请将结束时间设在开始时间之后' });
    }

    if (id) {
      const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const current = await activityModel.getById(id);
      if (!current) return res.json({ status: 'not_found', message: '请刷新评分活动后重试' });
      if (current && current.participant_granularity !== participantGranularity) {
        const orgId = await getCurrentOrgId();
        const [recordRows] = await pool.query(
          'SELECT 1 FROM score_records WHERE activity_id = ? AND org_id = ? LIMIT 1',
          [id, orgId]
        );
        if (recordRows.length) {
          return res.json({ status: 'conflict', message: '该活动已有评分记录，如需调整评分对象，请新建活动' });
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
        return res.json({ status: 'duplicate', message: '请使用其他评分活动名称' });
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
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });

    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请重新选择评分活动' });

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
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });

    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请重新选择评分活动' });

    const target = await activityModel.getById(id);
    if (!target) return res.json({ status: 'not_found', message: '请刷新评分活动后重试' });

    await activityModel.clearAllCurrent();
    const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await activityModel.update(id, {
      name: target.name,
      description: target.description,
      startDate: target.start_date,
      endDate: target.end_date,
      isCurrent: true,
      participantGranularity: target.participant_granularity || 'person',
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
        participantGranularity: item.participant_granularity || 'person'
      }
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// toggleActivityPause
router.post('/toggleActivityPause', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: '请使用管理员身份' });

    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请重新选择评分活动' });

    const activity = await activityModel.getById(id);
    if (!activity) return res.json({ status: 'not_found', message: '请刷新评分活动后重试' });

    const newPaused = activity.is_paused ? 0 : 1;
    await activityModel.togglePause(id, newPaused);

    res.json({
      status: 'success',
      isPaused: !!newPaused,
      message: newPaused ? '活动已暂停' : '活动已恢复'
    });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) || '未完成，请重试' });
  }
});

module.exports = router;
