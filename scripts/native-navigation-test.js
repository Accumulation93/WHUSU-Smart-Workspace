const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const miniRoot = path.join(root, 'miniprogram');
const app = JSON.parse(fs.readFileSync(path.join(miniRoot, 'app.json'), 'utf8'));
const routes = [
  ...(app.pages || []),
  ...(app.subPackages || []).flatMap((subpackage) => (
    (subpackage.pages || []).map((page) => `${subpackage.root}/${page}`)
  ))
];

assert.strictEqual(
  app.window && app.window.navigationStyle,
  'default',
  '必须显式启用微信默认导航，不能只依赖删除 custom 后的隐式回退'
);
assert.ok(
  !app.usingComponents || !app.usingComponents['workspace-navigation'],
  '不得重新注册全局自定义导航组件'
);

routes.forEach((route) => {
  const jsonPath = path.join(miniRoot, `${route}.json`);
  const pageConfig = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  assert.notStrictEqual(pageConfig.navigationStyle, 'custom', `${route} 不得隐藏微信默认导航`);

  const wxml = fs.readFileSync(path.join(miniRoot, `${route}.wxml`), 'utf8');
  assert.ok(!/<workspace-navigation\b/.test(wxml), `${route} 不得渲染自定义导航组件`);
});

console.log(`微信默认导航测试通过：${routes.length} 个页面均已覆盖。`);
