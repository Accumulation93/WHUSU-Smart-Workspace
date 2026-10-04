const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const componentFile = path.join(root, 'miniprogram/components/ui-navbar/ui-navbar.js');
const componentStyle = fs.readFileSync(path.join(root, 'miniprogram/components/ui-navbar/ui-navbar.wxss'), 'utf8');
const componentMarkup = fs.readFileSync(path.join(root, 'miniprogram/components/ui-navbar/ui-navbar.wxml'), 'utf8');

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
            return settings.metrics || { statusBarHeight: 24, barHeight: 48, capsuleInset: 96, totalHeight: 72 };
          }
        };
      }
      if (name.indexOf('locales') >= 0) {
        return { backAria: '返回上一页', refreshing: '正在刷新…', emptyTitle: 'WHUSU智慧工作台' };
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

// —— 顶栏几何 ——
{
  const { definition, calls } = loadComponent({});
  const instance = createInstance(definition);
  instance.applyMetrics();
  assert.strictEqual(calls.metrics, 1, '顶栏必须向平台量一次状态栏与胶囊几何');
  assert.deepStrictEqual(
    [instance.data.statusBarHeight, instance.data.barHeight, instance.data.capsuleInset, instance.data.totalHeight],
    [24, 48, 96, 72],
    '顶栏几何必须按平台返回值落地'
  );
  // Pad 横竖屏切换：组件在自己的页面事件里重算
  assert.strictEqual(typeof definition.pageLifetimes.resize, 'function', '顶栏必须在横竖屏切换后重算几何');
  instance.refreshGeometry();
  assert.strictEqual(calls.metrics, 2, '重算必须重新量一次几何');
}

// —— 标题：去掉“ - WHUSU智慧工作台”后缀，空标题回落应用名 ——
{
  const { definition } = loadComponent({});
  const instance = createInstance(definition);
  definition.observers.title.call(instance, '场地借用审批详情 - WHUSU智慧工作台');
  assert.strictEqual(instance.data.shortTitle, '场地借用审批详情', '顶栏只显示子应用名称');
  definition.observers.title.call(instance, '  应用服务 - WHUSU智慧工作台  ');
  assert.strictEqual(instance.data.shortTitle, '应用服务', '标题两侧空白与后缀都要去掉');
  definition.observers.title.call(instance, '');
  assert.strictEqual(instance.data.shortTitle, 'WHUSU智慧工作台', '没拿到标题时回落应用名，不能显示空条');
}

// —— 返回键：默认有上一页才显示，与微信原生一致 ——
{
  const root = loadComponent({ pageDepth: 1 });
  const rootInstance = createInstance(root.definition, { backMode: 'auto', leftMode: 'back' });
  rootInstance.syncBackVisibility();
  assert.strictEqual(rootInstance.data.showBack, false, '落地页没有上一页，不显示返回键');

  const pushed = loadComponent({ pageDepth: 3 });
  const pushedInstance = createInstance(pushed.definition, { backMode: 'auto', leftMode: 'back' });
  pushedInstance.syncBackVisibility();
  assert.strictEqual(pushedInstance.data.showBack, true, '有上一页时必须显示返回键');

  pushedInstance.data.backMode = 'never';
  pushedInstance.syncBackVisibility();
  assert.strictEqual(pushedInstance.data.showBack, false, '显式关闭时不得显示返回键');

  pushedInstance.data.backMode = 'always';
  pushedInstance.syncBackVisibility();
  assert.strictEqual(pushedInstance.data.showBack, true, '显式要求时总要显示返回键');

  // 左侧换成页面自己的控件（门户的退出登录图标键）时不再渲染返回键
  const slotted = loadComponent({ pageDepth: 3 });
  const slottedInstance = createInstance(slotted.definition, { backMode: 'auto', leftMode: 'slot' });
  slottedInstance.syncBackVisibility();
  assert.strictEqual(slottedInstance.data.showBack, false, '左侧自定义槽位时不得再画返回键');
}

// —— 点返回键：退一页；没有可退时回门户 ——
{
  const { definition, calls } = loadComponent({ pageDepth: 2 });
  const instance = createInstance(definition, { backMode: 'auto', leftMode: 'back' });
  instance.syncBackVisibility();
  instance.onBackTap();
  assert.strictEqual(calls.navigateBack.length, 1, '点返回键必须退一页');
  assert.strictEqual(calls.navigateBack[0].delta, 1, '返回步长必须是一页');
  assert.deepStrictEqual(calls.reLaunch, [], '正常返回不得重建页面栈');

  const failing = loadComponent({ pageDepth: 2, navigateBackFails: true });
  const failingInstance = createInstance(failing.definition, { backMode: 'auto', leftMode: 'back' });
  failingInstance.syncBackVisibility();
  failingInstance.onBackTap();
  assert.deepStrictEqual(
    failing.calls.reLaunch,
    ['/subpackages/main/pages/portal/portal'],
    '退不了时必须回到门户，不能把用户留在死页'
  );
}

// —— 隐藏返回键后点击不应该导航 ——
{
  const { definition, calls } = loadComponent({ pageDepth: 1 });
  const instance = createInstance(definition, { backMode: 'auto', leftMode: 'back' });
  instance.syncBackVisibility();
  instance.onBackTap();
  assert.deepStrictEqual(calls.navigateBack, [], '没有返回键时不得触发返回');
}

// —— 模板与样式契约 ——
assert.ok(/class="ui-navbar-placeholder"/.test(componentMarkup), '顶栏必须自带占位块，页面不需要自己留白');
assert.ok(/<slot name="left">/.test(componentMarkup), '顶栏必须给页面留出左侧自定义槽位');
assert.ok(/hover-class="ui-press-chip"/.test(componentMarkup), '返回键必须有按压反馈');
assert.ok(/grid-column:\s*1\s*\/\s*-1;/.test(componentStyle), '占位块必须能在 grid 页面里整行占满');
{
  const navbarZ = Number((componentStyle.match(/\.ui-navbar\s*\{[\s\S]*?z-index:\s*(\d+)/) || [])[1]);
  assert.ok(navbarZ > 50, '顶栏必须盖住页面内容（内容最高 z-index 50）');
  assert.ok(navbarZ < 98, '顶栏必须低于全屏弹窗遮罩，弹窗打开时才能连顶栏一起盖住');
}
assert.ok(/@media\s*\(min-width:\s*520px\)/.test(componentStyle), '顶栏必须给 Pad 竖屏单独定尺寸');
assert.ok(/@media\s*\(min-width:\s*900px\)\s*and\s*\(orientation:\s*landscape\)/.test(componentStyle), '顶栏必须给 Pad 横屏单独定尺寸');

console.log('统一顶栏测试通过：几何、标题、返回键与槽位行为符合预期。');
