const localeCopy = require('../../../locales/zh-CN/generated/modules/scoring/models/scoreRecord');
const { format: localeFormat } = require('../../../locales/runtime');
const pool = require('../../../config/db');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const { nowMysqlUtc } = require('../../../utils/dateTime');
const CONDITION_COLUMNS = Object.freeze({
  activityId: 'activity_id',
  ruleId: 'rule_id',
  scorerId: 'scorer_id',
  targetId: 'target_id'
});

async function getAll() {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query('SELECT * FROM score_records WHERE org_id = ? ORDER BY submitted_at DESC', [orgId]);
  return rows;
}

async function getByActivity(activityId) {
  const orgId = await getCurrentOrgId();
  // 不再 ORDER BY：结果集会带三份 JSON 快照，排序会在 MySQL 侧对大字段做 filesort，
  // 超过会话 15 秒语句上限就会被中断（线上表现为“评分记录加载失败”）。
  // 需要在页面上按提交时间排序的调用方，在拿到行之后自行按 submitted_at 排序。
  const [rows] = await pool.query(
    'SELECT * FROM score_records WHERE activity_id = ? AND org_id = ?',
    [activityId, orgId]
  );
  return rows;
}

async function getById(id) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query('SELECT * FROM score_records WHERE id = ? AND org_id = ?', [id, orgId]);
  return rows[0] || null;
}

async function getByScorerTarget(scorerId, targetId, activityId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    'SELECT * FROM score_records WHERE scorer_id = ? AND target_id = ? AND activity_id = ? AND org_id = ? ORDER BY submitted_at DESC',
    [scorerId, targetId, activityId, orgId]
  );
  return rows;
}

async function getBySubjects(scorerSubjectKey, targetSubjectKey, activityId) {
  const orgId = await getCurrentOrgId();
  const [rows] = await pool.query(
    `SELECT * FROM score_records
      WHERE scorer_subject_key = ? AND target_subject_key = ?
        AND activity_id = ? AND org_id = ?
      ORDER BY submitted_at DESC`,
    [scorerSubjectKey, targetSubjectKey, activityId, orgId]
  );
  return rows;
}

async function getByScorer(scorerId, activityId) {
  const orgId = await getCurrentOrgId();
  let sql = 'SELECT * FROM score_records WHERE scorer_id = ? AND org_id = ?';
  const params = [scorerId, orgId];
  if (activityId) { sql += ' AND activity_id = ?'; params.push(activityId); }
  const [rows] = await pool.query(sql + ' ORDER BY submitted_at DESC', params);
  return rows;
}

async function getByScorerSubject(scorerSubjectKey, activityId) {
  const orgId = await getCurrentOrgId();
  let sql = 'SELECT * FROM score_records WHERE scorer_subject_key = ? AND org_id = ?';
  const params = [scorerSubjectKey, orgId];
  if (activityId) { sql += ' AND activity_id = ?'; params.push(activityId); }
  const [rows] = await pool.query(sql + ' ORDER BY submitted_at DESC', params);
  return rows;
}

/**
 * 只看某个被评分人的评分记录：结果页“点开一位同学”不再需要把整个活动的记录与答案读出来。
 * 历史记录可能只有旧 hr 标识（target_id）或自然人（target_person_id），所以三者都要匹配。
 */
async function getByTarget(activityId, targetId) {
  const orgId = await getCurrentOrgId();
  const key = String(targetId || '').trim();
  const [rows] = await pool.query(
    `SELECT id, activity_id, rule_id, scorer_id, scorer_person_id, scorer_assignment_id,
            target_id, target_person_id, target_assignment_id, template_config_signature,
            submitted_at, calculation_context_snapshot
       FROM score_records
      WHERE activity_id = ? AND org_id = ?
        AND (target_assignment_id = ? OR target_id = ? OR target_person_id = ?)`,
    [activityId, orgId, key, key, key]
  );
  return rows;
}

async function getByScorerParticipant(participant, activityId) {
  const orgId = await getCurrentOrgId();
  const assignmentId = String(participant && (participant.assignment_id || participant.assignmentId || participant.id) || '');
  const legacyHrId = String(participant && (participant.legacy_hr_id || participant.legacyHrId) || '');
  if (!assignmentId) return getByScorer(legacyHrId, activityId);
  const [rows] = await pool.query(
    `SELECT * FROM score_records
      WHERE org_id = ? AND activity_id = ?
        AND (scorer_assignment_id = ? OR scorer_subject_key = ?)
      ORDER BY submitted_at DESC`,
    [orgId, activityId, assignmentId, 'assignment:' + assignmentId]
  );
  return rows;
}

