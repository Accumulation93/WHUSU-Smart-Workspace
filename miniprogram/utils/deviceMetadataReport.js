const orgSession = require('./orgSession');
const { requestOptionalDeviceMetadata } = require('./api');
const { getDeviceIdentity } = require('./deviceIdentity');
let lastReportedToken = '';
let lastReportedAt = 0;

// 仅门户完成登录后执行；与认证请求、自动重试、登录跳转完全隔离。
function start(page, onReported) {
  cancel(page);
  const snapshot = orgSession.getSnapshot();
  if (!snapshot.token || (snapshot.token === lastReportedToken && Date.now() - lastReportedAt < 60000)) return;
  page._deviceMetadataTimer = setTimeout(function() {
    page._deviceMetadataTimer = null;
    if (!page._isPageVisible || orgSession.getSnapshot().token !== snapshot.token) return;
    let device;
    try { device = getDeviceIdentity(); } catch (_) { return; }
    if (orgSession.getSnapshot().token !== snapshot.token) return;
    try {
      page._deviceMetadataTask = requestOptionalDeviceMetadata({
        session: snapshot,
        device: device,
        success: function(response) {
          if (orgSession.getSnapshot().token === snapshot.token && response.statusCode === 200
            && response.data && response.data.status === 'success') {
            lastReportedToken = snapshot.token;
            lastReportedAt = Date.now();
            if (page._isPageVisible && typeof onReported === 'function') {
              try { onReported(); } catch (_) { /* 可选回读失败不干扰门户。 */ }
            }
          }
        },
        fail: function() {}
      });
    } catch (_) { /* 设备展示失败不影响任何业务或登录。 */ }
  }, 500);
}

function cancel(page) {
  if (page._deviceMetadataTimer) clearTimeout(page._deviceMetadataTimer);
  page._deviceMetadataTimer = null;
  const task = page._deviceMetadataTask;
  page._deviceMetadataTask = null;
  if (task && typeof task.abort === 'function') { try { task.abort(); } catch (_) {} }
}
module.exports = { start, cancel };
