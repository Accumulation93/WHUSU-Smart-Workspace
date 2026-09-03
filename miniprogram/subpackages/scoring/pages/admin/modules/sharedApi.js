// Shared API wrapper — provides callCloud() to all behaviors via this.callCloud()
// Must be registered FIRST in the behaviors array
const { callFunction } = require('../../../../../utils/api');
const orgSession = require('../../../../../utils/orgSession');

module.exports = Behavior({
  methods: {
    callCloud(name, data = {}, requestOptions = {}) {
      const organizationSnapshot = orgSession.getSnapshot();
      return callFunction({ name, data, timeout: requestOptions.timeout }).then((result) => {
        if (!orgSession.isCurrent(organizationSnapshot)) {
          return Promise.reject({ status: 'request_cancelled', silent: true });
        }
        if (result.status === 'error' && result.message) {
          console.error('[callCloud] API error:', name, 'message:', result.message);
        }
        return result;
      }).catch((err) => {
        if (!err || !err.silent) console.error('[callCloud] Request failed:', name, JSON.stringify(err));
        return Promise.reject(err);
      });
    }
  }
});
