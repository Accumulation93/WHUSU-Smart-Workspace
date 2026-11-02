const localeCopy = require('../../../locales/zh-CN/generated/modules/scoring/routes/templates');
const scoringCopy = require('../../../locales/zh-CN/modules/scoring');
const { format: localeFormat } = require('../../../locales/runtime');
const express = require('express');
const router = express.Router();
const { safeString, toNumber, generateId } = require('../../../utils/helpers');
const { nowMysqlUtc } = require('../../../utils/dateTime');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const { resolveRequestAdmin: ensureAdmin } = require('../../../core/services/adminRequestContext');
const templateModel = require('../models/scoreTemplate');
const questionModel = require('../models/scoreQuestion');
const pool = require('../../../config/db');
const { requireOperation } = require('../models/scoreTemplateAuthorization');

function normalizeQuestion(item) {
  const source = item || {};
  function numberValue(key, fallback) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) return fallback;
    if (source[key] === null || String(source[key]).trim() === '') return Number.NaN;
    return Number(source[key]);
  }
  return {
    question: safeString(source.question),
    scoreLabel: safeString(source.scoreLabel),
    minValue: numberValue('minValue', 0),
    startValue: numberValue('startValue', 0),
    maxValue: numberValue('maxValue', 0),
    stepValue: numberValue('stepValue', 0.5)
  };
}

function isValidQuestion(item) {
  return !!item.question
    && Number.isFinite(item.minValue)
    && Number.isFinite(item.startValue)
    && Number.isFinite(item.maxValue)
    && Number.isFinite(item.stepValue)
    && item.stepValue > 0
    && item.minValue <= item.maxValue
    && item.startValue >= item.minValue
    && item.startValue <= item.maxValue;
}

function buildTemplateConfigSignature(questions) {
  return questions
    .map((item, index) => [index + 1, item.question || '', item.scoreLabel || '',
      Number(item.minValue), Number(item.startValue), Number(item.maxValue), Number(item.stepValue)].join(':'))
    .join('|');
}

