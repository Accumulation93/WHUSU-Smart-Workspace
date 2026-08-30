'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function readWorkspaceFile(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, '../..', relativePath), 'utf8');
}

function assertSingleAtomicCall(source, methodName, endpointName) {
  const methodStart = source.indexOf(`async ${methodName}(`);
  assert(methodStart >= 0, `缺少前端批量方法：${methodName}`);
  const nextMethod = source.indexOf('\n    async ', methodStart + 1);
  const methodSource = source.slice(methodStart, nextMethod >= 0 ? nextMethod : source.length);
  const endpointCalls = methodSource.match(new RegExp(`callCloud\\('${endpointName}'`, 'g')) || [];
  assert.strictEqual(endpointCalls.length, 1, `${methodName} 必须且只能调用一次 ${endpointName}`);
  assert(!/for\s*\([\s\S]*?callCloud\('(save|delete)/.test(methodSource), `${methodName} 不得循环调用单条写接口`);
}

const ruleBehavior = readWorkspaceFile('miniprogram/subpackages/scoring/pages/admin/modules/ruleBehavior.js');
const publicationBehavior = readWorkspaceFile('miniprogram/subpackages/scoring/pages/admin/modules/publicationBehavior.js');
const hrInfoBehavior = readWorkspaceFile('miniprogram/subpackages/scoring/pages/admin/modules/hrInfoBehavior.js');
const adminWxml = readWorkspaceFile('miniprogram/subpackages/scoring/pages/admin/admin.wxml');

assertSingleAtomicCall(ruleBehavior, 'applyClausesToSelectedRules', 'batchSaveRateRules');
assertSingleAtomicCall(publicationBehavior, 'batchSavePubViewRules', 'batchSavePubViewRules');
assertSingleAtomicCall(publicationBehavior, 'batchSavePubMeritRules', 'batchSavePubMeritRules');
assertSingleAtomicCall(publicationBehavior, 'batchDeletePubViewRules', 'batchDeletePubViewRules');
assertSingleAtomicCall(publicationBehavior, 'batchDeletePubMeritRules', 'batchDeletePubMeritRules');

assert(hrInfoBehavior.includes('const HR_PROFILE_RENDER_BATCH_SIZE = 50;'), '千人目录必须分批进入视图层');
assert(hrInfoBehavior.includes("updates['hrProfileRows[' + (start + index) + ']'] = row;"), '加载更多必须增量传输新卡片');
assert(!hrInfoBehavior.includes('hrProfileRows: this._hrProfileFilteredRows.map(toHrProfileListRow)'), '筛选后不得把完整千人目录传给视图层');
assert(adminWxml.includes('bindscrolltolower="loadMoreHrProfileRows"'), '成员目录滚动到底必须加载下一批成员');

console.log('评分前端批量接口与千人目录增量渲染契约通过');
