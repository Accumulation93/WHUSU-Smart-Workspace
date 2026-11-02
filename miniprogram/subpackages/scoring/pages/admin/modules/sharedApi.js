// Shared API wrapper — provides callCloud() to all behaviors via this.callCloud()
// Must be registered FIRST in the behaviors array
const { callFunction } = require('../../../../../utils/api');
const orgSession = require('../../../../../utils/orgSession');

module.exports = Behavior({
  methods: {
    callCloud(name, data = {}, requestOptions = {}) {
      if (this._pageVisible === false) return Promise.reject({ status: 'request_cancelled', silent: true });
      const visibilityGeneration = this._pageVisibilityGeneration;
      const organizationSnapshot = orgSession.getSnapshot();
      return callFunction({ name, data, timeout: requestOptions.timeout }).then((result) => {
        if (this._pageVisible === false || this._pageVisibilityGeneration !== visibilityGeneration || !orgSession.isCurrent(organizationSnapshot)) {
          return Promise.reject({ status: 'request_cancelled', silent: true });
        }
        if (result.status === 'error' && result.message) {
        }
        return result;
      }).catch((err) => {
        return Promise.reject(err);
      });
    }
  }
});
