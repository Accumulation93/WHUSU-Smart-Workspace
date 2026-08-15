---
paths: "miniprogram/**"
---

# CLAUDE.md — 微信小程序前端

> 本文件覆盖前端通用规范。项目级规范见根目录 `CLAUDE.md`。

---

## 1. 文件组织与注册

每个页面/组件必须是独立目录，含 4 个同名文件（`.js`/`.wxml`/`.wxss`/`.json`）。

### 新增页面

1. 创建 4 个文件
2. 在 `app.json` 注册：主包→`pages` 数组，分包→`subPackages[].pages` 数组
3. 分包 root 路径规范：`"root": "subpackages/<模块名>"`

**关键约束：** 主包 ≤2MB，单分包 ≤2MB，全部分包 ≤20MB。用 `lazyCodeLoading: "requiredComponents"`。

### app.js 的特殊 require

```javascript
require('./utils/tableFile.js');  // ⚠️ 绝对不能删除！
```

---

## 2. 全局样式冲突

项目中有 **多处 CSS 重名选择器**：

| 文件 | 关键选择器 | 影响范围 |
|------|-----------|----------|
| `app.wxss` | popup 框架、全局 reset | 所有页面 |
| `pages/home/home.wxss` | `.field-input` (`display: flex`) | import 它的页面 |
| `subpackages/audit/styles/blue-polish.wxss` | `.field-input`、`.card`、`.chip` | audit 所有页面 |
| `subpackages/venue/styles/blue-polish.wxss` | `.field-input`、`.card`、`.chip` | venue 所有页面 |

**规则：绝不修改 `app.wxss`、`home.wxss`、`blue-polish.wxss`。** 用更具体的选择器覆盖。

---

## 3. 已知坑点大全

> 实际踩过的坑，不是理论风险。每次写代码前必须阅读。

### 3.1 WXS 模块 — 模板中无法调用 JS 方法

WXML 不支持 `.split()`、`.replace()`、`.map()` 等原生 JS 方法。**必须用 WXS 模块。**

```xml
<!-- ❌ 错误 -->
<text>{{time.split(':')[0]}}</text>

<!-- ✅ 正确 -->
<wxs module="fmt">
function hour(t) { if (!t) return '--'; var p = (''+t).split(':'); return p[0] || '--'; }
module.exports = { hour: hour };
</wxs>
<text>{{fmt.hour(time)}}</text>
```

> ⚠️ WXS 不支持 `let`/`const`，必须保留 `var`。

### 3.2 WeChat 原生 `<input>` — 不支持 `display: flex`

设置 `display: flex` 后文字垂直居中失效、placeholder 位置异常、输入时跳动。

**解决：** `display: block; box-sizing: border-box;` + `line-height` + `padding` 垂直居中。

```css
.field-input {
  display: block; box-sizing: border-box;
  min-height: 64rpx; padding: 10rpx 16rpx;
  font-size: 24rpx; line-height: 44rpx;
}
```

### 3.3 `position: fixed` 在 scroll-view 中的行为

`position: fixed` 元素若放在 `scroll-view` 内部，iOS 上可能不跟随视口。普通弹窗必须使用 `root-portal` 提升到页面根层，不能留在页面或组件的滚动、transform、flex 布局链中。签名板实时笔迹禁止使用可视原生 Canvas，详见 §3.13。

```xml
<scroll-view>...</scroll-view>
<view class="kb-panel" wx:if="{{_kbVisible}}">...</view>  <!-- 在外部！ -->
```

### 3.4 `popup-mask` + flexbox 居中 → 子元素位置异常

弹窗使用 `.ui-overlay`、`.ui-overlay-blocker`、`.ui-dialog-shell` 三层契约：遮罩和阻断层固定覆盖 `100vw × 100vh`，窗口固定在 `50vw / 50vh` 并平移居中。阻断层和窗口必须是同级元素，阻断层在前、窗口在后。**`catchtouchmove="noop"` 只能放在独立阻断层，不能放在普通遮罩、窗口外壳、正文或滚动区祖先上。**

`ui-dialog-shell--complex` 只表示标题、正文、操作栏的结构，不代表满屏高度。普通表单外壳必须随内容和条件区的展开、收起自然增减，标题、正文和底部操作栏通过 flex 按实际内容动态分配高度；正文超过可用高度后才由直接子级 `scroll-view.ui-dialog-body` 滚动。只能设置视口安全上限，禁止给普通表单正文或窗口写固定内容高度、固定 `max-height` 或固定翻页尺度。只有表格、时间表等真正需要稳定工作区的窗口才可显式使用 `ui-dialog-shell--viewport` 或 `--wide`。纵向滚动区统一启用 `enhanced`、`scroll-y` 与 `nested-scroll-enabled`；内层列表使用 `ui-dialog-scroll--pane`，手势落在内层时优先滚动内层。签名板、拖拽手柄等专用触摸区才允许使用 `ui-dialog-touch-lock`。

