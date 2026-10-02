'use strict';
// 仅在独立测试库中模拟两个 API 进程；只经父子 IPC 返回版本，不输出连接凭据。
if (!String(process.env.DB_NAME || '').startsWith('whusu_perf_integration_')) throw new Error('ISOLATED_DATABASE_REQUIRED');
const pool = require('../../src/config/db');
const versions = require('../../src/core/models/cacheVersions');
process.on('message', async command => {
  try {
    if (command === 'close') { await pool.end(); process.disconnect(); return; }
    process.send({ version: await versions.read(['perf-a']) });
  } catch (error) { process.send({ error: error.code || 'PROBE_FAILED' }); }
});
