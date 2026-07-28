require('dotenv').config();
const pool = require('./src/config/db');
const { verifySchemaContract } = require('./src/utils/schemaContract');
const outboxModel = require('./src/modules/audit/models/notificationOutbox');
const notificationModel = require('./src/modules/audit/models/notification');
const messageDataModel = require('./src/modules/audit/models/messageData');
const outboxService = require('./src/modules/audit/services/notificationOutboxService');
const requestDeduplication = require('./src/utils/requestDeduplication');
const { cleanupAuditTemp } = require('./scripts/cleanupAuditTemp');

const POLL_MS = 60 * 1000;
let running = false;
let timer = null;
let lastMaintenanceDay = '';

function endOfShanghaiDay(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value).slice(0, 10) + 'T23:59:59+08:00');
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);
}

async function enqueueScheduledScoringEvents() {
  const activities = await messageDataModel.listCurrentScoringActivities();
  const now = Date.now();
  for (const activity of activities) {
    const activityId = String(activity.id);
    const orgId = String(activity.org_id);
    await outboxModel.enqueue({
      orgId,
      eventType: 'score_activity_started',
      eventKey: 'score-start:' + activityId,
      payload: {
        type: 'score_activity_started', title: '新的考核评分任务',
        description: '当前考核活动已开始，请及时完成评分。', category: 'scoring',
        targetType: 'score_activity', targetId: activityId, targetUrl: '/pages/home/home?subApp=scoring',
        activity
      }
    });
    const dueAt = endOfShanghaiDay(activity.end_date);
    if (dueAt && dueAt.getTime() > now && dueAt.getTime() - now <= 24 * 60 * 60 * 1000) {
      await outboxModel.enqueue({
        orgId,
        eventType: 'score_deadline_24h',
        eventKey: 'score-deadline-24h:' + activityId,
        payload: {
          type: 'score_deadline_24h', title: '考核评分即将截止',
          description: '距离评分截止不足 24 小时，请尽快完成剩余任务。', category: 'scoring',
          targetType: 'score_activity', targetId: activityId, targetUrl: '/pages/home/home?subApp=scoring',
          activity
        }
      });
    }
  }
}

async function tick() {
  if (running) return;
  running = true;
  try {
    await enqueueScheduledScoringEvents();
    await outboxService.processBatch(50);
    const now = new Date();
    const maintenanceDay = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-');
    if (now.getHours() === 3 && now.getMinutes() < 5 && lastMaintenanceDay !== maintenanceDay) {
      await notificationModel.cleanupOld(30);
      await outboxModel.cleanupDone(30);
      await outboxModel.cleanupDead(90);
      await requestDeduplication.cleanupOld(pool, { retentionDays: 90, batchSize: 500, maxBatches: 20 });
      cleanupAuditTemp({ maxAgeMs: 24 * 60 * 60 * 1000 });
      lastMaintenanceDay = maintenanceDay;
    }
  } catch (error) {
    console.error('[notification-worker] tick failed:', error);
  } finally {
    running = false;
  }
}

async function start() {
  await pool.query('SELECT 1');
  await verifySchemaContract(pool);
  await tick();
  timer = setInterval(tick, POLL_MS);
  console.log('[notification-worker] started');
}

async function shutdown() {
  if (timer) clearInterval(timer);
  while (running) await new Promise((resolve) => setTimeout(resolve, 100));
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
start().catch((error) => {
  console.error('[notification-worker] start failed:', error);
  process.exit(1);
});