### 3.5 setData 批处理 — 必须一次调用

每次 `setData()` 触发一次渲染。连续多次 → 卡顿。

```javascript
// ❌ 两次 setData
this.setData({ _kbField: 'min' }); this.setData({ _kbGray: gray });

// ✅ 单次合并
this.setData({ _kbField: 'min', _kbGray: gray, _kbSelected: true });
```

### 3.6 `scroll-view` 的 `scroll-y` 不能动态关闭

`scroll-y="{{false}}"` 会使 scroll-view 忽略 `scroll-top` 程序化更新。弹窗背景锁定由正文之外的同级 `ui-overlay-blocker` 负责，不得在 `scroll-view` 自身或其祖先用 `catchtouchmove` 代替，否则会同时锁死窗口正文。

### 3.7 `clientY` vs `pageY`

- `pageY` 含 scroll-view 内部滚动偏移
- `clientY` 相对视口

`position: fixed` 元素（ghost card、拖拽手柄）**必须用 `clientY`**。

### 3.8 `showToast` 限制 7 个中文字符

`wx.showToast({ title })` 超 7 个中文字符会被截断。**用 `showShortToast()`（已内置自动截断+省略号）。**

### 3.9 `picker mode="date"` start 属性不可靠

某些设备不遵守 `start` 属性。**必须在 JS 层做兜底校验**，拒绝非法日期并恢复原值。

### 3.10 `wx.createSelectorQuery()` — 拖拽中必须节流

touchmove 中每秒 ~60 次 `createSelectorQuery().exec()` 会导致回调节点积压+卡顿。**拖拽场景节流到 ~30fps（33ms）：**

```javascript
if (self._lastUpdateTime && now - self._lastUpdateTime < 33) return;
self._lastUpdateTime = now;
```

### 3.11 WXML 中 `data-*` 属性值类型

`dataset` 中的值始终是**字符串**。比较时必须 `Number(e.currentTarget.dataset.index)`。

### 3.12 `hidden` vs `wx:if`

- `wx:if` — 不满足时不创建 DOM。用于不频繁切换的内容。
- `hidden` — 始终创建 DOM，切换 `display`。用于频繁显示/隐藏。

键盘面板、Ghost card 使用 `wx:if`。

### 3.13 签名板视口绝对坐标

可视白板与实时笔迹必须使用普通 `view`。白板 rect、触点 `clientX/clientY` 和线段端点统一
保存为视口 CSS px 绝对坐标；禁止 scrollTop、DPR、rpx 和固定偏移。原生 Canvas 只能作为
不可见导出器，确认时再把绝对端点投影到白板局部坐标；具体要求详见 `.claude/rules/audit.md` §3。

### 3.14 编译器 runtime helper 缺失

原生小程序当前设置为 `nodeModules: false`，运行时不会自动提供 `@swc/runtime` 或 `@babel/runtime`。本项目曾同时配置 `"swc": false` 与 `"disableSWC": false`；开发者工具实际以 `disableSWC === false` 为准启用 SWC，含对象展开、计算属性、async 等语法的页面被转换为未打包的 runtime helper。关闭 SWC 后，Babel enhance 与热重载组合又曾生成 `@babel/runtime/helpers/*`，并遗漏 `unsupportedIterableToArray` 等 helper 的递归依赖。两类故障都会造成主包和分包页面无法注册。全局 `Page(uiPreview.attach({...}))` 曾扩大过影响范围，但不是唯一触发条件。

**强制规则：**

- 页面保持直接 `Page({ ... })` 注册，禁止全局装饰器、代理或夹具包装。
- 开发态视觉夹具放在 `scripts/` 或专用预览页面，由开发者工具自动化在页面加载后注入数据；不得进入生产页面的 `require` 依赖图。
- 不得直接引用 `@swc/runtime/*`、`@babel/runtime/*` 或假设编译器 helper 会自动存在。
- `project.config.json` 必须保持 `nodeModules: false`、`es6: false`、`enhance: false`、`swc: false`、`disableSWC: true`；`disableSWC: false` 会实际开启 SWC，不能被 `swc: false` 抵消。
- `project.private.config.json` 必须保持 `compileHotReLoad: false`。私有配置会覆盖公共配置，审计时必须按合并后的有效配置判断。
- 不随意修改 `useCompilerPlugins`、`useCompilerModule`；确需修改时必须逐页编译验证。
- `node --check` 只验证 JavaScript 语法，不能替代微信编译器验证；热重载成功也不能替代清缓存后的冷启动验证。

