'use strict';
// 生成独立运行时副本，避免服务端与小程序互相依赖部署目录。
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'shared/hrFieldMatching.js'), 'utf8').replace(/\r\n/g, '\n');
const targets = ['miniprogram/utils/hrFieldMatching.js', 'server/src/core/services/hrFieldMatching.js'];
targets.forEach((file) => {
  const target = path.join(root, file);
  if (process.argv.includes('--write')) fs.writeFileSync(target, source);
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') !== source) {
    throw new Error('字段匹配副本不同步：' + file);
  }
});
console.log('字段匹配运行时副本一致');
