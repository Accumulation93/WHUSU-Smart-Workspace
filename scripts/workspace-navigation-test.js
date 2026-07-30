const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appPath = path.join(root, 'miniprogram', 'app.json');
const app = JSON.parse(fs.readFileSync(appPath, 'utf8'));
const componentSource = fs.readFileSync(
  path.join(root, 'miniprogram', 'components', 'workspace-navigation', 'workspace-navigation.js'),
  'utf8'
);

const routes = [
  ...(app.pages || []),
  ...(app.subPackages || []).flatMap((subpackage) => (
    (subpackage.pages || []).map((page) => `${subpackage.root}/${page}`)
  ))
];

assert.strictEqual(app.window && app.window.navigationStyle, 'custom', '全局导航必须使用自定义安全区布局');
assert.strictEqual(
  app.usingComponents && app.usingComponents['workspace-navigation'],
  '/components/workspace-navigation/workspace-navigation',
  '全局导航组件注册缺失'
);

routes.forEach((route) => {
  const wxmlPath = path.join(root, 'miniprogram', `${route}.wxml`);
  const wxml = fs.readFileSync(wxmlPath, 'utf8');
  const occurrences = (wxml.match(/<workspace-navigation\b/g) || []).length;
  assert.strictEqual(occurrences, 1, `${route} 必须且只能渲染一个统一导航栏`);
  assert.ok(componentSource.includes(`'${route}':`), `${route} 缺少导航标题映射`);
});

assert.match(componentSource, /wx\.getWindowInfo/, '导航栏必须读取窗口安全区');
assert.match(componentSource, /wx\.getMenuButtonBoundingClientRect/, '导航栏必须避让右上角胶囊');
assert.match(componentSource, /navigationBarHeight/, '导航栏必须独立计算标题区高度');

console.log(`统一导航栏测试通过：${routes.length} 个页面均已覆盖。`);
