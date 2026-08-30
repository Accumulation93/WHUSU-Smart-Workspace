'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const profileSource = fs.readFileSync(path.join(root, 'src/core/routes/hrProfile.js'), 'utf8');
const importModelSource = fs.readFileSync(path.join(root, 'src/core/models/hrTableImport.js'), 'utf8');
const hrRouteSource = fs.readFileSync(path.join(root, 'src/core/routes/hr.js'), 'utf8');

function routeSegment(source, routeName) {
  const start = source.indexOf(`router.post('/${routeName}'`);
  assert(start >= 0, `缺少路由 ${routeName}`);
  const next = source.indexOf('\nrouter.', start + 1);
  return source.slice(start, next >= 0 ? next : source.length);
}

['submitUserHrProfile', 'reviewHrProfileChange', 'saveHrPersonFull'].forEach((routeName) => {
  const segment = routeSegment(profileSource, routeName);
  const transaction = segment.indexOf('withTransaction');
  const barrier = segment.indexOf('lockActiveBusinessSubjects', transaction);
  const firstProfileWrite = [
    segment.indexOf('profileRecordModel.create', transaction),
    segment.indexOf('profileRecordModel.update', transaction),
    segment.indexOf('profileValueModel.create', transaction),
    segment.indexOf('profileValueModel.remove', transaction),
    segment.indexOf('profileReviewEventModel.create', transaction)
  ].filter((index) => index >= 0).sort((left, right) => left - right)[0];
  assert(transaction >= 0 && barrier > transaction, `${routeName} 缺少事务内人员屏障`);
  assert(firstProfileWrite === undefined || barrier < firstProfileWrite, `${routeName} 在人员屏障前写入资料`);
});

const structuredTransaction = importModelSource.indexOf('await conn.beginTransaction()');
const structuredBarrier = importModelSource.indexOf('lockExistingImportSubjects', structuredTransaction);
const structuredWrite = importModelSource.indexOf('INSERT INTO departments', structuredTransaction);
assert(structuredBarrier > structuredTransaction && structuredBarrier < structuredWrite);

const retiredCsvRoute = routeSegment(hrRouteSource, 'importHrCsv');
assert(/res\.status\(410\)/.test(retiredCsvRoute), '旧 CSV 导入接口必须保持退役');
assert(!/beginTransaction|lockExistingImportSubjects|INSERT\s+INTO/i.test(retiredCsvRoute), '退役 CSV 导入接口不得保留写入副作用');

console.log('人员资料与导入事务屏障顺序契约测试通过');
