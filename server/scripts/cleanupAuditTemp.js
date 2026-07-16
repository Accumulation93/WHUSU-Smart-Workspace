require('dotenv').config();
const fs = require('fs');
const path = require('path');

const tempDir = path.resolve(__dirname, '../uploads/audit/_tmp');
const expireBefore = Date.now() - 24 * 60 * 60 * 1000;
let removed = 0;

if (fs.existsSync(tempDir)) {
  for (const name of fs.readdirSync(tempDir)) {
    const filePath = path.join(tempDir, name);
    const stat = fs.statSync(filePath);
    if (stat.isFile() && stat.mtimeMs < expireBefore) {
      fs.unlinkSync(filePath);
      removed += 1;
    }
  }
}

console.log('审核临时文件清理完成：' + removed + ' 个');
