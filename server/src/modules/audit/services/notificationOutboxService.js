const localeCopy = require('../../../locales/zh-CN/generated/modules/audit/services/notificationOutboxService');
const { generateId, safeString } = require('../../../utils/helpers');
const { orgStorage } = require('../../../utils/orgContext');
const notificationModel = require('../models/notification');
const outboxModel = require('../models/notificationOutbox');
const messageDataModel = require('../models/messageData');
const { getUserScoringTask } = require('../../scoring/services/scoringTaskService');
const { logger } = require('../../../utils/logger');
const RECIPIENT_CONCURRENCY = 8;

async function forEachConcurrent(items, concurrency, worker) {
  const source = Array.isArray(items) ? items : [];
  let nextIndex = 0;
  const runners = Array.from(
    { length: Math.min(Math.max(1, concurrency), source.length) },
    async () => {
      while (nextIndex < source.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        await worker(source[currentIndex], currentIndex);
      }
    }
  );
  await Promise.all(runners);
}

function parsePayload(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch (_) { return {}; }
}

async function createForRecipient(job, recipientType, recipientId, payload) {
  const eventKey = job.event_key + ':' + recipientType + ':' + recipientId;
  await notificationModel.create(generateId(), {
    orgId: job.org_id,
    recipientType,
    recipientId,
    eventKey,
    type: payload.type || job.event_type,
    title: payload.title || localeCopy.copy_0f9674b985,
    description: payload.description || '',
    category: payload.category || 'system',
    targetType: payload.targetType || '',
    targetId: payload.targetId || '',
    targetUrl: payload.targetUrl || ''
  });
}

async function processScoringRecipients(job, payload) {
  const users = await messageDataModel.listBoundUsersInOrg(job.org_id);
  await forEachConcurrent(users, RECIPIENT_CONCURRENCY, async (user) => {
    const task = await getUserScoringTask(user, payload.activity || null);
    if (!task || task.pendingCount <= 0) return;
    await createForRecipient(job, 'user', user.id, Object.assign({}, payload, {
      targetId: safeString(task.activity.id),
      description: payload.description || (localeCopy.copy_50fc130639 + task.pendingCount + localeCopy.copy_67a5467bc2)
    }));
  });
}

async function processPublicationRecipients(job, payload) {
  const ids = await messageDataModel.listPublicationRecipients(payload.publicationId, job.org_id);
  await forEachConcurrent(ids, RECIPIENT_CONCURRENCY, id => createForRecipient(job, 'user', id, payload));
}

async function processJob(job) {
  const payload = parsePayload(job.payload_json);
  await orgStorage.run(job.org_id, async () => {
    if (job.event_type === 'score_activity_started' || job.event_type === 'score_deadline_24h') {
      await processScoringRecipients(job, payload);
    } else if (job.event_type === 'score_results_published') {
      await processPublicationRecipients(job, payload);
    } else if (job.recipient_type && job.recipient_id) {
      await createForRecipient(job, job.recipient_type, job.recipient_id, payload);
    } else {
      throw new Error(localeCopy.copy_6d05068b26);
    }
  });
}

async function processBatch(limit) {
  const jobs = await outboxModel.claimBatch(limit);
  let completed = 0;
  for (const job of jobs) {
    try {
      await processJob(job);
      await outboxModel.markDone(job.id);
      completed += 1;
    } catch (error) {
      const failed = await outboxModel.markFailed(job.id, error);
      logger.error('Notification outbox job failed', {
        event: failed.status === 'dead' ? 'notification.dead_letter' : 'notification.retry_scheduled',
        jobId: job.id,
        eventType: job.event_type,
        organizationId: job.org_id,
        attempts: Number(failed.attempts || job.attempts || 0),
        error: error.message
      });
    }
  }
  return { claimed: jobs.length, completed };
}

module.exports = { processBatch, processJob, forEachConcurrent };