// listScoreTemplates
router.post('/listScoreTemplates', async (req, res) => {
  try {
    if (req.unifiedAuthorization) {
      const authorized = await require('../models/scoreTemplateAuthorization').list(req.unifiedAuthorization.reference);
      const list = authorized.map(item => Array.isArray(item.questions) ? { ...item,
        questionCount: item.questions.length, configSignature: buildTemplateConfigSignature(item.questions) } : item)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN'));
      return res.json({ status: 'success', list });
    }
    const admin = await ensureAdmin(req);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });
    const orgId = await getCurrentOrgId();

    const [templates, questions] = await pool.withTransaction(async connection => {
      await require('../../../core/models/authorizationBusinessRoute').requireLegacyWrite(connection, orgId);
      return Promise.all([
      templateModel.getAll(orgId, connection),
      connection.query(
        `SELECT q.*
           FROM score_questions q
           INNER JOIN score_question_templates t ON t.id = q.template_id
          WHERE t.org_id = ?
          ORDER BY q.template_id, q.sort_order`,
        [orgId]
      )
      ]);
    });

    const questionsByTemplate = new Map();
    questions[0].forEach((q) => {
      if (!questionsByTemplate.has(q.template_id)) questionsByTemplate.set(q.template_id, []);
      questionsByTemplate.get(q.template_id).push(q);
    });

    const list = templates.map((item) => {
      const qs = questionsByTemplate.get(item.id) || [];
      const mappedQs = qs.map((q) => ({
        question: q.question || '',
        scoreLabel: q.score_label || '',
        minValue: Number(q.min_value),
        startValue: Number(q.start_value),
        maxValue: Number(q.max_value),
        stepValue: Number(q.step_value)
      }));
      return {
        id: item.id,
        name: item.name || '',
        description: item.description || '',
        questions: mappedQs,
        questionCount: mappedQs.length,
        configSignature: buildTemplateConfigSignature(mappedQs)
      };
    }).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN'));

    res.json({ status: 'success', list });
  } catch (e) {
    if (e.code === 'authorization_forbidden') return res.status(403).json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// saveScoreTemplate
router.post('/saveScoreTemplate', async (req, res) => {
  try {
    const reference = req.unifiedAuthorization?.reference;
    const admin = reference ? null : await ensureAdmin(req);
    if (!reference && !admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });
    const orgId = reference?.organizationId || await getCurrentOrgId();
    const operatorId = reference ? reference.personId : admin.id;

    const id = safeString(req.body.id);
    const name = safeString(req.body.name);
    const description = safeString(req.body.description);
    const questions = Array.isArray(req.body.questions) ? req.body.questions : [];

    if (!name) return res.json({ status: 'invalid_params', message: localeCopy.copy_9a51765619 });

    const normalizedQs = questions.map(normalizeQuestion);
    if (!normalizedQs.length || normalizedQs.some((item) => !isValidQuestion(item))) {
      return res.json({ status: 'invalid_params', message: scoringCopy.templateQuestionsInvalid });
    }

    const nowUtc = nowMysqlUtc();
    const newTemplateId = id || generateId();
    const targetTemplateId = await pool.withTransaction(async (connection) => {
      await requireOperation(connection, orgId, reference, id ? 'update' : 'create', newTemplateId);
      const [duplicates] = await connection.query(
        `SELECT id FROM score_question_templates
          WHERE org_id = ? AND name = ? AND (? = '' OR id <> ?)
          LIMIT 1 FOR UPDATE`,
        [orgId, name, id, id]
      );
      if (duplicates.length) {
        const error = new Error(localeCopy.copy_5f4fd990fc);
        error.code = 'duplicate';
        throw error;
      }

      let templateId = id;
      if (id) {
        const existing = await templateModel.getById(id, orgId, connection);
        if (!existing) {
          const error = new Error(localeCopy.copy_785b6d700c);
          error.code = 'not_found';
          throw error;
        }
        await templateModel.update(id, orgId, {
          name, description, updatedBy: operatorId, updatedAt: nowUtc
        }, connection);
        await questionModel.removeByTemplateId(id, connection);
      } else {
        templateId = newTemplateId;
        await templateModel.create(templateId, orgId, {
          name, description, createdBy: operatorId
        }, connection);
      }

      for (let i = 0; i < normalizedQs.length; i++) {
        const q = normalizedQs[i];
        await questionModel.create(generateId(), templateId, i + 1, {
          question: q.question, scoreLabel: q.scoreLabel,
          minValue: q.minValue, startValue: q.startValue,
          maxValue: q.maxValue, stepValue: q.stepValue
        }, connection);
      }
      return templateId;
    });

    // 已提交评分由自身不可变快照解释。编辑模板只影响后续评分，绝不删除历史成绩。
    res.json({ status: 'success', id: targetTemplateId, removedRecordCount: 0 });
  } catch (e) {
    if (e.code === 'authorization_forbidden') return res.status(403).json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });
    if (e && (e.code === 'duplicate' || e.code === 'ER_DUP_ENTRY' || e.code === 'not_found')) {
      const status = e.code === 'ER_DUP_ENTRY' ? 'duplicate' : e.code;
      return res.json({
        status,
        message: status === 'duplicate' ? localeCopy.copy_5f4fd990fc : safeString(e.message)
      });
    }
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// deleteScoreTemplate
router.post('/deleteScoreTemplate', async (req, res) => {
  try {
    const reference = req.unifiedAuthorization?.reference;
    if (!reference && !await ensureAdmin(req)) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });
    const orgId = reference?.organizationId || await getCurrentOrgId();

    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: localeCopy.copy_53b7c35c3f });

    const outcome = await pool.withTransaction(async (connection) => {
      await requireOperation(connection, orgId, reference, 'delete', id);
      const [templateRows] = await connection.query(
        'SELECT id FROM score_question_templates WHERE id = ? AND org_id = ? FOR UPDATE',
        [id, orgId]
      );
      if (!templateRows[0]) return { status: 'not_found' };
      const [currentRefs] = await connection.query(
        `SELECT
           (SELECT COUNT(*) FROM clause_template_configs
             WHERE template_id = ? AND org_id = ?)
           +
           (SELECT COUNT(*) FROM score_template_order template_order
             INNER JOIN score_activities activity ON activity.id = template_order.activity_id
            WHERE template_order.template_id = ? AND activity.org_id = ?) AS cnt`,
        [id, orgId, id, orgId]
      );
      if (Number(currentRefs[0] && currentRefs[0].cnt || 0) > 0) {
        return { status: 'referenced' };
      }
      await questionModel.removeByTemplateId(id, connection);
      const removed = await templateModel.remove(id, orgId, connection);
      return { status: removed ? 'success' : 'not_found' };
    });
    if (outcome.status === 'referenced') {
      return res.json({ status: 'forbidden', message: localeCopy.copy_1680976116 });
    }
    if (outcome.status === 'not_found') {
      return res.json({ status: 'not_found', message: localeCopy.copy_785b6d700c });
    }
    res.json({ status: 'success' });
  } catch (e) {
    if (e.code === 'authorization_forbidden') return res.status(403).json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// duplicateScoreTemplate
router.post('/duplicateScoreTemplate', async (req, res) => {
  try {
    const reference = req.unifiedAuthorization?.reference;
    const admin = reference ? null : await ensureAdmin(req);
    if (!reference && !admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });
    const orgId = reference?.organizationId || await getCurrentOrgId();
    const operatorId = reference ? reference.personId : admin.id;

    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: localeCopy.copy_53b7c35c3f });

    const duplicateId = generateId();
    const newId = await pool.withTransaction(async (connection) => {
      await requireOperation(connection, orgId, reference, 'create', duplicateId, id);
      const template = await templateModel.getById(id, orgId, connection);
      if (!template) {
        const error = new Error(localeCopy.copy_785b6d700c);
        error.code = 'not_found';
        throw error;
      }
      const questions = await questionModel.getByTemplateId(id, connection);

      const sourceName = template.name || localeCopy.copy_222c27a765;
      let name = localeFormat(scoringCopy.templateDuplicateName, [sourceName]);
      let counter = 2;
      while (true) {
        const [existing] = await connection.query(
          'SELECT id FROM score_question_templates WHERE org_id = ? AND name = ? LIMIT 1 FOR UPDATE',
          [orgId, name]
        );
        if (!existing.length) break;
        name = localeFormat(scoringCopy.templateDuplicateNumberedName, [sourceName, counter]);
        counter += 1;
      }

      await templateModel.create(duplicateId, orgId, {
        name, description: template.description || '', createdBy: operatorId
      }, connection);
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        await questionModel.create(generateId(), duplicateId, i + 1, {
          question: q.question, scoreLabel: q.score_label,
          minValue: q.min_value, startValue: q.start_value,
          maxValue: q.max_value, stepValue: q.step_value
        }, connection);
      }
      return duplicateId;
    });

    res.json({ status: 'success', id: newId });
  } catch (e) {
    if (e.code === 'authorization_forbidden') return res.status(403).json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });
    if (e && e.code === 'not_found') {
      return res.json({ status: 'not_found', message: safeString(e.message) });
    }
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
