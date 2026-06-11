// Shared API wrapper — provides callCloud() to all behaviors via this.callCloud()
// Must be registered FIRST in the behaviors array
const { callFunction } = require('../../../../../utils/api');

module.exports = Behavior({
  methods: {
    callCloud(name, data = {}) {
      return new Promise((resolve, reject) => {
        callFunction({
          name,
          data,
          success: (res) => resolve(res.result || {}),
          fail: reject
        });
      });
    }
  }
});
