const express = require('express');
const router = express.Router();
const { safeString, toNumber, roundScore, generateId, buildNameMap } = require('../utils/helpers');
const adminInfoModel = require('../models/adminInfo');
const userInfoModel = require('../models/userInfo');
const publicationModel = require('../models/resultPublication');
const viewPermModel = require('../models/resultViewPermission');
const meritPermModel = require('../models/meritListPermission');
const designationModel = require('../models/meritListDesignation');
const pubGradeBandModel = require('../models/pubGradeBand');
const hrInfoModel = require('../models/hrInfo');
const departmentModel = require('../models/department');
const identityModel = require('../models/identity');
const workGroupModel = require('../models/workGroup');
const activityModel = require('../models/scoreActivity');
const pool = require('../config/db');
const { getCurrentOrgId } = require('../utils/orgContext');

const VALID_SCOPES = ['own_results', 'same_department_identity', 'same_department_all', 'same_work_group_identity', 'same_work_group_all', 'all_people'];
const IDENTITY_REQUIRED_SCOPES = ['same_department_identity', 'same_work_group_identity'];
const VALID_DISPLAY_MODES = ['score', 'grade'];

/**
 * Apply grade bands to a numeric score. Returns the first matching grade name,
 * or '未评级' if no band matches. Bands must be sorted by sort_order ascending.
 */
function applyGradeBands(score, bands) {
  if (!Array.isArray(bands) || !bands.length) return '未评级';
  for (const band of bands) {
    const minScore = Number(band.min_score != null ? band.min_score : band.minScore);
    const maxScore = Number(band.max_score != null ? band.max_score : band.maxScore);
    if (!Number.isFinite(minScore) || !Number.isFinite(maxScore)) continue;
    if (score >= minScore && score <= maxScore) {
      return band.grade_name || band.gradeName || '';
    }
  }
  return '未评级';
}

async function ensureAdmin(openid) { return adminInfoModel.getByOpenid(openid); }

async function fetchOrgLookups() {
  const [departments, identities, workGroups] = await Promise.all([
    departmentModel.getAll(), identityModel.getAll(), workGroupModel.getAll()
  ]);
  return { departmentsById: buildNameMap(departments), identitiesById: buildNameMap(identities), workGroupsById: buildNameMap(workGroups) };
}

// ─── getResultPublication ───
router.post('/getResultPublication', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });
    const activityId = safeString(req.body.activityId);
    if (!activityId) return res.json({ status: 'invalid_params', message: '请提供评分活动ID' });

    const publication = await publicationModel.getByActivity(activityId);
    if (!publication) {
      return res.json({ status: 'success', publication: null, viewRules: [], meritRules: [], meritListDesignations: [] });
    }

    const orgId = await getCurrentOrgId();
    const pubId = publication.id;

    // Query new tables
    const [viewRuleRows] = await pool.query(
      'SELECT * FROM pub_view_rules WHERE publication_id = ? AND org_id = ?', [pubId, orgId]
    );
    const [meritRuleRows] = await pool.query(
      'SELECT * FROM pub_merit_rules WHERE publication_id = ? AND org_id = ?', [pubId, orgId]
    );
    const [designationRows] = await pool.query(
      'SELECT * FROM merit_list_designations WHERE publication_id = ? AND org_id = ?', [pubId, orgId]
    );

    // Fetch clauses
    const viewClausesMap = new Map();
    if (viewRuleRows.length > 0) {
      const ids = viewRuleRows.map(r => r.id);
      const ph = ids.map(() => '?').join(',');
      const [clauses] = await pool.query(`SELECT * FROM pub_view_rule_clauses WHERE rule_id IN (${ph}) ORDER BY sort_order ASC`, ids);
      clauses.forEach(c => {
        if (!viewClausesMap.has(c.rule_id)) viewClausesMap.set(c.rule_id, []);
        viewClausesMap.get(c.rule_id).push(c);
      });
    }

    const meritClausesMap = new Map();
    if (meritRuleRows.length > 0) {
      const ids = meritRuleRows.map(r => r.id);
      const ph = ids.map(() => '?').join(',');
      const [clauses] = await pool.query(`SELECT * FROM pub_merit_rule_clauses WHERE rule_id IN (${ph}) ORDER BY sort_order ASC`, ids);
      clauses.forEach(c => {
        if (!meritClausesMap.has(c.rule_id)) meritClausesMap.set(c.rule_id, []);
        meritClausesMap.get(c.rule_id).push(c);
      });
    }

    const lookups = await fetchOrgLookups();
    const scopeLabelMap = {
      own_results: '仅查看自己的评分结果',
      same_department_identity: '查看同部门内指定身份的成员结果', same_department_all: '查看同部门内所有成员的结果',
      same_work_group_identity: '查看同职能组内指定身份的成员结果', same_work_group_all: '查看同职能组内所有成员的结果',
      all_people: '查看全部成员的结果',
      identity_only: '指定身份成员（不限部门）'
    };

    // Load grade bands for all view clauses in one batch (per-clause level)
    const gradeBandsByClause = new Map();
    const allClauseIds = [];
    for (const clauses of viewClausesMap.values()) {
      for (const c of clauses) allClauseIds.push(c.id);
    }
    if (allClauseIds.length > 0) {
      const ph = allClauseIds.map(() => '?').join(',');
      try {
        const [allGradeBands] = await pool.query(
          `SELECT * FROM pub_grade_bands WHERE clause_id IN (${ph}) AND org_id = ? ORDER BY clause_id, sort_order ASC`,
          [...allClauseIds, orgId]
        );
        allGradeBands.forEach(gb => {
          if (!gradeBandsByClause.has(gb.clause_id)) gradeBandsByClause.set(gb.clause_id, []);
          gradeBandsByClause.get(gb.clause_id).push({
            id: gb.id, clauseId: gb.clause_id,
            minScore: Number(gb.min_score), maxScore: Number(gb.max_score),
            gradeName: safeString(gb.grade_name), sortOrder: gb.sort_order
          });
        });
      } catch (e) {
        // Table may not exist yet — grade bands will be empty
        req.logger && req.logger.warn('Failed to load grade bands', { error: e.message });
      }
    }

    const enrichedViewRules = viewRuleRows.map(r => {
      const clauses = (viewClausesMap.get(r.id) || []).map(c => ({
        id: c.id, ruleId: c.rule_id, scopeType: c.scope_type,
        scopeLabel: scopeLabelMap[c.scope_type] || c.scope_type,
        targetIdentityId: c.target_identity_id || '',
        targetIdentity: lookups.identitiesById.get(safeString(c.target_identity_id || '')) || '',
        displayMode: safeString(c.display_mode) || 'score',
        gradeBands: gradeBandsByClause.get(c.id) || [],
        sortOrder: c.sort_order
      }));
      return {
        id: r.id, publicationId: r.publication_id,
        granteeDepartmentId: r.grantee_department_id,
        granteeDepartment: lookups.departmentsById.get(safeString(r.grantee_department_id)) || '',
        granteeIdentityId: r.grantee_identity_id,
        granteeIdentity: lookups.identitiesById.get(safeString(r.grantee_identity_id)) || '',
        clauseCount: clauses.length, clauses
      };
    });

    const enrichedMeritRules = meritRuleRows.map(r => {
      const clauses = (meritClausesMap.get(r.id) || []).map(c => ({
        id: c.id, ruleId: c.rule_id, scopeType: c.scope_type,
        scopeLabel: scopeLabelMap[c.scope_type] || c.scope_type,
        targetIdentityId: c.target_identity_id || '',
        targetIdentity: lookups.identitiesById.get(safeString(c.target_identity_id || '')) || '',
        quotaLimit: c.quota_limit || 0, requireExactQuota: (c.require_exact_quota === 1),
        sortOrder: c.sort_order
      }));
      return {
        id: r.id, publicationId: r.publication_id,
        granteeDepartmentId: r.grantee_department_id,
        granteeDepartment: lookups.departmentsById.get(safeString(r.grantee_department_id)) || '',
        granteeIdentityId: r.grantee_identity_id,
        granteeIdentity: lookups.identitiesById.get(safeString(r.grantee_identity_id)) || '',
        clauseCount: clauses.length, clauses
      };
    });

    // Enrich designations
    const enrichedDesignations = [];
    for (const d of designationRows) {
      const hr = await hrInfoModel.getById(d.target_hr_id);
      if (!hr) {
        try { await pool.query('DELETE FROM merit_list_designations WHERE id = ?', [d.id]); } catch (e) {}
        continue;
      }
      enrichedDesignations.push({
        id: d.id, publicationId: d.publication_id, clauseId: d.clause_id || '',
        targetHrId: d.target_hr_id, targetName: safeString(hr.name),
        targetStudentId: safeString(hr.student_id), designatedBy: d.designated_by
      });
    }

    res.json({
      status: 'success',
      publication: { id: pubId, activityId: publication.activity_id, isPublished: !!publication.is_published, publishedAt: publication.published_at, publishedBy: publication.published_by },
      viewRules: enrichedViewRules, meritRules: enrichedMeritRules, meritListDesignations: enrichedDesignations
    });
  } catch (e) { res.json({ status: 'error', message: safeString(e.message) }); }
});