// 待办仅使用不可变岗位关联，不读取大体积答案和计算快照。
async function getCompletionTargets(participant, activityId) {
  const orgId = await getCurrentOrgId();
  const assignmentId = String(participant && (participant.assignment_id || participant.assignmentId || participant.id) || '');
  if (!assignmentId) return [];
  const [rows] = await pool.query(
    `SELECT target_assignment_id, target_subject_key FROM score_records
      WHERE org_id = ? AND activity_id = ? AND scorer_assignment_id = ?
     UNION
     SELECT target_assignment_id, target_subject_key FROM score_records
      WHERE org_id = ? AND activity_id = ? AND scorer_subject_key = ?`,
    [orgId, activityId, assignmentId, orgId, activityId, 'assignment:' + assignmentId]
  );
  return rows;
}

async function getByParticipantPair(scorer, target, activityId) {
  const orgId = await getCurrentOrgId();
  const scorerAssignmentId = String(scorer && (scorer.assignment_id || scorer.assignmentId || scorer.id) || '');
  const targetAssignmentId = String(target && (target.assignment_id || target.assignmentId || target.id) || '');
  const scorerLegacyHrId = String(scorer && (scorer.legacy_hr_id || scorer.legacyHrId) || '');
  const targetLegacyHrId = String(target && (target.legacy_hr_id || target.legacyHrId) || '');
  if (!scorerAssignmentId || !targetAssignmentId) {
    return getByScorerTarget(scorerLegacyHrId, targetLegacyHrId, activityId);
  }
  const [rows] = await pool.query(
    `SELECT * FROM score_records
      WHERE org_id = ? AND activity_id = ?
        AND (scorer_assignment_id = ? OR scorer_subject_key = ?)
        AND (target_assignment_id = ? OR target_subject_key = ?)
      ORDER BY submitted_at DESC`,
    [
      orgId, activityId,
      scorerAssignmentId, 'assignment:' + scorerAssignmentId,
      targetAssignmentId, 'assignment:' + targetAssignmentId
    ]
  );
  return rows;
}

async function query(conditions = {}) {
  const orgId = await getCurrentOrgId();
  let sql = 'SELECT * FROM score_records WHERE 1=1 AND org_id = ?';
  const params = [orgId];
  for (const [key, value] of Object.entries(conditions)) {
    if (value !== undefined && value !== null) {
      const dbKey = CONDITION_COLUMNS[key];
      if (!dbKey) throw new Error(localeFormat(localeCopy.copy_8102ba41f6, [key]));
      sql += ` AND ${dbKey} = ?`;
      params.push(value);
    }
  }
  const [rows] = await pool.query(sql + ' ORDER BY submitted_at DESC', params);
  return rows;
}

async function create(id, data) {
  const {
    activityId, ruleId, scorerId, scorerPersonId, scorerAssignmentId, scorerContextSnapshot, scorerSubjectKey,
    targetId, targetPersonId, targetAssignmentId, targetContextSnapshot, targetSubjectKey,
    templateConfigSignature, submittedAt
  } = data;
  const orgId = await getCurrentOrgId();
  const storedSubmittedAt = submittedAt || nowMysqlUtc();
  await pool.query(
    `INSERT INTO score_records
       (id, activity_id, rule_id, scorer_id, scorer_person_id, scorer_assignment_id,
        scorer_context_snapshot, scorer_subject_key, target_id, target_person_id, target_assignment_id,
        target_context_snapshot, target_subject_key, template_config_signature,
        submitted_at, revision_number, updated_at, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, activityId, ruleId, scorerId, scorerPersonId || null, scorerAssignmentId || null,
      scorerContextSnapshot ? JSON.stringify(scorerContextSnapshot) : null,
      scorerSubjectKey, targetId, targetPersonId || null, targetAssignmentId || null,
      targetContextSnapshot ? JSON.stringify(targetContextSnapshot) : null,
      targetSubjectKey, templateConfigSignature || '', storedSubmittedAt, 1, storedSubmittedAt, orgId
    ]
  );
}

async function remove(id) {
  const orgId = await getCurrentOrgId();
  await pool.query('DELETE FROM score_records WHERE id = ? AND org_id = ?', [id, orgId]);
}

module.exports = {
  getAll,
  getByActivity,
  getById,
  getByTarget,
  getByScorerTarget,
  getBySubjects,
  getByScorer,
  getByScorerSubject,
  getByScorerParticipant,
  getCompletionTargets,
  getByParticipantPair,
  query,
  create,
  remove
};
