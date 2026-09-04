const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(
  path.join(root, 'miniprogram', 'subpackages', 'workspace', 'pages', 'home', 'home.js'),
  'utf8'
);

assert.match(
  source,
  /const preserveVisibleTargets = settings\.preserveExisting && this\.data\.targetList\.length > 0;/,
  '返回评分目录时必须识别已经可见的被评分人列表'
);
assert.match(
  source,
  /targetsLoading:\s*!preserveVisibleTargets/,
  '后台刷新已有目录时不得重新展示整页加载态'
);
assert.match(
  source,
  /if \(!preserveVisibleTargets\) \{/,
  '只有现有目录无效时才允许清空列表'
);

console.log('评分工作台返回刷新测试通过');