// ─── saveResultPublication ───
router.post('/saveResultPublication', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });
    const activityId = safeString(req.body.activityId);
    const isPublished = req.body.isPublished === true || req.body.isPublished === 1;
    if (!activityId) return res.json({ status: 'invalid_params', message: '请提供评分活动ID' });

    const activity = await activityModel.getById(activityId);
    if (!activity) return res.json({ status: 'not_found', message: '评分活动不存在' });

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    let existing = await publicationModel.getByActivity(activityId);

    if (existing) {
      await publicationModel.update(existing.id, { isPublished, publishedAt: isPublished ? now : existing.published_at, publishedBy: admin.id });
    } else {
      const newId = generateId();
      await publicationModel.create(newId, { activityId, isPublished, publishedAt: isPublished ? now : null, publishedBy: admin.id });
      existing = { id: newId };
    }
    res.json({ status: 'success', publication: { id: existing.id, activityId, isPublished }, message: isPublished ? '结果已公示' : '公示已关闭' });
  } catch (e) { res.json({ status: 'error', message: safeString(e.message) }); }
});

// ─── saveResultViewPermission ───
router.post('/saveResultViewPermission', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });
    const id = safeString(req.body.id), publicationId = safeString(req.body.publicationId);
    const granteeDeptId = safeString(req.body.granteeDepartmentId), granteeIdentId = safeString(req.body.granteeIdentityId);
    const scopeType = safeString(req.body.scopeType), targetIdentityId = safeString(req.body.targetIdentityId || '');

    if (!publicationId || !granteeDeptId || !granteeIdentId) return res.json({ status: 'invalid_params', message: '请完整填写授权信息' });
    if (!VALID_SCOPES.includes(scopeType)) return res.json({ status: 'invalid_params', message: '无效的查看范围' });
    if (IDENTITY_REQUIRED_SCOPES.includes(scopeType) && !targetIdentityId) return res.json({ status: 'invalid_params', message: '请选择目标身份' });

    const pub = await publicationModel.getById(publicationId);
    if (!pub) return res.json({ status: 'not_found', message: '公示记录不存在' });

    if (id) {
      await viewPermModel.update(id, { granteeDepartmentId: granteeDeptId, granteeIdentityId: granteeIdentId, scopeType, targetIdentityId: targetIdentityId || null });
      return res.json({ status: 'success', id, message: '查看权限已更新' });
    }
    const newId = generateId();
    await viewPermModel.create(newId, { publicationId, granteeDepartmentId: granteeDeptId, granteeIdentityId: granteeIdentId, scopeType, targetIdentityId: targetIdentityId || null });
    res.json({ status: 'success', id: newId, message: '查看权限已创建' });
  } catch (e) { res.json({ status: 'error', message: safeString(e.message) }); }
});

// ─── deleteResultViewPermission ───
router.post('/deleteResultViewPermission', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供权限ID' });
    await viewPermModel.remove(id);
    res.json({ status: 'success', message: '查看权限已删除' });
  } catch (e) { res.json({ status: 'error', message: safeString(e.message) }); }
});

