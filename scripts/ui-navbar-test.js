const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const componentFile = path.join(root, 'miniprogram/components/ui-navbar/ui-navbar.js');
const componentStyle = fs.readFileSync(path.join(root, 'miniprogram/components/ui-navbar/ui-navbar.wxss'), 'utf8');
const componentMarkup = fs.readFileSync(path.join(root, 'miniprogram/components/ui-navbar/ui-navbar.wxml'), 'utf8');

const BRAND_SUFFIX = ' - WHUSU智慧工作台';

function loadComponent(options) {
  const settings = options || {};
  let definition = null;
  const calls = { navigateBack: [], reLaunch: [], metrics: 0 };
  const sandbox = {
    console,
    module: { exports: {} },
    Component: (value) => { definition = value; return value; },
    wx: {
      navigateBack: (value) => {
        calls.navigateBack.push(value);
        if (settings.navigateBackFails && typeof value.fail === 'function') value.fail({ errMsg: 'navigateBack:fail' });
      },
      reLaunch: (value) => calls.reLaunch.push(value && value.url)
    },
    getCurrentPages: () => new Array(settings.pageDepth || 1).fill({}),
    require: (name) => {
      if (name.indexOf('navigationBarMetrics') >= 0) {
        return {
          getNavigationBarMetrics: () => {
            calls.metrics += 1;
            return settings.metrics || {
              statusBarHeight: 24,
              barHeight: 48,
              capsuleInset: 96,
              totalHeight: 72,
              windowWidth: 375
            };
          }
        };
      }
      if (name.indexOf('locales') >= 0) {
        return { backAria: '返回上一页', refreshing: '正在刷新…', brandName: 'WHUSU智慧工作台' };
      }
      return {};
    },
    String,
    Number,
    Array,
    Object
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(componentFile, 'utf8'), sandbox, { filename: componentFile });
  return { definition, calls };
}

function createInstance(definition, properties) {
  const instance = {
    data: Object.assign({}, definition.data, properties || {}),
    setData(patch) {
      Object.assign(this.data, patch);
    }
  };
  Object.assign(instance, definition.methods);
  return instance;
}

function makeInstance(settings, properties) {
  const loaded = loadComponent(settings || {});
  const instance = createInstance(loaded.definition, properties || {});
  instance.refresh();
  return { instance, calls: loaded.calls, definition: loaded.definition };
}

// —— 顶栏几何 ——
{
  const loaded = loadComponent({});
  const instance = createInstance(loaded.definition);
  instance.refresh();
  assert.strictEqual(loaded.calls.metrics, 1, '顶栏必须向平台量一次状态栏与胶囊几何');
  assert.deepStrictEqual(
    [instance.data.statusBarHeight, instance.data.barHeight, instance.data.capsuleInset, instance.data.totalHeight],
    [24, 48, 96, 72],
    '顶栏几何必须按平台返回值落地'
  );
}

// —— 横竖屏切换后必须重算 ——
{
  const loaded = loadComponent({});
  const instance = createInstance(loaded.definition);
  assert.strictEqual(typeof loaded.definition.pageLifetimes.resize, 'function', '顶栏必须在横竖屏切换后重算');
  assert.strictEqual(typeof loaded.definition.pageLifetimes.show, 'function', '顶栏必须在页面重新显示时重算返回键');
  loaded.definition.pageLifetimes.resize.call(instance);
  assert.strictEqual(loaded.calls.metrics, 1, '重算必须重新量一次几何');
  instance.refreshGeometry();
  assert.strictEqual(loaded.calls.metrics, 2, '页面主动要求时也要能重算');
}

// —— 标题：必须带“ - WHUSU智慧工作台”后缀 ——
{
  const short = makeInstance({}, { title: '场地借用' }).instance;
  assert.strictEqual(short.data.headingText, '场地借用' + BRAND_SUFFIX, '缺后缀的标题要补齐后缀');

  const suffixed = makeInstance({}, { title: '场地借用审批详情' + BRAND_SUFFIX }).instance;
  assert.strictEqual(suffixed.data.headingText, '场地借用审批详情' + BRAND_SUFFIX, '已带后缀的标题不能重复追加');

  const spaced = makeInstance({}, { title: '  应用服务' + BRAND_SUFFIX + '  ' }).instance;
  assert.strictEqual(spaced.data.headingText, '应用服务' + BRAND_SUFFIX, '标题两侧空白要去掉');

  const empty = makeInstance({}, { title: '' }).instance;
  assert.strictEqual(empty.data.headingText, 'WHUSU智慧工作台', '没拿到标题时至少显示应用名，不能是空条');
}

