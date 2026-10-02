const orgSession = require('./orgSession');
const { requestOptionalDeviceMetadata } = require('./api');
const { getDeviceIdentity } = require('./deviceIdentity');
let lastReportedToken = '';
let lastReportedAt = 0;

// 首报只等 150ms 就发出：设备识别码越早落到会话上，
// “登录设备”列表越不会出现识别不出设备的会话。
// 仍然是“发一次就结束”，失败不重放，保证可选上报绝不影响登录链路。
const FIRST_REPORT_DELAY_MS = 150;

function schedule(page, delayMs, onReported) {
  // 起跑时锁定会话快照：等待期间换了账号或角色，这次上报就必须作废。
  const snapshot = orgSession.getSnapshot();
  page._deviceMetadataTimer = setTimeout(function() {
    page._deviceMetadataTimer = null;
    report(page, snapshot, onReported);
  }, delayMs);
}

function report(page, snapshot, onReported) {
  if (!page._isPageVisible || orgSession.getSnapshot().token !== snapshot.token) return;
  let device;
  try { device = getDeviceIdentity(); } catch (_) { return; }
  if (orgSession.getSnapshot().token !== snapshot.token) return;
  try {
    page._deviceMetadataTask = requestOptionalDeviceMetadata({
      session: snapshot,
      device: device,
      success: function(response) {
        if (orgSession.getSnapshot().token !== snapshot.token
          || response.statusCode !== 200
          || !response.data || response.data.status !== 'success') return;
        lastReportedToken = snapshot.token;
        lastReportedAt = Date.now();
        if (page._isPageVisible && typeof onReported === 'function') {
          try { onReported(); } catch (_) { /* 可选回读失败不干扰页面。 */ }
        }
      },
      fail: function() {}
    });
  } catch (_) { /* 设备展示失败不影响任何业务或登录。 */ }
}

// 仅门户完成登录后执行；与认证请求、自动重试、登录跳转完全隔离。
function start(page, onReported) {
  cancel(page);
  const snapshot = orgSession.getSnapshot();
  if (!snapshot.token || (snapshot.token === lastReportedToken && Date.now() - lastReportedAt < 60000)) return;
  schedule(page, FIRST_REPORT_DELAY_MS, onReported);
}

function cancel(page) {
  if (page._deviceMetadataTimer) clearTimeout(page._deviceMetadataTimer);
  page._deviceMetadataTimer = null;
  const task = page._deviceMetadataTask;
  page._deviceMetadataTask = null;
  if (task && typeof task.abort === 'function') { try { task.abort(); } catch (_) {} }
}
module.exports = { start, cancel };