// ─── saveMeritListPermission ───
router.post('/saveMeritListPermission', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });
    const id = safeString(req.body.id), publicationId = safeString(req.body.publicationId);
    const granteeDeptId = safeString(req.body.granteeDepartmentId), granteeIdentId = safeString(req.body.granteeIdentityId);
    const targetIdentityId = safeString(req.body.targetIdentityId);
    const scopeType = safeString(req.body.scopeType || 'all_people');
    const quotaLimit = Math.max(0, parseInt(req.body.quotaLimit, 10) || 0);
    const requireExactQuota = req.body.requireExactQuota === true || req.body.requireExactQuota === 1;

    if (!publicationId || !granteeDeptId || !granteeIdentId || !targetIdentityId)
      return res.json({ status: 'invalid_params', message: '请完整填写授权信息' });
    if (!VALID_SCOPES.includes(scopeType))
      return res.json({ status: 'invalid_params', message: '无效的指定范围' });

    const pub = await publicationModel.getById(publicationId);
    if (!pub) return res.json({ status: 'not_found', message: '公示记录不存在' });

    const lookups = await fetchOrgLookups();

    // Check grantee has view permission for this target
    const orgId = await getCurrentOrgId();
    const [viewRows] = await pool.query(
      `SELECT * FROM result_view_permissions WHERE publication_id = ? AND grantee_department_id = ? AND grantee_identity_id = ?
       AND (target_identity_id = ? OR scope_type IN ('all_people', 'same_department_all', 'same_work_group_all'))
       AND org_id = ? LIMIT 1`,
      [publicationId, granteeDeptId, granteeIdentId, targetIdentityId, orgId]
    );
    if (!viewRows.length) {
      return res.json({ status: 'no_view_permission', message: `授权方尚未获得对该身份的结果查看权限，请先授予查看权限` });
    }

    // Uniqueness check
    const existing = await meritPermModel.getByPublicationAndTarget(publicationId, targetIdentityId);
    if (existing && String(existing.id) !== id) {
      return res.json({ status: 'duplicate_target', message: '该身份的评优名单指定权已被其他授权方占用' });
    }

    const { withTransaction } = require('../config/db');
    let resultId;
    await withTransaction(async (conn) => {
      if (id) {
        await conn.query(
          `UPDATE merit_list_permissions SET grantee_department_id=?, grantee_identity_id=?, target_identity_id=?, scope_type=?, quota_limit=?, require_exact_quota=?, updated_at=NOW()
           WHERE id=? AND org_id=?`,
          [granteeDeptId, granteeIdentId, targetIdentityId, scopeType, quotaLimit, requireExactQuota ? 1 : 0, id, orgId]
        );
        resultId = id;
      } else {
        resultId = generateId();
        await conn.query(
          `INSERT INTO merit_list_permissions (id, publication_id, grantee_department_id, grantee_identity_id, target_identity_id, scope_type, quota_limit, require_exact_quota, org_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [resultId, publicationId, granteeDeptId, granteeIdentId, targetIdentityId, scopeType, quotaLimit, requireExactQuota ? 1 : 0, orgId]
        );
      }
    });

    res.json({ status: 'success', id: resultId, message: '评优名单指定权限已保存' });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.json({ status: 'duplicate_target', message: '该身份的评优名单指定权已被其他授权方占用' });
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ─── deleteMeritListPermission ───
router.post('/deleteMeritListPermission', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供权限ID' });

    const { withTransaction } = require('../config/db');
    const orgId = await getCurrentOrgId();
    await withTransaction(async (conn) => {
      // Delete legacy designations by permission_id (old merit_list_permissions FK)
      await conn.query('DELETE FROM merit_list_designations WHERE permission_id = ? AND org_id = ?', [id, orgId]);
      // Also delete by clause_id in case records were already migrated
      await conn.query('DELETE FROM merit_list_designations WHERE clause_id = ? AND org_id = ?', [id, orgId]);
      await conn.query('DELETE FROM merit_list_permissions WHERE id = ? AND org_id = ?', [id, orgId]);
    });
    res.json({ status: 'success', message: '评优指定权已删除' });
  } catch (e) { res.json({ status: 'error', message: safeString(e.message) }); }
});

// ─── saveMeritListDesignations ───
router.post('/saveMeritListDesignations', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });
    const clauseIds = Array.isArray(req.body.clauseIds) && req.body.clauseIds.length
      ? req.body.clauseIds.map(id => safeString(id)).filter(Boolean)
      : [safeString(req.body.clauseId) || safeString(req.body.permissionId)];
    const primaryClauseId = clauseIds[0];
    const publicationId = safeString(req.body.publicationId);
    // Dedup HR IDs to prevent duplicates
    const designationHrIds = [...new Set(
      (Array.isArray(req.body.designationHrIds) ? req.body.designationHrIds.map(id => safeString(id)).filter(Boolean) : [])
    )];

    if (!primaryClauseId || !publicationId) return res.json({ status: 'invalid_params', message: '缺少必要参数' });

    // Look up clause + parent merit rule from new tables (include publication_id for reliable INSERT)
    const [[clause]] = await pool.query(
      'SELECT pmrc.*, pmr.grantee_department_id, pmr.publication_id FROM pub_merit_rule_clauses pmrc JOIN pub_merit_rules pmr ON pmr.id = pmrc.rule_id WHERE pmrc.id = ?', [primaryClauseId]
    );
    if (!clause) return res.json({ status: 'not_found', message: '评优指定条款不存在' });

    // Admin can designate fewer than quota but NOT exceed it
    // Aggregate quota across all clauses
    let aggregatedQuotaLimit = 0;
    if (clauseIds.length > 1) {
      const ph = clauseIds.map(() => '?').join(',');
      const [quotaRows] = await pool.query(`SELECT quota_limit FROM pub_merit_rule_clauses WHERE id IN (${ph})`, clauseIds);
      for (const cl of quotaRows) {
        aggregatedQuotaLimit = Math.max(aggregatedQuotaLimit, cl.quota_limit || 0);
      }
    } else {
      aggregatedQuotaLimit = clause.quota_limit || 0;
    }
    if (aggregatedQuotaLimit > 0 && designationHrIds.length > aggregatedQuotaLimit) {
      return res.json({ status: 'quota_exceeded', message: `最多可指定 ${aggregatedQuotaLimit} 人` });
    }

    const pubId = safeString(clause.publication_id) || publicationId;

    // Validate all designated HR members are within the ALL clauses' combined scope
    const orgId = await getCurrentOrgId();
    // Fetch all clause scopes in a single query
    let allClauseScopes = [];
    if (clauseIds.length > 1) {
      const ph = clauseIds.map(() => '?').join(',');
      const [rows] = await pool.query(`SELECT pmrc.scope_type, pmrc.target_identity_id, pmr.grantee_department_id FROM pub_merit_rule_clauses pmrc JOIN pub_merit_rules pmr ON pmr.id = pmrc.rule_id WHERE pmrc.id IN (${ph})`, clauseIds);
      allClauseScopes = rows;
    } else {
      allClauseScopes = [{ scope_type: clause.scope_type, target_identity_id: clause.target_identity_id, grantee_department_id: clause.grantee_department_id }];
    }
    const [granteeRows] = await pool.query('SELECT id, work_group_id FROM hr_info WHERE department_id = ? AND org_id = ? LIMIT 1', [safeString(clause.grantee_department_id), orgId]);
    const granteeWgId = safeString((granteeRows[0] || {}).work_group_id);
    for (const hrId of designationHrIds) {
      const hr = await hrInfoModel.getById(hrId);
      if (!hr) return res.json({ status: 'invalid_hr', message: '人事成员不存在' });
      let matchesAnyClause = false;
      for (const sc of allClauseScopes) {
        if (safeString(hr.identity_id) !== safeString(sc.target_identity_id)) continue;
        const scopeType = safeString(sc.scope_type || 'all_people');
        if (scopeType === 'all_people' || scopeType === 'identity_only') { matchesAnyClause = true; break; }
        const hrDept = safeString(hr.department_id);
        if (scopeType === 'same_department_identity' || scopeType === 'same_department_all') { if (hrDept === safeString(sc.grantee_department_id)) { matchesAnyClause = true; break; } }
        else if (scopeType === 'same_work_group_identity' || scopeType === 'same_work_group_all') { if (hrDept === safeString(sc.grantee_department_id) && safeString(hr.work_group_id) === granteeWgId) { matchesAnyClause = true; break; } }
      }
      if (!matchesAnyClause) return res.json({ status: 'out_of_scope', message: `"${safeString(hr.name)}" 不在您的指定范围内` });
    }

    const { withTransaction } = require('../config/db');
    await withTransaction(async (conn) => {
      // Delete all designations for ALL clauses in this identity group
      const delPh = clauseIds.map(() => '?').join(',');
      await conn.query(`DELETE FROM merit_list_designations WHERE clause_id IN (${delPh}) AND org_id = ?`, [...clauseIds, orgId]);
      // Also remove these HRs from any other clauses in this publication
      // to avoid unique constraint violation (one person can only appear once)
      if (designationHrIds.length > 0) {
        const hrPh = designationHrIds.map(() => '?').join(',');
        await conn.query(
          `DELETE FROM merit_list_designations WHERE publication_id = ? AND target_hr_id IN (${hrPh}) AND org_id = ?`,
          [pubId, ...designationHrIds, orgId]
        );
      }
      // Insert all under the primary clause (dedup already done above)
      for (const hrId of designationHrIds) {
        await conn.query(
          'INSERT INTO merit_list_designations (id, publication_id, clause_id, target_hr_id, designated_by, org_id) VALUES (?, ?, ?, ?, ?, ?)',
          [generateId(), pubId, primaryClauseId, hrId, admin.id, orgId]
        );
      }
    });

    // Query only the designations for the clauses just edited (not entire publication)
    const clausesPh = clauseIds.map(() => '?').join(',');
    const [designations] = await pool.query(
      `SELECT * FROM merit_list_designations WHERE clause_id IN (${clausesPh}) AND org_id = ?`,
      [...clauseIds, orgId]
    );
    const result = [];
    for (const d of designations) {
      const hr = await hrInfoModel.getById(d.target_hr_id);
      result.push({ id: d.id, clauseId: d.clause_id || '', targetHrId: d.target_hr_id, targetName: hr ? safeString(hr.name) : '', targetStudentId: hr ? safeString(hr.student_id) : '' });
    }
    res.json({ status: 'success', designations: result, message: `已保存 ${result.length} 条评优名单` });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.json({ status: 'duplicate_hr', message: '同一个被评人不能重复出现在评优名单中' });
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ─── removeMeritListDesignation ───
router.post('/removeMeritListDesignation', async (req, res) => {
  try {
    const admin = await ensureAdmin(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });
    const id = safeString(req.body.id);
    if (!id) return res.json({ status: 'invalid_params', message: '请提供指定ID' });
    await designationModel.remove(id);
    res.json({ status: 'success', message: '评优指定已移除' });
  } catch (e) { res.json({ status: 'error', message: safeString(e.message) }); }
});

// ─── getPublicResults (user-facing) ───
router.post('/getPublicResults', async (req, res) => {
  try {
    const openid = req.openid;
    const activityId = safeString(req.body.activityId);
    if (!openid) return res.json({ status: 'auth_failed', message: '请先登录' });
    if (!activityId) return res.json({ status: 'invalid_params', message: '请提供评分活动ID' });

    const publication = await publicationModel.getByActivity(activityId);
    if (!publication || !publication.is_published) return res.json({ status: 'not_published', message: '当前评分活动结果尚未公示' });

    const user = await userInfoModel.getByOpenid(openid);
    if (!user || !safeString(user.hr_id)) return res.json({ status: 'not_bound', message: '请先绑定人事信息' });

    const lookups = await fetchOrgLookups();
    const viewerHr = await hrInfoModel.getById(safeString(user.hr_id));
    if (!viewerHr) return res.json({ status: 'not_bound', message: '人事信息不存在' });

    const viewer = { id: safeString(viewerHr.id), departmentId: safeString(viewerHr.department_id), identityId: safeString(viewerHr.identity_id), workGroupId: safeString(viewerHr.work_group_id) };

    const orgId = await getCurrentOrgId();
    const [viewRuleRows] = await pool.query('SELECT * FROM pub_view_rules WHERE publication_id = ? AND org_id = ?', [publication.id, orgId]);
    const matchingRules = viewRuleRows.filter(r => safeString(r.grantee_department_id) === viewer.departmentId && safeString(r.grantee_identity_id) === viewer.identityId);
    if (!matchingRules.length) return res.json({ status: 'no_permission', message: '暂无查看评分结果的权限' });

    // Collect all matching clauses (with per-clause display_mode)
    const matchingClauses = [];
    for (const rule of matchingRules) {
      const [clauses] = await pool.query('SELECT * FROM pub_view_rule_clauses WHERE rule_id = ? ORDER BY sort_order ASC', [rule.id]);
      matchingClauses.push(...clauses);
    }
    if (!matchingClauses.length) return res.json({ status: 'no_permission', message: '暂无查看评分结果的权限' });

    // Determine display mode from the first matching clause (per-clause level)
    const displayMode = safeString(matchingClauses[0].display_mode) || 'score';
    let gradeBands = [];
    if (displayMode === 'grade') {
      try {
        const clauseIds = matchingClauses.map(c => c.id);
        const ph = clauseIds.map(() => '?').join(',');
        const [gbRows] = await pool.query(
          `SELECT * FROM pub_grade_bands WHERE clause_id IN (${ph}) AND org_id = ? ORDER BY clause_id, sort_order ASC`,
          [...clauseIds, orgId]
        );
        gradeBands = gbRows;
      } catch (e) {
        // Table may not exist yet — fall back to score display
      }
    }

    const [hrRows] = await pool.query('SELECT * FROM hr_info WHERE org_id = ?', [orgId]);
    const allMembers = hrRows.map(m => ({
      id: safeString(m.id), name: safeString(m.name), studentId: safeString(m.student_id),
      departmentId: safeString(m.department_id), identityId: safeString(m.identity_id), workGroupId: safeString(m.work_group_id)
    }));

    function matchScope(target, clause) {
      const st = safeString(clause.scope_type);
      if (st === 'own_results') return target.id === viewer.id;
      if (st === 'same_department_identity') return target.departmentId === viewer.departmentId && target.identityId === safeString(clause.target_identity_id);
      if (st === 'same_department_all') return target.departmentId === viewer.departmentId;
      if (st === 'same_work_group_identity') return target.departmentId === viewer.departmentId && target.workGroupId === viewer.workGroupId && target.identityId === safeString(clause.target_identity_id);
      if (st === 'same_work_group_all') return target.departmentId === viewer.departmentId && target.workGroupId === viewer.workGroupId;
      if (st === 'all_people') return true;
      return false;
    }

    const visibleIds = new Set();
    for (const m of allMembers) {
      for (const clause of matchingClauses) { if (matchScope(m, clause)) { visibleIds.add(m.id); break; } }
    }

    // Compute scores using unified engine (validates identity, template, requireAllComplete)
    const { computeValidScoreMap } = require('../utils/scoreCalc');
    const rawScoreMap = await computeValidScoreMap(activityId, orgId, { visibleTargetIds: visibleIds });
    // Defensive: ensure we always get a Map (not the includeCounts return shape)
    const scoreMap = (rawScoreMap instanceof Map) ? rawScoreMap : (rawScoreMap && rawScoreMap.finalScoreMap instanceof Map ? rawScoreMap.finalScoreMap : new Map());

    const results = [];
    for (const member of allMembers) {
      if (!visibleIds.has(member.id)) continue;
      const scoreData = scoreMap.get(member.id);
      const rawScore = (scoreData && typeof scoreData.finalScore === 'number') ? scoreData.finalScore : 0;

      const resultEntry = {
        name: member.name,
        department: lookups.departmentsById.get(member.departmentId) || safeString(member.departmentId) || '未分类',
        identity: lookups.identitiesById.get(member.identityId) || safeString(member.identityId) || '未分类',
        workGroup: lookups.workGroupsById.get(member.workGroupId) || safeString(member.workGroupId) || '未分类'
      };

      if (displayMode === 'grade') {
        // Server-side grade computation — frontend receives only the grade string
        resultEntry.grade = applyGradeBands(rawScore, gradeBands);
      } else {
        // Default: expose numeric score (backward compatible)
        resultEntry.finalScore = Number(rawScore).toFixed(3);
      }

      results.push(resultEntry);
    }
    results.sort((a, b) => {
      if (displayMode === 'grade') {
        return String(a.grade || '').localeCompare(String(b.grade || ''), 'zh-CN');
      }
      return (Number(b.finalScore) || 0) - (Number(a.finalScore) || 0);
    });

    res.json({
      status: 'success',
      displayMode,
      results
    });
  } catch (e) { res.json({ status: 'error', message: safeString(e.message) }); }
});

// ─── getPublicMeritList (user-facing) ───
router.post('/getPublicMeritList', async (req, res) => {
  try {
    const openid = req.openid;
    const activityId = safeString(req.body.activityId);
    if (!openid) return res.json({ status: 'auth_failed', message: '请先登录' });
    if (!activityId) return res.json({ status: 'invalid_params', message: '请提供评分活动ID' });

    const publication = await publicationModel.getByActivity(activityId);
    if (!publication || !publication.is_published) return res.json({ status: 'not_published', message: '当前评分活动结果尚未公示' });

    // Check if user has merit list designation permission
    let canDesignate = false;
    let matchingRules = [];
    const user = await userInfoModel.getByOpenid(openid);
    if (user && safeString(user.hr_id)) {
      const viewerHr = await hrInfoModel.getById(safeString(user.hr_id));
      if (viewerHr) {
        const orgId = await getCurrentOrgId();
        const [meritRuleRows] = await pool.query('SELECT * FROM pub_merit_rules WHERE publication_id = ? AND org_id = ?', [publication.id, orgId]);
        matchingRules = meritRuleRows.filter(r =>
          safeString(r.grantee_department_id) === safeString(viewerHr.department_id) &&
          safeString(r.grantee_identity_id) === safeString(viewerHr.identity_id)
        );
        // Only grant designation right if at least one clause exists
        for (const rule of matchingRules) {
          const [[{cnt}]] = await pool.query('SELECT COUNT(*) as cnt FROM pub_merit_rule_clauses WHERE rule_id = ?', [rule.id]);
          if (cnt > 0) { canDesignate = true; break; }
        }
      }
    }

    const orgId = await getCurrentOrgId();
    const designations = await designationModel.getByPublication(publication.id);
    // Only include designations linked to valid merit clauses in new system
    const validClauseIds = new Set();
    if (designations.length > 0) {
      const [meritRules] = await pool.query('SELECT id FROM pub_merit_rules WHERE publication_id = ? AND org_id = ?', [publication.id, orgId]);
      if (meritRules.length > 0) {
        const ruleIds = meritRules.map(r => r.id);
        const rulePh = ruleIds.map(() => '?').join(',');
        const [clauses] = await pool.query(`SELECT id FROM pub_merit_rule_clauses WHERE rule_id IN (${rulePh})`, ruleIds);
        clauses.forEach(c => validClauseIds.add(c.id));
      }
    }
    const lookups = await fetchOrgLookups();
    const result = [];
    for (const d of designations) {
      const cid = d.clause_id || '';
      if (!cid || !validClauseIds.has(cid)) continue;
      const hr = await hrInfoModel.getById(d.target_hr_id);
      if (!hr) continue;
      result.push({
        id: d.id, targetHrId: d.target_hr_id, name: safeString(hr.name),
        department: lookups.departmentsById.get(safeString(hr.department_id)) || '',
        identity: lookups.identitiesById.get(safeString(hr.identity_id)) || '',
        workGroup: lookups.workGroupsById.get(safeString(hr.work_group_id)) || ''
      });
    }
    // Collect user's own merit clauses for the designation picker
    const userClauses = [];
    // Build scoped designation candidates (so frontend does NOT need admin-only listHrInfo)
    const designationCandidates = [];
    const seenCandidateIds = new Set();
    if (canDesignate) {
      // Re-query viewer HR info for scope matching (may have been scoped inside the permission check)
      const viewerHrRef = user && safeString(user.hr_id) ? await hrInfoModel.getById(safeString(user.hr_id)) : null;
      const viewerDepartmentId = viewerHrRef ? safeString(viewerHrRef.department_id) : '';
      const viewerIdentityId = viewerHrRef ? safeString(viewerHrRef.identity_id) : '';
      const viewerWg = viewerHrRef ? safeString(viewerHrRef.work_group_id) : '';

      // Fetch all HR for scope matching
      const [allHrMembers] = await pool.query('SELECT * FROM hr_info WHERE org_id = ?', [orgId]);

      for (const rule of matchingRules) {
        const [clauses] = await pool.query('SELECT * FROM pub_merit_rule_clauses WHERE rule_id = ? ORDER BY sort_order', [rule.id]);
        for (const c of clauses) {
          const targetIdentityName = lookups.identitiesById.get(safeString(c.target_identity_id)) || '';
          userClauses.push({
            id: c.id, ruleId: rule.id,
            scopeType: c.scope_type,
            targetIdentityId: c.target_identity_id,
            targetIdentity: targetIdentityName,
            quotaLimit: c.quota_limit || 0,
            requireExactQuota: (c.require_exact_quota === 1),
            granteeDepartmentId: safeString(rule.grantee_department_id),
            granteeIdentityId: safeString(rule.grantee_identity_id)
          });

          // Build designation candidates for this clause
          const st = safeString(c.scope_type) || 'all_people';
          const tid = safeString(c.target_identity_id);
          for (const hr of allHrMembers) {
            if (safeString(hr.identity_id) !== tid) continue;
            if (seenCandidateIds.has(hr.id)) continue;
            let match = false;
            if (st === 'all_people' || st === 'identity_only') match = true;
            else if (st === 'same_department_identity') match = safeString(hr.department_id) === viewerDepartmentId;
            else if (st === 'same_department_all') match = safeString(hr.department_id) === viewerDepartmentId;
            else if (st === 'same_work_group_identity') match = safeString(hr.department_id) === viewerDepartmentId && safeString(hr.work_group_id) === viewerWg;
            else if (st === 'same_work_group_all') match = safeString(hr.department_id) === viewerDepartmentId && safeString(hr.work_group_id) === viewerWg;
            if (match) {
              seenCandidateIds.add(hr.id);
              const alreadySelected = result.some(d => d.targetHrId === hr.id);
              designationCandidates.push({
                id: hr.id,
                name: safeString(hr.name),
                departmentId: safeString(hr.department_id),
                department: lookups.departmentsById.get(safeString(hr.department_id)) || '',
                identityId: safeString(hr.identity_id),
                identity: lookups.identitiesById.get(safeString(hr.identity_id)) || '',
                workGroupId: safeString(hr.work_group_id),
                workGroup: lookups.workGroupsById.get(safeString(hr.work_group_id)) || '',
                isSelected: alreadySelected,
                targetIdentityId: tid,
                targetIdentity: targetIdentityName
              });
            }
          }
        }
      }
    }
    res.json({ status: 'success', meritList: result, canDesignate, clauses: userClauses, designationCandidates, publicationId: publication.id });
  } catch (e) { res.json({ status: 'error', message: safeString(e.message) }); }
});

// ─── submitMeritListDesignations (user-facing, grantee-verified) ───
router.post('/submitMeritListDesignations', async (req, res) => {
  try {
    const openid = req.openid;
    const permissionId = safeString(req.body.permissionId), publicationId = safeString(req.body.publicationId);
    const clauseIds = Array.isArray(req.body.clauseIds) && req.body.clauseIds.length
      ? req.body.clauseIds.map(id => safeString(id)).filter(Boolean)
      : [safeString(req.body.clauseId) || safeString(req.body.permissionId)];
    const primaryClauseId = clauseIds[0];
    // Dedup HR IDs to prevent duplicates
    const designationHrIds = [...new Set(
      (Array.isArray(req.body.designationHrIds) ? req.body.designationHrIds.map(id => safeString(id)).filter(Boolean) : [])
    )];

    if (!openid) return res.json({ status: 'auth_failed', message: '请先登录' });
    if (!primaryClauseId || !publicationId) return res.json({ status: 'invalid_params', message: '缺少必要参数' });

    const user = await userInfoModel.getByOpenid(openid);
    if (!user || !safeString(user.hr_id)) return res.json({ status: 'not_bound', message: '请先绑定人事信息' });
    const viewerHr = await hrInfoModel.getById(safeString(user.hr_id));
    if (!viewerHr) return res.json({ status: 'not_bound', message: '人事信息不存在' });

    // Look up clause + parent merit rule (include publication_id for reliable lookup)
    const [[clause]] = await pool.query(
      'SELECT pmrc.*, pmr.grantee_department_id, pmr.grantee_identity_id, pmr.publication_id FROM pub_merit_rule_clauses pmrc JOIN pub_merit_rules pmr ON pmr.id = pmrc.rule_id WHERE pmrc.id = ?', [primaryClauseId]
    );
    if (!clause) return res.json({ status: 'not_found', message: '评优指定条款不存在' });
    if (safeString(clause.grantee_department_id) !== safeString(viewerHr.department_id) || safeString(clause.grantee_identity_id) !== safeString(viewerHr.identity_id))
      return res.json({ status: 'forbidden', message: '您没有该身份的评优名单指定权限' });

    // Use merit rule's publication_id (reliable), fall back to frontend-supplied
    const pubId = safeString(clause.publication_id) || publicationId;
    const publication = await publicationModel.getById(pubId);
    if (!publication || !publication.is_published) return res.json({ status: 'not_published', message: '当前评分活动结果尚未公示' });

    // Aggregate quota across all clauses in a single query
    let aggregatedQuotaLimit = 0, hasExactQuota = false;
    if (clauseIds.length > 1) {
      const placeholders = clauseIds.map(() => '?').join(',');
      const [quotaRows] = await pool.query(`SELECT quota_limit, require_exact_quota FROM pub_merit_rule_clauses WHERE id IN (${placeholders})`, clauseIds);
      for (const cl of quotaRows) {
        aggregatedQuotaLimit = Math.max(aggregatedQuotaLimit, cl.quota_limit || 0);
        if (cl.require_exact_quota) hasExactQuota = true;
      }
    } else {
      aggregatedQuotaLimit = clause.quota_limit || 0;
      hasExactQuota = !!(clause.require_exact_quota);
    }
    if (hasExactQuota && aggregatedQuotaLimit > 0 && designationHrIds.length !== aggregatedQuotaLimit)
      return res.json({ status: 'quota_mismatch', message: `要求等额指定 ${aggregatedQuotaLimit} 人` });
    if (!hasExactQuota && aggregatedQuotaLimit > 0 && designationHrIds.length > aggregatedQuotaLimit)
      return res.json({ status: 'quota_exceeded', message: `最多可指定 ${aggregatedQuotaLimit} 人` });

    const { withTransaction } = require('../config/db');
    const orgId = await getCurrentOrgId();
    await withTransaction(async (conn) => {
      // Delete all designations for ALL clauses in this identity group
      const delPh = clauseIds.map(() => '?').join(',');
      await conn.query(`DELETE FROM merit_list_designations WHERE clause_id IN (${delPh}) AND org_id = ?`, [...clauseIds, orgId]);
      // Also remove these HRs from any other clauses in this publication
      // to avoid unique constraint violation (one person can only appear once)
      if (designationHrIds.length > 0) {
        const hrPh = designationHrIds.map(() => '?').join(',');
        await conn.query(
          `DELETE FROM merit_list_designations WHERE publication_id = ? AND target_hr_id IN (${hrPh}) AND org_id = ?`,
          [pubId, ...designationHrIds, orgId]
        );
      }
      // Insert all under the primary clause (dedup already done above)
      for (const hrId of designationHrIds) {
        await conn.query(
          'INSERT INTO merit_list_designations (id, publication_id, clause_id, target_hr_id, designated_by, org_id) VALUES (?, ?, ?, ?, ?, ?)',
          [generateId(), pubId, primaryClauseId, hrId, openid, orgId]
        );
      }
    });

    const [designations] = await pool.query('SELECT * FROM merit_list_designations WHERE clause_id = ? AND org_id = ?', [primaryClauseId, orgId]);
    const result = [];
    for (const d of designations) {
      const hr = await hrInfoModel.getById(d.target_hr_id);
      result.push({ id: d.id, clauseId: primaryClauseId, targetHrId: d.target_hr_id, targetName: hr ? safeString(hr.name) : '', targetStudentId: hr ? safeString(hr.student_id) : '' });
    }
    res.json({ status: 'success', designations: result, message: `已保存 ${result.length} 条评优名单` });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.json({ status: 'duplicate_hr', message: '同一个被评人不能重复出现在评优名单中' });
    res.json({ status: 'error', message: safeString(e.message) });
  }
});

// ─── generatePubViewRules ───
router.post('/generatePubViewRules', async (req, res) => {
  try {
    const admin = await adminInfoModel.getByOpenid(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });
    const publicationId = safeString(req.body.publicationId);
    if (!publicationId) return res.json({ status: 'invalid_params', message: '请提供公示ID' });

    const orgId = await getCurrentOrgId();
    const [[pubCheck]] = await pool.query('SELECT id FROM result_publications WHERE id = ? AND org_id = ?', [publicationId, orgId]);
    if (!pubCheck) return res.json({ status: 'invalid_params', message: '结果公示不存在' });

    // Get all HR records
    const [hrRows] = await pool.query('SELECT department_id, identity_id FROM hr_info WHERE org_id = ?', [orgId]);
    // Get existing view rules
    const [existingRules] = await pool.query('SELECT grantee_department_id, grantee_identity_id FROM pub_view_rules WHERE publication_id = ? AND org_id = ?', [publicationId, orgId]);

    const existingKeys = new Set();
    existingRules.forEach(r => existingKeys.add(safeString(r.grantee_department_id) + '::' + safeString(r.grantee_identity_id)));

    const categories = new Map();
    hrRows.forEach(item => {
      const deptId = safeString(item.department_id);
      const identId = safeString(item.identity_id);
      if (!deptId || !identId) return;
      const key = deptId + '::' + identId;
      if (!categories.has(key)) categories.set(key, { deptId, identId });
    });

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    let createdCount = 0;
    for (const [key, cat] of categories) {
      if (existingKeys.has(key)) continue;
      const ruleId = generateId();
      await pool.query(
        'INSERT INTO pub_view_rules (id, publication_id, grantee_department_id, grantee_identity_id, org_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [ruleId, publicationId, cat.deptId, cat.identId, orgId, now, now]
      );
      // No default clause — user configures rules manually
      createdCount++;
    }

    const backfilledCount = 0; // No longer auto-creating clauses

    res.json({ status: 'success', totalCategories: categories.size, createdCount, skippedCount: categories.size - createdCount, backfilledCount });
  } catch (e) { res.json({ status: 'error', message: safeString(e.message) }); }
});

// ─── generatePubMeritRules ───
router.post('/generatePubMeritRules', async (req, res) => {
  try {
    const admin = await adminInfoModel.getByOpenid(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '没有管理权限' });
    const publicationId = safeString(req.body.publicationId);
    if (!publicationId) return res.json({ status: 'invalid_params', message: '请提供公示ID' });

    const orgId = await getCurrentOrgId();
    const [[pubCheck]] = await pool.query('SELECT id FROM result_publications WHERE id = ? AND org_id = ?', [publicationId, orgId]);
    if (!pubCheck) return res.json({ status: 'invalid_params', message: '结果公示不存在' });

    // Get existing view rules as source
    const [viewRules] = await pool.query('SELECT grantee_department_id, grantee_identity_id FROM pub_view_rules WHERE publication_id = ? AND org_id = ?', [publicationId, orgId]);
    // Get existing merit rules
    const [existingMeritRules] = await pool.query('SELECT grantee_department_id, grantee_identity_id FROM pub_merit_rules WHERE publication_id = ? AND org_id = ?', [publicationId, orgId]);

    const existingKeys = new Set();
    existingMeritRules.forEach(r => existingKeys.add(safeString(r.grantee_department_id) + '::' + safeString(r.grantee_identity_id)));

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    let createdCount = 0;
    for (const rule of viewRules) {
      const key = safeString(rule.grantee_department_id) + '::' + safeString(rule.grantee_identity_id);
      if (existingKeys.has(key)) continue;
      const meritRuleId = generateId();
      await pool.query(
        'INSERT INTO pub_merit_rules (id, publication_id, grantee_department_id, grantee_identity_id, org_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [meritRuleId, publicationId, rule.grantee_department_id, rule.grantee_identity_id, orgId, now, now]
      );
      // No default clause — user configures rules manually
      createdCount++;
    }

    const backfilledCount = 0; // No longer auto-creating clauses

    res.json({ status: 'success', totalViewCategories: viewRules.length, createdCount, skippedCount: viewRules.length - createdCount, backfilledCount });
  } catch (e) { res.json({ status: 'error', message: safeString(e.message) }); }
});

// ─── savePubViewRule ───
router.post('/savePubViewRule', async (req, res) => {
  try {
    const admin = await adminInfoModel.getByOpenid(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '无管理权限' });
    const id = safeString(req.body.id);
    const publicationId = safeString(req.body.publicationId);
    const granteeDepartmentId = safeString(req.body.granteeDepartmentId);
    const granteeIdentityId = safeString(req.body.granteeIdentityId);
    const clauses = Array.isArray(req.body.clauses) ? req.body.clauses : [];
    if (!publicationId || !granteeDepartmentId || !granteeIdentityId) return res.json({ status: 'invalid_params', message: '请提供公示ID和授权部门、身份ID' });

    const orgId = await getCurrentOrgId();
    const [[pub]] = await pool.query('SELECT id FROM result_publications WHERE id = ? AND org_id = ?', [publicationId, orgId]);
    if (!pub) return res.json({ status: 'invalid_params', message: '结果公示不存在' });

    const VIEW_SCOPES = ['own_results', 'same_department_identity', 'same_department_all', 'same_work_group_identity', 'same_work_group_all', 'all_people'];
    const IDENTITY_REQUIRED = ['same_department_identity', 'same_work_group_identity'];
    const dedupedClauses = [];
    const seen = new Set();
    for (const c of clauses) {
      const st = safeString(c.scopeType);
      if (!VIEW_SCOPES.includes(st)) return res.json({ status: 'invalid_params', message: '无效的查看范围' });
      const tid = IDENTITY_REQUIRED.includes(st) ? safeString(c.targetIdentityId) : '';
      if (IDENTITY_REQUIRED.includes(st) && !tid) return res.json({ status: 'invalid_params', message: '请提供目标身份ID' });
      const key = st + '::' + tid;
      if (seen.has(key)) continue; seen.add(key);
      // Per-clause display mode and grade bands
      const clauseDisplayMode = VALID_DISPLAY_MODES.includes(safeString(c.displayMode)) ? safeString(c.displayMode) : 'score';
      const clauseGradeBands = Array.isArray(c.gradeBands) ? c.gradeBands : [];
      // Validate grade bands if clause displayMode is 'grade'
      if (clauseDisplayMode === 'grade') {
        if (!clauseGradeBands.length) return res.json({ status: 'invalid_params', message: `等第模式下的查看条款需至少配置一个等第区间` });
        for (let i = 0; i < clauseGradeBands.length; i++) {
          const gb = clauseGradeBands[i];
          const minScore = Number(gb.minScore);
          const maxScore = Number(gb.maxScore);
          const gradeName = safeString(gb.gradeName || gb.grade_name);
          if (!Number.isFinite(minScore) || !Number.isFinite(maxScore)) return res.json({ status: 'invalid_params', message: `第${i + 1}个等第区间的分数边界无效` });
          if (minScore > maxScore) return res.json({ status: 'invalid_params', message: `第${i + 1}个等第区间的下限不能大于上限` });
          if (!gradeName) return res.json({ status: 'invalid_params', message: `第${i + 1}个等第区间的名称不能为空` });
        }
      }
      dedupedClauses.push({ scopeType: st, targetIdentityId: tid, displayMode: clauseDisplayMode, gradeBands: clauseGradeBands });
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    let ruleId = id;
    const { withTransaction } = require('../config/db');
    await withTransaction(async (conn) => {
      if (id) {
        await conn.query('UPDATE pub_view_rules SET grantee_department_id=?, grantee_identity_id=?, updated_at=? WHERE id=? AND org_id=?', [granteeDepartmentId, granteeIdentityId, now, id, orgId]);
        ruleId = id;
      } else {
        const [[existing]] = await conn.query('SELECT id FROM pub_view_rules WHERE publication_id=? AND grantee_department_id=? AND grantee_identity_id=? AND org_id=?', [publicationId, granteeDepartmentId, granteeIdentityId, orgId]);
        if (existing) {
          ruleId = existing.id;
          await conn.query('UPDATE pub_view_rules SET updated_at=? WHERE id=?', [now, ruleId]);
        } else {
          ruleId = generateId();
          await conn.query('INSERT INTO pub_view_rules (id, publication_id, grantee_department_id, grantee_identity_id, org_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', [ruleId, publicationId, granteeDepartmentId, granteeIdentityId, orgId, now, now]);
        }
      }
      // Delete old clauses (cascades to grade_bands via FK)
      await conn.query('DELETE FROM pub_view_rule_clauses WHERE rule_id=?', [ruleId]);
      // Insert clauses with per-clause display_mode and grade bands
      for (let i = 0; i < dedupedClauses.length; i++) {
        const dc = dedupedClauses[i];
        const clauseId = generateId();
        await conn.query(
          'INSERT INTO pub_view_rule_clauses (id, rule_id, scope_type, target_identity_id, display_mode, sort_order, org_id) VALUES (?,?,?,?,?,?,?)',
          [clauseId, ruleId, dc.scopeType, dc.targetIdentityId, dc.displayMode, i + 1, orgId]
        );
        // Save per-clause grade bands
        if (dc.gradeBands.length > 0) {
          try {
            for (let j = 0; j < dc.gradeBands.length; j++) {
              const gb = dc.gradeBands[j];
              await conn.query(
                'INSERT INTO pub_grade_bands (id, clause_id, min_score, max_score, grade_name, sort_order, org_id) VALUES (?,?,?,?,?,?,?)',
                [generateId(), clauseId, Number(gb.minScore), Number(gb.maxScore), safeString(gb.gradeName || gb.grade_name), j + 1, orgId]
              );
            }
          } catch (e) {
            // Table may not exist yet — skip grade bands (but warn if grade mode)
            if (dc.displayMode === 'grade') throw e;
          }
        }
      }
    });
    res.json({ status: 'success', id: ruleId });
  } catch (e) { res.json({ status: 'error', message: safeString(e.message) }); }
});

// ─── listPubViewRules ───
router.post('/listPubViewRules', async (req, res) => {
  try {
    const admin = await adminInfoModel.getByOpenid(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '无管理权限' });
    const publicationId = safeString(req.body.publicationId);
    if (!publicationId) return res.json({ status: 'invalid_params', message: '请提供公示ID' });
    const orgId = await getCurrentOrgId();
    const [rules] = await pool.query('SELECT * FROM pub_view_rules WHERE publication_id=? AND org_id=?', [publicationId, orgId]);

    // Collect all clauses first
    const allClauses = [];
    for (const r of rules) {
      const [clauses] = await pool.query('SELECT * FROM pub_view_rule_clauses WHERE rule_id=? ORDER BY sort_order', [r.id]);
      allClauses.push(...clauses);
    }

    // Load grade bands for all clauses in one batch (per-clause level)
    const gradeBandsByClause = new Map();
    if (allClauses.length > 0) {
      const clauseIds = allClauses.map(c => c.id);
      const ph = clauseIds.map(() => '?').join(',');
      try {
        const [allGradeBands] = await pool.query(
          `SELECT * FROM pub_grade_bands WHERE clause_id IN (${ph}) AND org_id = ? ORDER BY clause_id, sort_order ASC`,
          [...clauseIds, orgId]
        );
        allGradeBands.forEach(gb => {
          if (!gradeBandsByClause.has(gb.clause_id)) gradeBandsByClause.set(gb.clause_id, []);
          gradeBandsByClause.get(gb.clause_id).push({
            id: gb.id, clauseId: gb.clause_id,
            minScore: Number(gb.min_score), maxScore: Number(gb.max_score),
            gradeName: safeString(gb.grade_name), sortOrder: gb.sort_order
          });
        });
      } catch (e) {
        // Table may not exist yet — grade bands will be empty
      }
    }

    // Build clause map by rule_id
    const clausesByRule = new Map();
    for (const c of allClauses) {
      if (!clausesByRule.has(c.rule_id)) clausesByRule.set(c.rule_id, []);
      clausesByRule.get(c.rule_id).push(c);
    }

    const lookups = await fetchOrgLookups();
    const result = [];
    for (const r of rules) {
      const clauses = (clausesByRule.get(r.id) || []).map(c => ({
        id: c.id, scopeType: c.scope_type, targetIdentityId: c.target_identity_id || '',
        targetIdentity: lookups.identitiesById.get(safeString(c.target_identity_id || '')) || '',
        displayMode: safeString(c.display_mode) || 'score',
        gradeBands: gradeBandsByClause.get(c.id) || [],
        sortOrder: c.sort_order
      }));
      result.push({
        id: r.id, publicationId: r.publication_id,
        granteeDepartmentId: r.grantee_department_id, granteeDepartment: lookups.departmentsById.get(safeString(r.grantee_department_id)) || '',
        granteeIdentityId: r.grantee_identity_id, granteeIdentity: lookups.identitiesById.get(safeString(r.grantee_identity_id)) || '',
        clauseCount: clauses.length, clauses
      });
    }
    res.json({ status: 'success', rules: result });
  } catch (e) { res.json({ status: 'error', message: safeString(e.message) }); }
});

// ─── deletePubViewRule ───
router.post('/deletePubViewRule', async (req, res) => {
  try {
    const admin = await adminInfoModel.getByOpenid(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '无管理权限' });
    const ruleId = safeString(req.body.ruleId);
    if (!ruleId) return res.json({ status: 'invalid_params', message: '请提供规则ID' });
    const orgId = await getCurrentOrgId();
    await pool.query('DELETE FROM pub_view_rule_clauses WHERE rule_id=? AND org_id=?', [ruleId, orgId]);
    await pool.query('DELETE FROM pub_view_rules WHERE id=? AND org_id=?', [ruleId, orgId]);
    res.json({ status: 'success', message: '已删除' });
  } catch (e) { res.json({ status: 'error', message: safeString(e.message) }); }
});

// ─── savePubMeritRule ───
router.post('/savePubMeritRule', async (req, res) => {
  try {
    const admin = await adminInfoModel.getByOpenid(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '无管理权限' });
    const id = safeString(req.body.id);
    const publicationId = safeString(req.body.publicationId);
    const granteeDepartmentId = safeString(req.body.granteeDepartmentId);
    const granteeIdentityId = safeString(req.body.granteeIdentityId);
    const clauses = Array.isArray(req.body.clauses) ? req.body.clauses : [];
    if (!publicationId || !granteeDepartmentId || !granteeIdentityId) return res.json({ status: 'invalid_params', message: '请提供公示ID和授权部门、身份ID' });

    const orgId = await getCurrentOrgId();

    // ═══ PREREQUISITE CHECK: grantee must have a view rule with at least one clause ═══
    const [[viewRule]] = await pool.query(
      'SELECT id FROM pub_view_rules WHERE publication_id=? AND grantee_department_id=? AND grantee_identity_id=? AND org_id=?',
      [publicationId, granteeDepartmentId, granteeIdentityId, orgId]
    );
    if (!viewRule) return res.json({ status: 'no_view_rule', message: '该授权对象尚未拥有结果查看权限，请先创建查看权限类别' });
    const [[{cnt}]] = await pool.query('SELECT COUNT(*) as cnt FROM pub_view_rule_clauses WHERE rule_id=?', [viewRule.id]);
    if (cnt === 0) return res.json({ status: 'no_view_rule', message: '该授权对象的查看权限类别尚未配置查看规则条款，请先添加条款' });

    const MERIT_SCOPES = ['same_department_identity', 'same_department_all', 'same_work_group_identity', 'same_work_group_all', 'all_people', 'identity_only'];
    const dedupedClauses = [];
    const seen = new Set();
    for (const c of clauses) {
      const st = safeString(c.scopeType) || 'all_people';
      if (!MERIT_SCOPES.includes(st)) return res.json({ status: 'invalid_params', message: '无效的指定范围' });
      const tid = safeString(c.targetIdentityId);
      if (!tid) return res.json({ status: 'invalid_params', message: '请提供目标身份ID' });
      const quota = Math.max(0, parseInt(String(c.quotaLimit), 10) || 0);
      const exact = c.requireExactQuota === true;
      const key = st + '::' + tid;
      if (seen.has(key)) continue; seen.add(key);
      dedupedClauses.push({ scopeType: st, targetIdentityId: tid, quotaLimit: quota, requireExactQuota: exact });
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    let ruleId = id;
    const { withTransaction } = require('../config/db');
    await withTransaction(async (conn) => {
      if (id) {
        await conn.query('UPDATE pub_merit_rules SET grantee_department_id=?, grantee_identity_id=?, updated_at=? WHERE id=? AND org_id=?', [granteeDepartmentId, granteeIdentityId, now, id, orgId]);
        ruleId = id;
      } else {
        const [[existing]] = await conn.query('SELECT id FROM pub_merit_rules WHERE publication_id=? AND grantee_department_id=? AND grantee_identity_id=? AND org_id=?', [publicationId, granteeDepartmentId, granteeIdentityId, orgId]);
        if (existing) {
          ruleId = existing.id;
          await conn.query('UPDATE pub_merit_rules SET updated_at=? WHERE id=?', [now, ruleId]);
        } else {
          ruleId = generateId();
          await conn.query('INSERT INTO pub_merit_rules (id, publication_id, grantee_department_id, grantee_identity_id, org_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', [ruleId, publicationId, granteeDepartmentId, granteeIdentityId, orgId, now, now]);
        }
      }
      // Merge old clauses with new: preserve IDs for clauses with same logical identity
      const [oldClauses] = await conn.query('SELECT id, scope_type, target_identity_id FROM pub_merit_rule_clauses WHERE rule_id=?', [ruleId]);
      const oldByKey = new Map();
      for (const oc of oldClauses) {
        oldByKey.set(safeString(oc.scope_type) + '::' + safeString(oc.target_identity_id), oc);
      }
      const keptClauseIds = new Set();
      const seenNew = new Set();
      for (let i = 0; i < dedupedClauses.length; i++) {
        const c = dedupedClauses[i];
        const key = c.scopeType + '::' + c.targetIdentityId;
        if (seenNew.has(key)) continue; seenNew.add(key);
        const old = oldByKey.get(key);
        if (old) {
          // Same logical clause — keep existing ID and update quota/sort_order
          keptClauseIds.add(old.id);
          await conn.query(
            'UPDATE pub_merit_rule_clauses SET quota_limit=?, require_exact_quota=?, sort_order=?, scope_type=?, updated_at=NOW() WHERE id=?',
            [c.quotaLimit, c.requireExactQuota ? 1 : 0, i + 1, c.scopeType, old.id]
          );
        } else {
          // New clause — insert
          const cid = generateId();
          keptClauseIds.add(cid);
          await conn.query(
            'INSERT INTO pub_merit_rule_clauses (id, rule_id, scope_type, target_identity_id, quota_limit, require_exact_quota, sort_order, org_id) VALUES (?,?,?,?,?,?,?,?)',
            [cid, ruleId, c.scopeType, c.targetIdentityId, c.quotaLimit, c.requireExactQuota ? 1 : 0, i + 1, orgId]
          );
        }
      }
      // Remove clauses that no longer exist (and their designations)
      for (const oc of oldClauses) {
        if (!keptClauseIds.has(oc.id)) {
          await conn.query('DELETE FROM merit_list_designations WHERE clause_id=?', [oc.id]);
          await conn.query('DELETE FROM pub_merit_rule_clauses WHERE id=?', [oc.id]);
        }
      }
    });
    res.json({ status: 'success', id: ruleId });
  } catch (e) { res.json({ status: 'error', message: safeString(e.message) }); }
});

// ─── listPubMeritRules ───
router.post('/listPubMeritRules', async (req, res) => {
  try {
    const admin = await adminInfoModel.getByOpenid(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '无管理权限' });
    const publicationId = safeString(req.body.publicationId);
    if (!publicationId) return res.json({ status: 'invalid_params', message: '请提供公示ID' });
    const orgId = await getCurrentOrgId();
    const [rules] = await pool.query('SELECT * FROM pub_merit_rules WHERE publication_id=? AND org_id=?', [publicationId, orgId]);
    const lookups = await fetchOrgLookups();
    const result = [];
    for (const r of rules) {
      const [clauses] = await pool.query('SELECT * FROM pub_merit_rule_clauses WHERE rule_id=? ORDER BY sort_order', [r.id]);
      result.push({
        id: r.id, publicationId: r.publication_id,
        granteeDepartmentId: r.grantee_department_id, granteeDepartment: lookups.departmentsById.get(safeString(r.grantee_department_id)) || '',
        granteeIdentityId: r.grantee_identity_id, granteeIdentity: lookups.identitiesById.get(safeString(r.grantee_identity_id)) || '',
        clauseCount: clauses.length,
        clauses: clauses.map(c => ({ id: c.id, scopeType: c.scope_type, targetIdentityId: c.target_identity_id || '', targetIdentity: lookups.identitiesById.get(safeString(c.target_identity_id || '')) || '', quotaLimit: c.quota_limit || 0, requireExactQuota: (c.require_exact_quota === 1), sortOrder: c.sort_order }))
      });
    }
    res.json({ status: 'success', rules: result });
  } catch (e) { res.json({ status: 'error', message: safeString(e.message) }); }
});

// ─── deletePubMeritRule ───
router.post('/deletePubMeritRule', async (req, res) => {
  try {
    const admin = await adminInfoModel.getByOpenid(req.openid);
    if (!admin) return res.json({ status: 'forbidden', message: '无管理权限' });
    const ruleId = safeString(req.body.ruleId);
    if (!ruleId) return res.json({ status: 'invalid_params', message: '请提供规则ID' });
    const orgId = await getCurrentOrgId();
    const [clauses] = await pool.query('SELECT id FROM pub_merit_rule_clauses WHERE rule_id=?', [ruleId]);
    for (const c of clauses) {
      await pool.query('DELETE FROM merit_list_designations WHERE clause_id=?', [c.id]);
    }
    await pool.query('DELETE FROM pub_merit_rule_clauses WHERE rule_id=? AND org_id=?', [ruleId, orgId]);
    await pool.query('DELETE FROM pub_merit_rules WHERE id=? AND org_id=?', [ruleId, orgId]);
    res.json({ status: 'success', message: '已删除' });
  } catch (e) { res.json({ status: 'error', message: safeString(e.message) }); }
});

module.exports = router;
