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
 * 全站统一顶栏：微信原生导航栏不允许小程序插入控件，也没法与门户的玻璃风格一致，
 * 所以每个页面显式声明 navigationStyle: custom，并在模板里渲染标准件 ui-navbar。
 * app.json 的 window.navigationStyle 保持 default，只作为兜底；任何页面漏改都会被下面拦住。
 */
const NAVBAR_COMPONENT = '/components/ui-navbar/ui-navbar';
const NAVBAR_TITLE_BINDING = /<ui-navbar\b[^>]*\btitle="\{\{\s*[A-Za-z_$][\w$]*(?:\.[\w$]+)*\s*\}\}"/;
/*
 * app.wxss 的全局 .page 就是 min-height: 100vh；顶栏自绘后 100vh 变成整屏高度，
 * 页面容器必须按顶栏高度补偿，否则页面底部会多出一段能拖动的空白。
 */
const NAVBAR_HEIGHT_COMPENSATION = /(?:min-height|height):\s*calc\(100vh\s*-\s*\{\{\s*navTopPx\s*\}\}px\)/;

assert.strictEqual(
  app.window && app.window.navigationStyle,
  'default',
  'app.json 的 window.navigationStyle 必须保持显式 default，页面逐个声明 custom'
);
assert.ok(
  !app.usingComponents || !app.usingComponents['workspace-navigation'],
  '不得重新注册全局自定义导航组件，统一使用 ui-navbar'
);

routes.forEach((route) => {
  const jsonPath = path.join(miniRoot, `${route}.json`);
  const pageConfig = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  assert.strictEqual(pageConfig.navigationStyle, 'custom', `${route} 必须声明自定义导航，才能渲染统一顶栏`);

  const registered = (pageConfig.usingComponents || {})['ui-navbar'];
  assert.strictEqual(registered, NAVBAR_COMPONENT, `${route} 必须注册统一顶栏组件 ui-navbar`);

  const wxml = fs.readFileSync(path.join(miniRoot, `${route}.wxml`), 'utf8');
  assert.ok(NAVBAR_TITLE_BINDING.test(wxml), `${route} 必须渲染 ui-navbar 并绑定语言系统的标题`);
  assert.ok(!/<workspace-navigation\b/.test(wxml), `${route} 不得渲染旧的自定义导航组件`);
  assert.ok(NAVBAR_HEIGHT_COMPENSATION.test(wxml), `${route} 最外层容器必须按顶栏高度补偿 100vh，避免底部多出空白`);

  const pageScript = fs.readFileSync(path.join(miniRoot, `${route}.js`), 'utf8');
  assert.ok(/utils\/navigationBarMetrics/.test(pageScript), `${route} 必须从 navigationBarMetrics 取顶栏高度`);
  assert.ok(/navTopPx\s*:/.test(pageScript), `${route} 必须在 data 里维护 navTopPx`);
});

console.log(`导航测试通过：${routes.length} 个页面全部使用统一自绘顶栏 ui-navbar。`);
