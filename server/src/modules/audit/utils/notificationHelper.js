const pool = require('../../../config/db');
const { generateId, safeString } = require('../../../utils/helpers');
const { getCurrentOrgId } = require('../../../utils/orgContext');
const notificationModel = require('../models/notification');

// Reuse condition-matching logic from submissionStepModel
const submissionStepModel = require('../models/auditSubmissionStep');
const submissionModel = require('../models/auditSubmission');

/**
 * Create a notification for a submission status change (approved/rejected).
 * Used to notify the submitter when their submission is fully approved or rejected.
 *
 * @param {object} submission — submission row
 * @param {string} submitterHrId
 * @param {object} opts — { type, title, description, targetUrl }
 */
async function createSubmissionStatusNotification(submission, submitterHrId, opts) {
  const { type, title, description, targetUrl } = opts;
  const id = generateId();
  try {
    await notificationModel.create(id, {
      hrId: submitterHrId,
      type,
      title,
      description,
      category: 'audit',
      targetType: 'submission',
      targetId: submission.id,
      targetUrl
    });
  } catch (e) {
    console.error('[notificationHelper] createSubmissionStatusNotification failed:', e.message);
  }
}

/**
 * Create pending_approval notifications for all eligible approvers of a given step.
 *
 * Logic mirrors listEligibleApprovers (auditUser.js 2445-2588):
 *   1. Get submission + target step (by sort_order, latest round)
 *   2. Parse step conditions (step_conditions_json → template step conditions fallback)
 *   3. Find all matching HR records → create one notification per person
 *   4. Fire-and-forget: errors are logged, never thrown
 *
 * @param {string} submissionId
 * @param {number} stepIndex — sort_order of the target step (1-based)
 * @param {object} [conn] — optional transaction connection
 */
async function createPendingApprovalNotifications(submissionId, stepIndex, conn) {
  try {
    const orgId = await getCurrentOrgId();
    const submission = await submissionModel.getById(submissionId);
    if (!submission) {
      console.error('[notificationHelper] submission not found:', submissionId);
      return;
    }

    // Get the target step
    const allSteps = await submissionStepModel.getBySubmissionId(submissionId);
    const currentRound = Math.max(...allSteps.map(s => s.round || 1));
    const currentRoundSteps = allSteps
      .filter(s => (s.round || 1) === currentRound)
      .sort((a, b) => a.sort_order - b.sort_order);
    const targetStep = currentRoundSteps.find(s => s.sort_order === stepIndex);

    if (!targetStep) {
      console.error('[notificationHelper] target step not found:', submissionId, stepIndex);
      return;
    }

    // Parse conditions
    let conditions = [];
    if (targetStep.step_conditions_json) {
      try { conditions = JSON.parse(targetStep.step_conditions_json); } catch (_) {}
      if (!Array.isArray(conditions)) conditions = [];
    }
    // Fallback: template step conditions
    if (!conditions.length && targetStep.template_step_id) {
      const tplConds = await submissionStepModel.getTemplateStepConditions(targetStep.template_step_id);
      if (tplConds) conditions = tplConds;
    }

    // Load submitter info (for 'own' scope resolution)
    const [subRows] = await pool.query(
      'SELECT id, department_id, identity_id, work_group_id FROM hr_info WHERE id = ? AND org_id = ?',
      [submission.submitted_by, orgId]
    );
    const submitterInfo = subRows[0] || null;

    // Find eligible approvers
    let eligibleHrIds = [];

    if (!conditions.length) {
      // No conditions → all HR members
      const [allHr] = await pool.query(
        'SELECT id FROM hr_info WHERE org_id = ? ORDER BY name',
        [orgId]
      );
      eligibleHrIds = allHr.map(h => h.id);
    } else {
      // Check if effectively all-open
      const { matchesAnyCondition } = submissionStepModel;
      const allAreOpen = conditions.every(c => {
        if (c.conditionType === 'person') return false;
        return (c.departmentScope || 'all') === 'all' &&
               (c.workGroupScope || 'all') === 'all' &&
               (c.identityScope || 'all') === 'all';
      });
      if (allAreOpen) {
        const [allHr] = await pool.query(
          'SELECT id FROM hr_info WHERE org_id = ? ORDER BY name',
          [orgId]
        );
        eligibleHrIds = allHr.map(h => h.id);
      } else {
        // Load all HR and filter with matchesAnyCondition
        const [allHr] = await pool.query(
          'SELECT id, department_id, identity_id, work_group_id FROM hr_info WHERE org_id = ? ORDER BY name',
          [orgId]
        );
        const eligible = allHr.filter(hr => {
          const approver = {
            id: hr.id,
            department_id: hr.department_id || '',
            identity_id: hr.identity_id || '',
            work_group_id: hr.work_group_id || ''
          };
          return matchesAnyCondition(conditions, approver, submitterInfo);
        });
        eligibleHrIds = eligible.map(h => h.id);
      }
    }

    if (!eligibleHrIds.length) {
      console.log('[notificationHelper] no eligible approvers for step', submissionId, stepIndex);
      return;
    }

    // Cap at 200 to prevent excessive notifications
    if (eligibleHrIds.length > 200) {
      console.warn('[notificationHelper] capping eligible approvers from ' + eligibleHrIds.length + ' to 200');
      eligibleHrIds = eligibleHrIds.slice(0, 200);
    }

    // Build notification items
    const title = '新的待审批工单';
    const desc = '「' + (submission.title || submission.submission_number) + '」需要您审批';
    const targetUrl = '/subpackages/audit/pages/submissionDetail/submissionDetail?id=' + submissionId;

    const items = eligibleHrIds.map(hrId => ({
      id: generateId(),
      hrId,
      type: 'pending_approval',
      title,
      description: desc,
      category: 'audit',
      targetType: 'submission',
      targetId: submissionId,
      targetUrl
    }));

    await notificationModel.batchCreate(items, conn);
    console.log('[notificationHelper] created ' + items.length + ' pending_approval notifications for submission ' + submissionId + ' step ' + stepIndex);
  } catch (e) {
    // Fire-and-forget: never throw, just log
    console.error('[notificationHelper] createPendingApprovalNotifications failed:', e.message);
  }
}

/**
 * Unified notification creation function for other modules (venue, scoring, etc.).
 *
 * @param {object} opts — { hrId, type, title, description, category, targetType, targetId, targetUrl }
 *
 * Example (venue booking):
 *   await createNotification({
 *     hrId: adminHrId,
 *     type: 'booking_pending',
 *     title: '新的场地借用申请',
 *     description: '张三申请借用会议室A',
 *     category: 'venue',
 *     targetType: 'booking',
 *     targetId: bookingId,
 *     targetUrl: '/subpackages/venue/pages/pendingVenueApprovals/pendingVenueApprovals?id=' + bookingId
 *   });
 */
async function createNotification(opts) {
  const id = generateId();
  try {
    await notificationModel.create(id, opts);
  } catch (e) {
    console.error('[notificationHelper] createNotification failed:', e.message);
  }
}

module.exports = {
  createSubmissionStatusNotification,
  createPendingApprovalNotifications,
  createNotification
};
