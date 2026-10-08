'use strict';
// 兼容入口：字段标题匹配的副本同步已并入统一清单 scripts/sync-shared-modules.js。
const { syncModule } = require('./sync-shared-modules');

syncModule('shared/hrFieldMatching.js', process.argv.includes('--write'));
console.log('字段匹配运行时副本一致');
