require('dotenv').config();
const fs = require('fs');
const path = require('path');

function cleanupAuditTemp(options) {
  const config = options || {};
  const uploadDir = path.resolve(
    config.uploadDir || process.env.AUDIT_UPLOAD_DIR || path.resolve(__dirname, '../uploads/audit')
  );
  const tempDir = path.join(uploadDir, '_tmp');
  const maxAgeMs = Math.max(
    30 * 60 * 1000,
    Math.min(Number(config.maxAgeMs) || 24 * 60 * 60 * 1000, 7 * 24 * 60 * 60 * 1000)
  );
  const expireBefore = Date.now() - maxAgeMs;
  let removed = 0;

  if (fs.existsSync(tempDir)) {
    for (const name of fs.readdirSync(tempDir)) {
      const filePath = path.join(tempDir, name);
      const stat = fs.lstatSync(filePath);
      if (stat.isFile() && stat.mtimeMs < expireBefore) {
        fs.unlinkSync(filePath);
        removed += 1;
      }
    }
  }
  return removed;
}

if (require.main === module) {
  const removed = cleanupAuditTemp();
  console.log('审核临时文件清理完成：' + removed + ' 个');
}

module.exports = { cleanupAuditTemp };
