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

/*
 * 全站仍以微信默认导航为准；门户页是唯一例外——它的顶栏自己画，
 * 这样才能把“回到登录页”放进顶栏（原生导航栏不允许小程序插入按钮）。
 */
const CUSTOM_NAV_ROUTES = {
  'subpackages/main/pages/portal/portal': true
};

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
  if (CUSTOM_NAV_ROUTES[route]) {
    assert.strictEqual(pageConfig.navigationStyle, 'custom', `${route} 作为自绘顶栏页面必须显式声明自定义导航`);
  } else {
    assert.notStrictEqual(pageConfig.navigationStyle, 'custom', `${route} 不得隐藏微信默认导航`);
  }

  const wxml = fs.readFileSync(path.join(miniRoot, `${route}.wxml`), 'utf8');
  assert.ok(!/<workspace-navigation\b/.test(wxml), `${route} 不得渲染自定义导航组件`);
});

assert.ok(
  Object.keys(CUSTOM_NAV_ROUTES).every((route) => routes.indexOf(route) >= 0),
  '自绘顶栏例外必须指向真实存在的页面'
);
console.log(`导航测试通过：${routes.length} 个页面已覆盖，其中 ${Object.keys(CUSTOM_NAV_ROUTES).length} 个页面使用自绘顶栏。`);
