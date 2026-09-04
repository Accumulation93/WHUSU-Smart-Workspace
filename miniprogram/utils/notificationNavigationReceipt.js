const RECEIPT_KEY = '__pendingNotificationNavigationReceipt';
const RECEIPT_TTL_MS = 2 * 60 * 1000;
const CLOCK_SKEW_MS = 10 * 1000;

function appGlobalData() {
  if (typeof getApp !== 'function') return null;
  try {
    const app = getApp();
    if (!app) return null;
    if (!app.globalData || typeof app.globalData !== 'object') app.globalData = {};
    return app.globalData;
  } catch (_) {
    return null;
  }
}

function stage(item, snapshot) {
  const source = item || {};
  const session = snapshot || {};
  const data = appGlobalData();
  if (!data || !source.id || !source.organizationId || !source.targetUrl || !session.contextId) {
    return false;
  }
  data[RECEIPT_KEY] = {
    id: String(source.id),
    organizationId: String(source.organizationId),
    targetUrl: String(source.targetUrl),
    contextId: String(session.contextId),
    role: String(session.role || ''),
    stagedAt: Date.now()
  };
  return true;
}

function clear(expectedId) {
  const data = appGlobalData();
  if (!data || !data[RECEIPT_KEY]) return;
  if (expectedId && String(data[RECEIPT_KEY].id || '') !== String(expectedId)) return;
  delete data[RECEIPT_KEY];
}

function take(targetUrl, snapshot) {
  const data = appGlobalData();
  if (!data || !data[RECEIPT_KEY]) return null;
  const receipt = data[RECEIPT_KEY];
  delete data[RECEIPT_KEY];
  const session = snapshot || {};
  const stagedAt = Number(receipt.stagedAt);
  const age = Date.now() - stagedAt;
  if (!Number.isFinite(stagedAt) || age < -CLOCK_SKEW_MS || age > RECEIPT_TTL_MS) return null;
  if (String(receipt.targetUrl || '') !== String(targetUrl || '')) return null;
  if (String(receipt.contextId || '') !== String(session.contextId || '')) return null;
  if (String(receipt.organizationId || '') !== String(session.orgId || '')) return null;
  if (receipt.role && String(receipt.role) !== String(session.role || '')) return null;
  return receipt;
}

module.exports = { stage, clear, take };
