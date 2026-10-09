const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { retainWebAssets } = require('../../scripts/retain-web-assets');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whusu-web-assets-'));
try {
  let previous;
  for (let index = 0; index < 8; index++) {
    const current = path.join(root, String(index));
    fs.mkdirSync(path.join(current, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(current, 'assets', `page-${index}.js`), `version${index}`);
    fs.writeFileSync(path.join(current, 'index.html'), `index${index}`);
    const manifest = retainWebAssets(current, previous);
    assert.equal(manifest.generations.length, Math.min(index, 5));
    assert.equal(fs.readFileSync(path.join(current, 'index.html'), 'utf8'), `index${index}`);
    for (let older = Math.max(0, index - 5); older <= index; older++) assert(fs.existsSync(path.join(current, 'assets', `page-${older}.js`)));
    if (index > 5) assert(!fs.existsSync(path.join(current, 'assets', `page-${index - 6}.js`)));
    previous = current;
  }
  const bad = path.join(root, 'bad');
  fs.mkdirSync(bad);
  const legacy = path.join(root, 'legacy');
  fs.mkdirSync(path.join(legacy, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(legacy, 'assets', 'legacy.js'), 'legacy');
  const initial = retainWebAssets(bad, legacy, [path.join(root, '0')]);
  assert.equal(initial.generations.length, 2);
  assert(fs.existsSync(path.join(bad, 'assets', 'page-0.js')));
  assert(fs.existsSync(path.join(bad, 'assets', 'legacy.js')));
  fs.writeFileSync(path.join(previous, '.release-assets.json'), JSON.stringify({ owned: ['assets/../../secret'], generations: [] }));
  assert.throws(() => retainWebAssets(bad, previous), /路径无效/);
  const deploy = fs.readFileSync(path.resolve(__dirname, '../scripts/deployProduction.sh'), 'utf8');
  assert(deploy.indexOf('retain-web-assets.js') > deploy.indexOf('run build'));
  assert(deploy.indexOf('retain-web-assets.js') < deploy.indexOf('chmod 711 "$NEW_RELEASE"'));
  console.log('网页静态保留：8 次连续发布、5 代上限、入口不覆盖、路径越界拒绝通过');
} finally {
  // 只清理由本测试刚创建的独立临时目录。
  const resolved = path.resolve(root);
  assert(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('whusu-web-assets-'));
  fs.rmSync(resolved, { recursive: true, force: true });
}
