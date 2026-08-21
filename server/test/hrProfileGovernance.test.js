const assert = require('assert');
const fs = require('fs');
const path = require('path');

const routeSource = fs.readFileSync(
  path.join(__dirname, '../src/core/routes/hrProfile.js'),
  'utf8'
);
const recordModelSource = fs.readFileSync(
  path.join(__dirname, '../src/core/models/hrProfileRecord.js'),
  'utf8'
);
const valueModelSource = fs.readFileSync(
  path.join(__dirname, '../src/core/models/hrProfileValue.js'),
  'utf8'
);

const reviewStart = routeSource.indexOf("router.post('/reviewHrProfileChange'");
const maintainStart = routeSource.indexOf("router.post('/saveHrPersonFull'");
assert(reviewStart >= 0 && maintainStart > reviewStart, '应保留资料审核与维护两条独立接口');

const reviewSource = routeSource.slice(reviewStart, maintainStart);
const maintainSource = routeSource.slice(maintainStart);

assert(reviewSource.includes('pool.withTransaction'), '审核读写必须位于同一事务');
assert(reviewSource.includes('getByHrId(hrRecord.id, connection, orgId, true)'), '审核必须锁定资料记录');
assert(reviewSource.includes("safeString(record.audit_status) !== 'pending'"), '仅待审核记录可处理');
assert(reviewSource.includes('notificationError'), '通知失败不能把已提交事务误报为审核失败');
assert(recordModelSource.includes("lock ? ' FOR UPDATE' : ''"), '资料记录模型必须支持行锁');
assert(valueModelSource.includes("lock ? ' FOR UPDATE' : ''"), '资料值模型必须支持行锁');

assert(maintainSource.includes('preservePending'), '维护生效资料时必须识别并保留待审提交');
assert(!maintainSource.includes(
  'removeByRecordIdAndPendingFields(\n            existing.id, 1'
), '维护接口不得删除待审资料');
assert(maintainSource.includes("auditStatus: preservePending ? 'pending' : 'approved'"), '存在待审提交时状态必须保持 pending');

console.log('人事资料审核并发与待审保留契约测试通过');
