const localeCopy = require('../../../locales/zh-CN/generated/modules/scoring/routes/templates');
const express = require('express');
const router = express.Router();
const { safeString, toNumber, generateId } = require('../../../utils/helpers');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const adminInfoModel = require('../../../core/models/adminInfo');
const templateModel = require('../models/scoreTemplate');
const questionModel = require('../models/scoreQuestion');
const scoreRecordModel = require('../models/scoreRecord');
const scoreAnswerModel = require('../models/scoreAnswer');
const pool = require('../../../config/db');

async function ensureAdmin(openid) {
  return adminInfoModel.getByOpenid(openid);
}

function normalizeQuestion(item) {
  return {
    question: safeString(item.question),
    scoreLabel: safeString(item.scoreLabel),
    minValue: toNumber(item.minValue, 0),
    startValue: toNumber(item.startValue, 0),
    maxValue: toNumber(item.maxValue, 0),
    stepValue: toNumber(item.stepValue, 0.5)
  };
}

function buildTemplateConfigSignature(questions) {
  return questions
    .map((item, index) => [index + 1, item.question || '', item.scoreLabel || '',
      Number(item.minValue), Number(item.startValue), Number(item.maxValue), Number(item.stepValue)].join(':'))
    .join('|');
}

function buildQuestionStructureSignature(questions) {
  return questions
    .map((item) => [Number(item.minValue), Number(item.startValue), Number(item.maxValue), Number(item.stepValue)].join(':'))
    .join('|');
}

// listScoreTemplates
router.post('/listScoreTemplates', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const [templates, questions] = await Promise.all([
      templateModel.getAll(),
      pool.query('SELECT * FROM score_questions ORDER BY template_id, sort_order')
    ]);

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
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// saveScoreTemplate
router.post('/saveScoreTemplate', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const id = safeString(req.body.id);
    const name = safeString(req.body.name);
    const description = safeString(req.body.description);
    const questions = Array.isArray(req.body.questions) ? req.body.questions : [];

    if (!name) return res.json({ status: 'invalid_params', message: localeCopy.copy_9a51765619 });

    const normalizedQs = questions.map(normalizeQuestion).filter((item) => item.question);
    const validQs = normalizedQs.filter((item) =>
      item.question && !Number.isNaN(item.minValue) && !Number.isNaN(item.startValue) &&
      !Number.isNaN(item.maxValue) && !Number.isNaN(item.stepValue) &&
      item.stepValue > 0 && item.minValue <= item.maxValue &&
      item.startValue >= item.minValue && item.startValue <= item.maxValue
    );

    if (!validQs.length) return res.json({ status: 'invalid_params', message: localeCopy.copy_d976fb44d6 });

    let targetTemplateId = id;
    let removedRecordCount = 0;

    const [currentTemplate] = id
      ? await pool.query('SELECT * FROM score_questions WHERE template_id = ? ORDER BY sort_order', [id])
      : [[], []];

    const oldQs = currentTemplate.map((q) => ({
      question: q.question, scoreLabel: q.score_label,
      minValue: Number(q.min_value), startValue: Number(q.start_value),
      maxValue: Number(q.max_value), stepValue: Number(q.step_value)
    }));
    const oldSig = buildQuestionStructureSignature(oldQs);
    const newSig = buildQuestionStructureSignature(validQs);

    const nowUtc = new Date().toISOString().slice(0, 19).replace('T', ' ');

    if (id) {
      await templateModel.update(id, { name, description, updatedBy: admin.id, updatedAt: nowUtc });
      await questionModel.removeByTemplateId(id);
    } else {
      const [existing] = await pool.query('SELECT * FROM score_question_templates WHERE name = ? LIMIT 1', [name]);
      if (existing.length) {
        return res.json({ status: 'duplicate', message: localeCopy.copy_5f4fd990fc });
      } else {
        const newId = generateId();
        await templateModel.create(newId, { name, description, createdBy: admin.id });
        targetTemplateId = newId;
      }
    }

    // Insert questions
    for (let i = 0; i < validQs.length; i++) {
      const q = validQs[i];
      await questionModel.create(generateId(), targetTemplateId, i + 1, {
        question: q.question, scoreLabel: q.scoreLabel,
        minValue: q.minValue, startValue: q.startValue,
        maxValue: q.maxValue, stepValue: q.stepValue
      });
    }

    // If structure changed and we didn't handle above
    if (id && oldSig && oldSig !== newSig && removedRecordCount === 0) {
      const orgId = await getCurrentOrgId();
      const [records] = await pool.query('SELECT id FROM score_records WHERE rule_id IN (SELECT clause_id FROM clause_template_configs WHERE template_id = ? AND org_id = ?) AND org_id = ?', [targetTemplateId, orgId, orgId]);
      for (const r of records) {
        await scoreAnswerModel.removeByRecordId(r.id);
        await scoreRecordModel.remove(r.id);
      }
      removedRecordCount = records.length;
    }

    res.json({ status: 'success', removedRecordCount });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// deleteScoreTemplate
router.post('/deleteScoreTemplate', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: localeCopy.copy_53b7c35c3f });

    // Block deletion if template is referenced by any rule clause in current org
    const orgId = await getCurrentOrgId();
    const [currentRefs] = await pool.query(
      'SELECT COUNT(*) as cnt FROM clause_template_configs WHERE template_id = ? AND org_id = ?', [id, orgId]
    );

    if (currentRefs[0].cnt > 0) {
      return res.json({
        status: 'forbidden',
        message: localeCopy.copy_1680976116
      });
    }

    await questionModel.removeByTemplateId(id);
    await templateModel.remove(id);
    res.json({ status: 'success' });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// duplicateScoreTemplate
router.post('/duplicateScoreTemplate', async (req, res) => {
  try {
    const openid = req.openid;
    const admin = await ensureAdmin(openid);
    if (!admin) return res.json({ status: 'forbidden', message: localeCopy.copy_f048be09ae });

    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: localeCopy.copy_53b7c35c3f });

    const template = await templateModel.getById(id);
    if (!template) return res.json({ status: 'not_found', message: localeCopy.copy_785b6d700c });

    const questions = await questionModel.getByTemplateId(id);

    let name = `${template.name || localeCopy.copy_222c27a765} 副本`;
    let counter = 2;
    while (true) {
      const [existing] = await pool.query('SELECT id FROM score_question_templates WHERE name = ? LIMIT 1', [name]);
      if (!existing.length) break;
      name = `${template.name || localeCopy.copy_222c27a765} 副本${counter}`;
      counter += 1;
    }

    const newId = generateId();
    await templateModel.create(newId, {
      name, description: template.description || '', createdBy: admin.id
    });

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      await questionModel.create(generateId(), newId, i + 1, {
        question: q.question, scoreLabel: q.score_label,
        minValue: q.min_value, startValue: q.start_value,
        maxValue: q.max_value, stepValue: q.step_value
      });
    }

    res.json({ status: 'success', id: newId });
  } catch (e) {
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

module.exports = router;
