'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sync, graph, requires } = require('../../scripts/miniprogram-package-resources');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whusu-package-resources-'));
function put(file, value) {
  const full = path.join(root, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, typeof value === 'string' ? value : JSON.stringify(value));
}
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
try {
  put('scripts/.fixture', '');
  put('project.config.json', { packOptions: { ignore: [{ type: 'folder', value: 'tests' }], include: [] } });
  put('miniprogram/app.json', { pages: ['home'], subPackages: [{ root: 'subpackages/a', pages: ['page'] }, { root: 'subpackages/b', pages: ['page'] }] });
  put('miniprogram/app.js', "require('./utils/session');");
  put('miniprogram/home.js', 'Page({});');
  put('miniprogram/utils/session.js', 'module.exports = {};');
  put('miniprogram/utils/report.js', "const session = require('./session'); const copy = require('../locales/zh-CN/report'); module.exports = {session, copy};");
  put('miniprogram/locales/zh-CN/report.js', "module.exports = { title: '报告' };");
  put('miniprogram/locales/zh-CN/unused.js', "module.exports = { title: '旧文案' };");
  put('miniprogram/components/chooser/chooser.js', "require('../../utils/report'); Component({});");
  put('miniprogram/components/chooser/chooser.json', { component: true });
  put('miniprogram/components/chooser/chooser.wxml', '<view>fixture</view>');
  put('miniprogram/components/chooser/chooser.wxss', '.fixture {display:block;}');
  for (const pkg of ['a', 'b']) {
    put('miniprogram/subpackages/' + pkg + '/page.js', "require('../../utils/report'); Page({});");
    put('miniprogram/subpackages/' + pkg + '/page.json', { usingComponents: { chooser: '/components/chooser/chooser' } });
  }
  put('miniprogram/tests/ignored.js', "require('nonexistent');");
  assert.equal(requires("// require('./fake')\nconst text = \"require('./fake')\"; require('./real');").length, 1);
  assert.throws(() => requires('require(variable);'), /静态/);
  assert.equal(sync(root, true).unusedJs, 0);
  assert.equal(sync(root).unusedJs, 0);
  const packed = graph(root, true);
  assert.ok(!packed.files.includes('locales/zh-CN/unused.js'));
  assert.ok(!packed.files.includes('utils/report.js'));
  assert.ok(packed.files.includes('utils/session.js'));
  const replica = 'miniprogram/subpackages/a/package-resources/utils/report.js';
  const original = read(replica);
  assert.match(original, /\.\.\/\.\.\/\.\.\/\.\.\/utils\/session/);
  assert.equal(read('miniprogram/subpackages/a/package-resources/locales/zh-CN/report.js'), read('miniprogram/locales/zh-CN/report.js'));
  put(replica, original + '\nmodule.exports.tampered = true;');
  assert.throws(() => sync(root), /副本不同步/);
  sync(root, true);
  // 主包开始真正使用公共资源时，撤销排除并恢复主包引用，不生成无意义 require。
  put('miniprogram/home.js', "require('./utils/report'); Page({});");
  sync(root, true);
  assert.ok(graph(root, true).files.includes('utils/report.js'));
  assert.ok(!fs.existsSync(path.join(root, replica)));
  put('miniprogram/subpackages/a/page.js', "require('../b/page'); Page({});");
  assert.throws(() => sync(root, true), /跨分包/);
  console.log('资源分包：真实入口、无效引用、共享副本、单一语言源、篡改拒绝及主包归属变化通过');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
