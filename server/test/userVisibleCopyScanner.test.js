'use strict';
const cp = require('node:child_process');
const path = require('node:path');
cp.execFileSync(process.execPath, ['scripts/user-visible-copy-audit.js', '--self-test', '--strict-guidance'], {
  cwd: path.resolve(__dirname, '../..'), stdio: 'inherit', windowsHide: true
});
