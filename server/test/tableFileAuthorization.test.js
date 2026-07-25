'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

for (const fileName of ['buildTableFile.js', 'parseTableFile.js']) {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../src/core/routes', fileName),
    'utf8'
  );
  assert(source.includes('!req.openid || !req.admin'), `${fileName} 必须使用权限中间件注入的管理员主体`);
  assert(!source.includes('req.role'), `${fileName} 不得读取从未注入的 req.role`);
}

console.log('表格解析与生成管理员授权契约测试通过');
