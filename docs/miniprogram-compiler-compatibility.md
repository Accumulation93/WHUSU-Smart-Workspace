# 微信小程序编译兼容性规范

> 适用于 `miniprogram/**`。本规范用于防止 Node 可解析、微信开发者工具却无法加载页面的编译链故障。

## 事故记录一：全页面 `_define_property.js` 缺失

### 表现

- 页面首先报 `module '@swc/runtime/_define_property.js' is not defined`。
- 随后出现 `Component is not found in path "wx://not-found"`。
- 页面初始化请求还可能另行出现 `timeout`。

### 根因链

1. 项目曾同时设置 `swc: false` 和 `disableSWC: false`。开发者工具内部以 `disableSWC === false` 为启用条件，实际仍使用 SWC。
2. `home`、评分管理和各分包中的对象展开、计算属性、解构、async 等语法被转换为 `@swc/runtime/*` 引用。
3. 原生项目配置 `nodeModules: false`，这些 runtime helper 没有对应可加载模块。
4. 页面曾被批量包装为 `Page(uiPreview.attach({...}))`，进一步把单一公共模块风险扩散到全部页面；事故数量以当时提交为准，不作为当前页面数量。
5. 页面脚本执行中断，`Page()` 未完成注册；`wx://not-found` 是随后产生的次生错误。
6. `timeout` 属于接口不可达或响应超时，应在页面恢复注册后独立诊断。

同一轮批量交互迁移还曾使用正则匹配 WXML 起始标签。该做法把 `wx:if="{{value > 0}}"` 属性中的 `>` 误判为标签结束，损坏了评分页和审核详情页的属性边界。它不是 SWC 报错的直接原因，但会在编译链恢复后继续造成页面解析失败，因此必须作为同级事故防线处理。

源码栈中的 `home.js:3` 等行号可能对应转换后的模块边界，不能仅凭该行判断业务代码有错。应先搜索所有页面共同加载的模块。

## 事故记录二：全页面 `unsupportedIterableToArray.js` 缺失

### 表现

- 页面首先报 `module '@babel/runtime/helpers/unsupportedIterableToArray.js' is not defined`，调用方通常显示为 `./unsupportedIterableToArray`。
- 登录页或门户页可能已显示，但进入任一含解构、展开、迭代或 async 转换的子应用后立即失败。
- 随后仍会连锁出现 `wx://not-found` 和无关的接口 `timeout`。

### 根因链

1. `enhance: true` 让开发者工具为大量源文件生成 `@babel/runtime/helpers/*` 引用。
2. `compileHotReLoad: true` 的增量产物只注入了页面直接引用的 helper，没有完整注入 helper 自身的递归依赖。
3. `createForOfIteratorHelper` 等 helper 继续依赖 `unsupportedIterableToArray`，但该模块不在当前模块表中，页面在执行 `Page()` 前中断。
4. `project.private.config.json` 会覆盖 `project.config.json` 同名设置，因此只查看公共配置无法确定真实编译行为。
5. 当时的源 JS 中有大量文件会触发 Babel 转换，逐个重写语法既不完整也不可维护；正确修复是关闭隐式转换和热重载路径，并进行冷启动全量编译。当前依赖图规模以实际 `miniprogram/` 和 `app.json` 为准。

## 架构边界

- 生产页面只使用原生 `Page({ ... })`。
- 开发夹具不能被生产页面 `require`，也不能改写页面生命周期。
- 视觉预览优先使用开发者工具编译条件、专用预览页面或工具侧自动化；工具侧数据放在 `scripts/`，页面加载成功后再注入。
- 本项目未启用 npm 小程序构建。不得直接引入编译器 runtime；确需启用时，必须同时设计构建 npm、分包产物和上传验证。
- 编译配置固定为 `nodeModules: false`、`es6: false`、`enhance: false`、`swc: false`、`disableSWC: true`，并在私有配置中固定 `compileHotReLoad: false`。注意 `disableSWC: false` 会启用 SWC，不能被 `swc: false` 抵消。
- 审计编译配置时必须合并 `project.config.json` 与 `project.private.config.json`；后者优先。
- `project.config.json` 的编译开关属于全应用配置，任何修改都要按当前 `app.json` 验证全部已注册页面；当前基线为顶层主包 2 页、6 个业务分包共 25 页。
- 主包启动页物理位于 `miniprogram/subpackages/main/pages/**`，但因注册在 `app.json.pages` 顶层仍属于主包；`subpackages/main` 不得写入 `subPackages`。
- 业务分包只能引用自身分包或主包资源。相对 `require`、WXSS `@import`、WXML `import/include` 和本地 `usingComponents` 都必须先解析到真实文件，再确认没有跨业务分包引用。共享 WXSS 统一放在 `miniprogram/subpackages/main/styles/**`；`miniprogram/subpackages/workspace/pages/home/home.wxss` 只是桥接文件。
- 禁止正则批量改写 WXML 标签和属性；静态工具必须逐字符识别单双引号、Mustache 表达式、注释和 WXS 内容。

## 强制检查

```powershell
node scripts/miniprogram-compat-audit.js
Get-ChildItem miniprogram -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
git diff --check
```

兼容性审计会检查：

- 未打包的 SWC/Babel runtime 引用。
- 非原生 `Page({})` 注册和开发夹具注入。
- 相对 `require` 指向不存在的模块。
- WXSS `@import`、WXML `import/include` 和本地组件路径是否存在及是否跨分包。
- `app.json` 注册页面是否具备四个同名文件。
- `usingComponents` 本地组件是否具备完整文件。
- 关键 npm/编译器配置是否偏离当前原生构建边界。
- WXML 属性引号、Mustache 绑定、重复属性及标签边界是否完整，包含 `>` 的比较表达式不能被截断。

静态检查通过后，仍必须在微信开发者工具中清除该项目编译缓存、完全重启工具并重新编译，逐个打开当前 `app.json` 注册页面。验收时搜索编译产物和控制台中的 `@swc/runtime`、`@babel/runtime`、`unsupportedIterableToArray`、`_define_property`；命中数必须为零。`node --check` 不能验证微信模块解析、分包边界或组件注册，热重载结果也不能替代冷启动。

## 验收判定

- 控制台不存在 `@swc/runtime`、`@babel/runtime` 或 `module ... is not defined`。
- 所有注册页面均能完成 `Page()` 注册；页面数以 `app.json` 的实时审计结果为准。
- 本地组件不存在 `wx://not-found`。
- 接口不可达时只进入页面自身的失败态，不产生未处理 Promise 或服务层异常。