// —— 标题宽度：优先原字号，放得下就居中，放不下才往左借位或降档 ——
{
  const short = makeInstance({ pageDepth: 3 }, { title: '登录', backMode: 'auto', leftMode: 'back' }).instance;
  assert.strictEqual(short.data.headingFontStep, 0, '一般标题保持与微信默认顶栏一致的字号');
  assert.ok(short.data.headingLeft <= 96, '标题不能压到右侧胶囊上');
  assert.ok(short.data.headingLeft >= 56, '标题不能压住左侧返回键');

  const long = makeInstance({ pageDepth: 3 }, { title: '场地借用审批详情', backMode: 'auto', leftMode: 'back' }).instance;
  assert.ok(long.data.headingFontStep > 0, '长标题要降一档字号，保证后缀完整显示');
  assert.ok(long.data.headingLeft >= 56, '长标题要让开左侧返回键，避免压住按钮');

  const centered = makeInstance({ pageDepth: 1 }, { title: '登录', backMode: 'auto', leftMode: 'back' }).instance;
  assert.strictEqual(centered.data.headingLeft, 96, '标题放得下且左侧没有按钮时按屏幕居中');

  const noBack = makeInstance({ pageDepth: 1 }, { title: '场地借用审批详情', backMode: 'auto', leftMode: 'back' }).instance;
  assert.strictEqual(noBack.data.headingLeft, 96, '没有返回键时标题仍按屏幕居中');
  assert.ok(noBack.data.headingFontStep > 0, '没有返回键时同样要降档把标题显示完整');

  const wide = makeInstance({ metrics: { statusBarHeight: 24, barHeight: 48, capsuleInset: 96, totalHeight: 72, windowWidth: 768 } },
    { title: '场地借用审批详情', backMode: 'always', leftMode: 'back' }).instance;
  assert.strictEqual(wide.data.headingFontStep, 0, 'Pad 上宽度够，标题保持原字号');
}

// —— 返回键：默认有上一页才显示，与微信原生一致 ——
{
  const root = makeInstance({ pageDepth: 1 }, { backMode: 'auto', leftMode: 'back' }).instance;
  assert.strictEqual(root.data.showBack, false, '落地页没有上一页，不显示返回键');

  const pushed = makeInstance({ pageDepth: 3 }, { backMode: 'auto', leftMode: 'back' }).instance;
  assert.strictEqual(pushed.data.showBack, true, '有上一页时必须显示返回键');

  pushed.data.backMode = 'never';
  pushed.refresh();
  assert.strictEqual(pushed.data.showBack, false, '显式关闭时不得显示返回键');

  pushed.data.backMode = 'always';
  pushed.refresh();
  assert.strictEqual(pushed.data.showBack, true, '显式要求时总要显示返回键');

  const slotted = makeInstance({ pageDepth: 3 }, { backMode: 'auto', leftMode: 'slot' }).instance;
  assert.strictEqual(slotted.data.showBack, false, '左侧自定义槽位时不得再画返回键');
}

// —— 点返回键：退一页；没有可退时回门户 ——
{
  const pushed = makeInstance({ pageDepth: 2 }, { backMode: 'auto', leftMode: 'back' });
  pushed.instance.onBackTap();
  assert.strictEqual(pushed.calls.navigateBack.length, 1, '点返回键必须退一页');
  assert.strictEqual(pushed.calls.navigateBack[0].delta, 1, '返回步长必须是一页');
  assert.deepStrictEqual(pushed.calls.reLaunch, [], '正常返回不得重建页面栈');

  const failing = makeInstance({ pageDepth: 2, navigateBackFails: true }, { backMode: 'auto', leftMode: 'back' });
  failing.instance.onBackTap();
  assert.deepStrictEqual(
    failing.calls.reLaunch,
    ['/subpackages/main/pages/portal/portal'],
    '退不了时必须回到门户，不能把用户留在死页'
  );

  const rootPage = makeInstance({ pageDepth: 1 }, { backMode: 'auto', leftMode: 'back' });
  rootPage.instance.onBackTap();
  assert.deepStrictEqual(rootPage.calls.navigateBack, [], '没有返回键时不得触发返回');
}

// —— 模板与样式契约 ——
assert.ok(/class="ui-navbar-placeholder"/.test(componentMarkup), '顶栏必须自带占位块，页面不需要自己留白');
assert.ok(/<slot name="left">/.test(componentMarkup), '顶栏必须给页面留出左侧自定义槽位');
assert.ok(/hover-class="ui-press-chip"/.test(componentMarkup), '返回键必须有按压反馈');
assert.ok(/ui-navbar-font-\{\{headingFontStep\}\}/.test(componentMarkup), '标题字号必须按算出来的档位渲染');
assert.ok(/grid-column:\s*1\s*\/\s*-1;/.test(componentStyle), '占位块必须能在 grid 页面里整行占满');
assert.ok(/\.ui-navbar-font-5\s*\{\s*font-size:\s*var\(--ui-type-micro\)/.test(componentStyle), '最小档字号必须来自语义令牌');
assert.ok(!/font-size:\s*\d/.test(componentStyle), '顶栏字号只能取语义令牌，不得写死数值');
{
  const navbarZ = Number((componentStyle.match(/\.ui-navbar\s*\{[\s\S]*?z-index:\s*(\d+)/) || [])[1]);
  assert.ok(navbarZ > 50, '顶栏必须盖住页面内容（内容最高 z-index 50）');
  assert.ok(navbarZ < 98, '顶栏必须低于全屏弹窗遮罩，弹窗打开时才能连顶栏一起盖住');
}
assert.ok(/@media\s*\(min-width:\s*520px\)/.test(componentStyle), '顶栏必须给 Pad 竖屏单独定尺寸');
assert.ok(/@media\s*\(min-width:\s*900px\)\s*and\s*\(orientation:\s*landscape\)/.test(componentStyle), '顶栏必须给 Pad 横屏单独定尺寸');

console.log('统一顶栏测试通过：几何、标题后缀与字号、返回键与槽位行为符合预期。');