**错误排查顺序：**先处理首个 `module ... is not defined`，再看 `wx://not-found`；后者通常是页面或组件脚本未注册的次生错误。最后单独检查接口 `timeout`，不要把网络超时误判为组件路径错误。

---

## 4. API 调用

```javascript
const { callFunction } = require('../../utils/api');

// Promise 风格（推荐）
const result = await callFunction({ name: 'getScoreFormData', data: { targetId } });

// 回调风格（向后兼容）
callFunction({ name: 'userLogin', data: { code }, success: res => { ... }, fail: err => { ... } });
```

- 自动添加 `Authorization: Bearer <token>` 请求头
- 15 秒超时，超时自动 abort
- 超时使用 `wx.request({ timeout: 15000 })` 原生能力，不使用 `setTimeout + requestTask.abort()` 模拟
- 所有业务 API 均为 POST，名称正则校验 `/^[A-Za-z][A-Za-z0-9_]*$/`

### 响应格式

```json
{ "status": "success", "data": { ... } }
{ "status": "login_success", "token": "...", "user": { ... } }
{ "status": "need_bind", "token": "..." }
{ "status": "error", "message": "错误描述" }
```

### 认证流程

1. `wx.login()` → 2. POST `/api/userLogin` 或 `/api/adminLogin` → 3. 服务端优先 JWT，其次微信 code2session → 4. 前端处理 `login_success` / `need_bind` / error

---

## 5. EventBus — 跨页面通信

```javascript
const eventBus = require('../../utils/eventBus');
eventBus.on('venue:changed', this._handler);   // onShow 注册
eventBus.off('venue:changed', this._handler);  // onUnload 注销（必须！）
eventBus.emit('venue:changed', { reason });
```

---

## 6. Page 生命周期

```javascript
Page({
  onLoad(options)  { /* 一次性初始化 */ },
  onShow()         { /* 每次显示时刷新数据、重启轮询 */ },
  onHide()         { /* 停止轮询、清理定时器 */ },
  onUnload()       { /* 清理 EventBus 监听、清理定时器 */ }
});
```

---

## 7. 关键工具函数

| 函数 | 来源 | 用途 |
|------|------|------|
| `callFunction({ name, data })` | api.js | 通用 API，返回 Promise |
| `showShortToast(title, icon)` | api.js | Toast（自动截断 ≤7 中文字符） |
| `formatAuditTime(raw)` | api.js | 审核时间格式化 |
| `getErrorText(error, fallback)` | api.js | 提取错误文本 |
| `eventBus.on/off/emit` | eventBus.js | 跨页面事件 |
| `parseCsvContent/buildCsv/buildExcelXml` | tableFile.js | CSV/Excel 解析导出 |

---

## 8. 前端禁止事项

- ❌ WXML 中直接调用 `.split()` / `.replace()` / `.map()` → 用 WXS
- ❌ `<input>` 上设置 `display: flex` → 用 `display: block` + `line-height`
- ❌ `popup-mask` 内放 `position: fixed; bottom: 0` 元素
- ❌ 多次 `setData()` 不合并
- ❌ `wx.showToast` title 超 7 中文字符
- ❌ 在没有全页影响面审计时修改共享样式文件
- ❌ 拖拽 touchmove 不节流 `createSelectorQuery`
- ❌ `onUnload` 中忘记 `eventBus.off`
- ❌ 忘记在 `onHide`/`onUnload` 中清理定时器
- ❌ 用公共模块包装所有 `Page({})` 或把开发夹具注入生产页面依赖图
- ❌ 依赖未打包的 `@swc/runtime` / `@babel/runtime` helper
- ❌ 仅用 `node --check` 代替 `node scripts/miniprogram-compat-audit.js` 和微信开发者工具编译
- ❌ 用正则批量改写 WXML 标签或属性；`wx:if="{{a > b}}"` 中的 `>` 不是标签结束符，工具必须识别引号、Mustache 和 WXS

---

## 9. 语言资源硬约束

- 用户可见文案只允许定义在 `miniprogram/locales/zh-CN/**`；业务 JS、WXML 和页面 JSON 不得新增中文文案常量。
- WXML 通过页面或组件 `data` 中的语言对象读取文案；Toast、Modal、空状态、无障碍标签和动态提示同样适用。
- 页面 JSON 的 `navigationBarTitleText` 保持空值，页面加载时从语言资源调用 `wx.setNavigationBarTitle`。
- 动态句子必须在语言资源中定义模板或格式化函数，业务代码只传变量；路由、状态码、权限键、数据库枚举和业务标识不得伪装成语言资源。
- 新增文案使用可读语义键；`generated/**` 的内容寻址键仅用于历史等值迁移，不得手写复制到无关页面。
- 完成小程序修改必须运行 `node scripts/user-visible-copy-audit.js --localization-prefix=miniprogram/ --strict-localization`。
