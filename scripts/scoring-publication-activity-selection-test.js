const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
  path.join(root, 'miniprogram', 'subpackages', 'scoring', 'pages', 'admin', 'modules', 'publicationBehavior.js'),
  'utf8'
);
const adminSource = fs.readFileSync(
  path.join(root, 'miniprogram', 'subpackages', 'scoring', 'pages', 'admin', 'admin.js'),
  'utf8'
);

assert.match(
  source,
  /publicationForm\s*&&\s*this\.data\.publicationForm\.activityId/,
  '历史公示请求必须按界面所选活动判断是否仍然有效'
);
assert.doesNotMatch(
  source,
  /currentActivityId\s*!==\s*activityId/,
  '不得再用全局当前评分活动丢弃历史活动响应'
);
assert.doesNotMatch(
  source + adminSource,
  /savePublication\(true\)/,
  '浏览公示页签或切换历史活动不得静默创建公示配置'
);

console.log('评分公示历史活动选择测试通过');
