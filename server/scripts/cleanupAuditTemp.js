'use strict';

process.umask(0o077);

require('dotenv').config();
const {
  createAuditFileStorageMaintenance
} = require('../src/modules/audit/services/auditFileStorageMaintenance');

async function cleanupAuditTemp(options) {
  const config = options || {};
  const maintenance = createAuditFileStorageMaintenance({
    uploadDir: config.uploadDir,
    orphanGraceMs: config.maxAgeMs,
    logger: config.logger || { info() {}, error() {} }
  });
  return maintenance.runOnce(config.now);
}

if (require.main === module) {
  cleanupAuditTemp().then((report) => {
    const removed = report.temporaryOrphansRemoved + report.permanentOrphansRemoved;
    console.log('审核附件一致性治理完成：清理 ' + removed + ' 个孤儿文件，发现 '
      + report.missingReferencedFiles + ' 个数据库引用缺失文件');
  }).catch((error) => {
    console.error('审核附件一致性治理失败：' + error.message);
    process.exitCode = 1;
  });
}

module.exports = { cleanupAuditTemp };
