'use strict';
const { hmac } = require('./identityCrypto');
// 只关联同组织人员，不公开自然人主键，也不依据姓名或学号猜测。
function personReference(orgId, personId) {
  return orgId && personId ? hmac(JSON.stringify(['person-navigation-v1', orgId, personId])) : '';
}
module.exports = { personReference };
