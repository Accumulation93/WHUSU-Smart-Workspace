# CLAUDE.md — REDSU Scoring System

> **AI 编程完整指南**。每次新会话开始时，Claude Code 会自动加载此文件作为项目上下文。
> 最后更新：2026-07-10

---

## 1. 项目概述

**REDSU 智慧工作台** — 武汉大学某部门成员互评考核微信小程序，包含考核评分、人事管理、审核审批、场地借用四大模块。

- **前端**：微信小程序原生框架（WXML / WXSS / JS），无第三方框架
- **后端**：Node.js Express (HTTPS)，部署在 Ubuntu 22.04 + Nginx 反向代理
- **数据库**：MySQL 8.0 (InnoDB, utf8mb4)，通过 `mysql2/promise` 连接池访问
- **认证**：JWT Bearer Token（7天过期）+ 微信 `code2session`

**关键配置：**
- App ID: `wxa0946295a962ee2e`
- 基础库: `3.15.2`，组件框架: `glass-easel`
- 懒加载: `lazyCodeLoading: "requiredComponents"`
- 生产域名: `accumulation93.com`
- 开发环境 API: `https://localhost:3000/api`（需开发者工具开启"不校验合法域名"）

---

## 2. 目录结构

```
ScoringServerDomain/
├── CLAUDE.md                    # ← 本文件
├── miniprogram/                 # 微信小程序前端（活跃开发）
│   ├── app.js / app.json / app.wxss   # 全局入口、路由、样式
│   ├── pages/                   # 主包页面（启动即加载）
│   │   ├── login/login          # 双角色登录 + 绑定
│   │   ├── portal/portal        # 工作台首页（卡片、通知、待办）
│   │   └── home/home            # 旧首页（重定向到 portal）
│   ├── utils/
│   │   ├── api.js               # HTTP 封装（callFunction + JWT 注入）
│   │   ├── eventBus.js          # 跨页面事件总线
│   │   ├── filePreview.js       # 文件下载和预览
│   │   └── tableFile.js         # CSV/Excel 解析
│   └── subpackages/             # 分包（懒加载）
│       ├── scoring/             # 考核评分模块
│       │   └── pages/
│       │       ├── score/score          # 用户评分表单
│       │       ├── admin/admin          # 管理面板（13 个 Behavior 模块）
│       │       └── scorerTasks/         # 评分人任务列表
│       ├── audit/               # 审核模块
│       │   ├── styles/blue-polish.wxss  # 共享审核样式
│       │   ├── components/signaturePad/ # 签名板组件
│       │   └── pages/                   # 6 个审核页面
│       └── venue/               # 场地借用模块
│           ├── styles/blue-polish.wxss  # 共享场地样式
│           ├── utils/flowTimeline.js    # 审批流时间轴
│           └── pages/                   # 5 个场地页面
├── server/                      # Express 后端
│   ├── .env                     # 数据库 + 微信 + JWT 密钥（gitignore）
│   ├── db/init.sql              # 完整建表语句 + 种子数据
│   └── src/
│       ├── index.js             # HTTPS 入口（端口 3000）
│       ├── middleware/auth.js   # JWT 认证中间件
│       ├── routes/              # 15 个路由文件（全部 POST）
│       ├── models/              # 20 个 Model 文件（原生 SQL）
│       └── modules/             # 业务模块（scoring / audit / venue / core）
└── shared/                      # 跨仓库共享工具（历史遗留，当前不活跃）
```

---

## 3. 代码规范

### 3.1 变量声明：强制使用 `let` / `const`，禁止 `var`

**这是硬性规定。** 只要编辑某个文件，就必须将文件中所有 `var` 迁移为 `let` / `const`，哪怕此行与本次修改无关。

```javascript
// ❌ 禁止
var curTime = '08:30';
var self = this;

// ✅ 正确
let curTime = '08:30';
const self = this;
```

**选择规则：**
- 不会被重新赋值的变量 → `const`
- 会被重新赋值的变量 → `let`
- `module.exports` / `require` → `const`

### 3.2 注释语言：中文

所有注释、文档、commit message 使用中文。

```javascript
// ✅ 正确
// 计算当前时间是否在开放时段内
function isWithinOpenHours(min, openMerged) { ... }

// ❌ 禁止
// Check if current time is within open hours
```

### 3.3 命名规范

| 类别 | 规范 | 示例 |
|------|------|------|
| 文件/目录 | camelCase | `venueBooking.js`, `flowTimeline.js` |
| 函数/变量 | camelCase | `callFunction()`, `bookingTimeStart` |
| 私有/内部 | `_` 前缀 | `_dragState`, `_kbSelected`, `_computeGrayKeys()` |
| 常量 | UPPER_SNAKE_CASE | `API_BASE`, `TOTAL_MIN`, `SNAP` |
| Page data 字段 | camelCase | `bookingTimeStart`, `dragGhostVisible` |
| CSS class | kebab-case | `.drag-ghost-card`, `.section-title` |
| 数据库表/列 | snake_case | `hr_info`, `score_records`, `student_id` |
| API 函数名 | camelCase | `userLogin`, `getScoreFormData` |

### 3.4 文件组织

每个页面 **必须** 是独立目录，包含 4 个同名文件：
```
pages/venueBooking/
├── venueBooking.js      # Page() 逻辑
├── venueBooking.wxml    # 模板
├── venueBooking.wxss    # 样式
└── venueBooking.json    # 页面配置
```

### 3.5 代码风格

- **箭头函数**：回调使用箭头函数，Page 顶层方法使用传统 `function`（WeChat Page 要求）
- **字符串**：优先单引号 `'...'`，模板字符串用反引号 `` `...` ``
- **Promise**：新代码使用 `async/await`，避免回调嵌套
- **模块导出**：使用 `module.exports = { ... }`（CommonJS）

---

## 4. 设计系统 — 蓝奢玻璃风格

> **完整规范见** `.claude/skills/blue-glass-ui/SKILL.md`。以下为核心速查。

### 4.1 核心色板

| 角色 | 色值 | 用途 |
|------|------|------|
| 深蓝 | `#1d4ed8` / `#2563eb` | 激活标签、主按钮、chip 文字 |
| 中蓝 | `#3b82f6` | 渐变、边框、聚焦环 |
| 浅蓝 | `#60a5fa` | 渐变终点、标题发光 |
| 主文字 | `#0f172a` (标题) / `#1e293b` (正文) | — |
| 次要文字 | `#64748b` | 辅助说明 |
| 弱化文字 | `#94a3b8` | placeholder、图标 |

### 4.2 Chips 四色方案（仅此 4 种，禁止新增颜色）

| 变体 | 背景 | 文字 | 边框 |
|------|------|------|------|
| 蓝 | `rgba(219,234,254,0.76)` | `#1d4ed8` | `rgba(147,197,253,0.64)` |
| 绿 | `rgba(209,250,229,0.78)` | `#15803d` | `rgba(110,231,183,0.58)` |
| 橙 | `rgba(255,237,213,0.78)` | `#c2410c` | `rgba(253,186,116,0.58)` |
| 天蓝 | `rgba(224,242,254,0.76)` | `#0369a1` | `rgba(56,189,248,0.56)` |

**禁止使用：** 紫色、粉色、黄色 chip，纯色无渐变背景。

### 4.3 玻璃容器黄金法则

**每个容器必须同时满足以下 4 条：**

1. `linear-gradient` 背景（`rgba(255,255,255,0.80-0.96)` 范围），**绝不使用纯色**
2. `border: 1rpx solid rgba(255,255,255,0.62-0.96)`
3. `box-shadow`：外层阴影 **AND** `inset 0 1rpx 0 rgba(255,255,255,0.78)`（顶部内高光）
4. `backdrop-filter: blur(24rpx)`（卡片级，内部块不需要）

### 4.4 圆角层级

| 元素 | 圆角 |
|------|------|
| Hero 卡片 | `38rpx` |
| 内容卡片 | `30rpx` |
| Info block | `24rpx` |
| 列表行 | `22rpx` |
| 按钮 | `24rpx` |
| Chip | `999rpx`（全圆角） |

### 4.5 页面背景（必须使用此模式）

```css
page {
  min-height: 100%;
  background:
    radial-gradient(circle at 12% 10%, rgba(96,165,250,0.16) 0%, transparent 26%),
    radial-gradient(circle at 86% 18%, rgba(191,219,254,0.22) 0%, transparent 24%),
    radial-gradient(circle at 18% 88%, rgba(125,211,252,0.10) 0%, transparent 22%),
    linear-gradient(135deg, #f8fbff 0%, #f1f6fc 48%, #edf3fa 100%);
}
```

**禁止：** 纯白背景、深色背景、无渐变平面色、非蓝色系页面底色。

### 4.6 唯一动画

只使用 `glassFadeUp`，不创建自定义动画：

```css
@keyframes glassFadeUp {
  from { opacity: 0; transform: translateY(18rpx); }
  to   { opacity: 1; transform: translateY(0); }
}
```

### 4.7 按钮三层体系（不新增按钮颜色）

- **Primary** — 蓝渐变 + 白字。主 CTA
- **Secondary** — 白玻璃 + 深色字。取消/返回/次要操作
- **Danger** — 红渐变 + 白字。**仅**用于删除/解绑等破坏性操作

---

## 5. 已知坑点大全

> **每次写代码前必须阅读本节。** 这些是实际踩过的坑，不是理论风险。

### 5.1 WXS 模块 — 模板中无法调用 JS 方法

WXML 模板不支持 `.split()`、`.replace()`、`.map()` 等原生 JS 方法。**必须在 WXS 模块中实现字符串/数组操作。**

```xml
<!-- ❌ 错误：WXML 不支持 split -->
<text>{{time.split(':')[0]}}</text>

<!-- ✅ 正确：使用 WXS 模块 -->
<wxs module="fmt">
function hour(t) {
  if (!t) return '--';
  var p = (''+t).split(':');
  return p[0] || '--';
}
module.exports = { hour: hour };
</wxs>
<text>{{fmt.hour(time)}}</text>
```

### 5.2 WeChat 原生 `<input>` — 不支持 `display: flex`

WeChat 原生 input 组件内部渲染机制不支持 flex 布局。设置 `display: flex` 后：
- 文字垂直居中失效
- placeholder 和输入文字位置不一致
- 输入时文字会跳动

**解决：** 对 input 使用 `display: block; box-sizing: border-box;`，通过 `line-height` + `padding` 实现垂直居中，并用 `placeholder-style` 属性统一 placeholder 样式。

```html
<input placeholder="请输入"
       placeholder-style="font-size:24rpx;line-height:44rpx;color:#94a3b8;" />
```

```css
.field-input {
  display: block;
  box-sizing: border-box;
  min-height: 64rpx;
  padding: 10rpx 16rpx;
  font-size: 24rpx;
  line-height: 44rpx;
}
```

### 5.3 CSS 全局冲突 — 多处样式互相污染

项目中有 **三处** 定义了 `.field-input` 样式，会互相覆盖：

| 文件 | 位置 | 定义 |
|------|------|------|
| `pages/home/home.wxss` | L463-470 | `display: flex; align-items: center; padding: 0 24rpx;` |
| `subpackages/.../blue-polish.wxss` | L106-118 | `padding: 22rpx 22rpx; font-size: 26rpx; line-height: 1.6;` |
| 各页面自己的 wxss | — | 局部覆写 |

**规则：** 当 page 级别覆写不生效时，检查是否被全局样式覆盖。使用更具体的选择器（如 `.booking-form-popup .field-input`）来提高优先级。**不要修改全局样式文件**（home.wxss、blue-polish.wxss），它们是整个应用的基准样式。

### 5.4 `position: fixed` 在 scroll-view 中的行为

`position: fixed` 的元素如果放在 `scroll-view` 内部，在 iOS 上可能不跟随视口。**所有 page-level 浮层（键盘、弹出面板）必须放在 scroll-view 外部，用 `position: fixed; bottom: 0; z-index: 101+`。**

```xml
<!-- ✅ 正确结构 -->
<scroll-view>...</scroll-view>
<!-- 键盘在 scroll-view 外 -->
<view class="kb-panel" wx:if="{{_kbVisible}}">...</view>
```

### 5.5 `popup-mask` + flexbox 居中 = 子元素位置异常

`popup-mask` 使用 `display: flex; align-items: center; justify-content: center` 居中弹窗面板。如果把 `position: fixed; bottom: 0` 的元素也放在 popup-mask 内，flex 布局会把它也居中 → 出现"键盘在右侧"的问题。

**规则：** 固定在底部的元素（如键盘）不要放在 popup-mask 内部。

### 5.6 setData 批处理 — 一次调用传递所有字段

每次 `setData()` 触发一次渲染。连续多次调用 → 重复渲染 → 卡顿。

```javascript
// ❌ 错误：两次 setData
this.setData({ _kbField: 'min' });
this.setData({ _kbGray: gray });

// ✅ 正确：单次 setData 合并所有字段
this.setData({ _kbField: 'min', _kbGray: gray, _kbSelected: true });
```

拖拽场景中，`dragGhostTop`、`dragInsertIndex`、`listScrollTop` 也必须在一次 setData 中更新。

### 5.7 `scroll-view` 的 `scroll-y` 不能动态关闭

`scroll-y="{{false}}"` 会使 scroll-view 完全忽略 `scroll-top` 程序化更新。如果需要阻止自然滚动（如拖拽排序时），用 `catchtouchmove` 包装器阻止事件冒泡，而不是切换 `scroll-y`。

### 5.8 `clientY` vs `pageY`

- `pageY` 包含 scroll-view 内部滚动偏移
- `clientY` 是相对于视口的位置

`position: fixed` 的元素（ghost card、拖拽手柄）必须使用 `clientY`。**始终优先使用 `clientY`。**

### 5.9 微信 `showToast` 限制 7 个中文字符

`wx.showToast({ title: ... })` title 超过约 7 个中文字符会被截断。项目中的 `showShortToast()` 已内置自动截断 + 省略号。**所有 toast 消息必须控制在 7 个中文字符以内。**

### 5.10 微信日期选择器 `picker mode="date"` — 不是所有设备都遵守 `start` 属性

`picker` 的 `start` 属性在某些设备上不生效。**必须在 JS 层做兜底校验**，拒绝非法日期并恢复原值。

### 5.11 `wx.createSelectorQuery()` 回调是异步的 — 拖拽中需要节流

在 touchmove 事件中每秒触发 ~60 次 `createSelectorQuery().exec()` 会产生回调节点积压，导致：
- 单帧内多次 setData → 卡顿
- 矩形信息过时（回调触发时手指已移动）

**拖拽场景中节流到 ~30fps（33ms）：**
```javascript
if (self._lastUpdateTime && now - self._lastUpdateTime < 33) return;
self._lastUpdateTime = now;
```

### 5.12 WXML 中 `data-*` 属性值类型

`dataset` 中的值始终是**字符串**。比较时必须转换：
```javascript
const index = Number(e.currentTarget.dataset.index);
```

### 5.13 `hidden` vs `wx:if`

- `wx:if` — 条件渲染，不满足时不创建 DOM。用于不频繁切换的内容
- `hidden` — 始终创建 DOM，只切换 `display`。用于频繁显示/隐藏

**键盘面板使用 `wx:if`**（不显示时不创建），减少 DOM 节点。Ghost card 也使用 `wx:if`。

### 5.14 微信 Canvas 的 DPR 坐标漂移

WeChat Canvas 在不同设备上存在 DPR（device pixel ratio）差异，导致触摸坐标与实际绘制位置偏移。项目中最复杂的 Canvas 使用场景是 signaturePad 组件，其五层防御策略：

1. **双源测量** — `fields({ node: true, size: true })` + `boundingClientRect`，以 boundingClientRect 为准
2. **rpx 自动检测和转换** — rect 尺寸超过 `screenWidth * 1.2` 则假定为 rpx
3. **touchStart 时重验证** — 首次触摸时重新测量，确保布局已稳定
4. **每次绘制前重设 transform** — `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`，防御 WeChat setData 重置 context
5. **边框在 wrapper 上** — Canvas 本身的 `boundingClientRect` 精确匹配可绘制区域

**规则：** 任何 Canvas 操作前，必须用 `boundingClientRect` + DPR 做坐标对齐。详见 `miniprogram/subpackages/audit/CLAUDE.md` 第 3 节。

---

## 6. API 契约

### 6.1 前端 HTTP 封装

所有 API 调用通过 `utils/api.js` 的 `callFunction()`：

```javascript
const { callFunction } = require('../../utils/api');

// Promise 风格（推荐）
const result = await callFunction({ name: 'getScoreFormData', data: { ... } });

// 回调风格（向后兼容）
callFunction({ name: 'userLogin', data: { code }, success: res => { ... }, fail: err => { ... } });
```

- 自动添加 `Authorization: Bearer <token>` 请求头
- 15 秒超时，超时后自动 abort
- 所有业务 API 均为 POST 方法
- API 名称正则校验：`/^[A-Za-z][A-Za-z0-9_]*$/`

### 6.2 响应格式

```json
// 成功
{ "status": "success", "data": { ... } }

// 登录成功
{ "status": "login_success", "token": "...", "user": { ... } }

// 需要绑定
{ "status": "need_bind", "token": "..." }

// 错误
{ "status": "error", "message": "错误描述" }
```

### 6.3 认证流程

1. 用户点击登录 → `wx.login()` 获取 code
2. POST `/api/userLogin` 或 `/api/adminLogin` 携带 `{ code }`
3. 服务端优先检查 JWT（`req.openid`），其次微信 code2session，最后 code 作为开发环境 fallback
4. 前端处理返回：
   - `login_success` → 保存 token + user profile → 跳转主页
   - `need_bind` → 保存 token → 显示绑定表单
   - 错误 → `showShortToast(message)`

### 6.4 关键响应契约（必须精确匹配）

| 函数 | status | 额外字段 |
|------|--------|----------|
| `userLogin` | `login_success` | `token`, `user: { id, hrId, name, studentId, department, identity, workGroup }` |
| `adminLogin` | `login_success` | `token`, `user: { ...同上, adminLevel }` |
| `bindUserInfo` | `success` | `hrInfo: { id, name, studentId }` |
| `bindAdminInfo` | `success` | `token`, `adminLevel` |

**不要修改这些字段名** — 前端多处页面依赖它们。

---

## 7. Git 工作流

### 7.1 分支策略

- `main` — 稳定/生产分支
- `feature/<功能名>` — 功能开发分支

**绝对不要直接在 `main` 上提交。** 先切 feature 分支。

### 7.2 Commit 格式 — Conventional Commits

```
<type>(<scope>): <中文描述>
```

| Type | 用途 |
|------|------|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `refactor` | 重构（不改变行为） |
| `style` | 样式/UI 调整 |
| `perf` | 性能优化 |
| `chore` | 杂项（构建、依赖等） |

**Scope 必须是具体模块名：** `venue`, `audit`, `scoring`, `portal`, `auth`, `notification`, `ui` 等。

示例：
```
feat(venue): 重新设计拖拽手柄 — ▲▼箭头+上下分离标签+时间后缀
fix(venue): 修复拖拽时间轴两处边界bug
refactor(notification): 通知模块从持久化改为实时查询
```

### 7.3 Auto-push

**每次编辑完成后自动 `git push`，不需要用户确认。** 先 commit 再 push。

---

## 8. 质量要求

### 8.1 完整性校验（最重要）

**每一步代码修改后，必须校验以下全部内容：**

1. **直接关联代码** — 本次修改的函数/组件是否正确工作
2. **调用方代码** — 所有调用此函数/组件的代码是否仍正常
3. **上下文无关代码** — 文件中其他函数是否因本次修改而受影响
4. **渲染测试** — WXML/WXSS 修改后确认视觉效果无异常
5. **功能测试** — 确认完整用户操作链（点击→输入→提交→反馈）无断点

**目标：确保代码可以直接推送到生产环境，没有任何问题。**

### 8.2 修改前检查

- [ ] 读取目标文件最新内容（不要假设文件内容不变）
- [ ] 搜索所有引用此文件/函数的位置
- [ ] 检查全局样式是否会影响新样式

### 8.3 修改后验证

- [ ] `project.config.json` 正常加载
- [ ] 无 WXML 编译错误
- [ ] 无 JS 运行时错误
- [ ] setData 调用不发送多余字段
- [ ] 微信开发者工具中可见组件渲染正确

### 8.4 跨模块影响速查

**修改以下文件时，必须同步检查受影响的模块：**

| 修改文件 | 必须检查的文件 |
|----------|---------------|
| `venueBooking.js` | `venueManage.js`、`myVenueBookings.js`、`pendingVenueApprovals.js`（共享区间算法和 flowTimeline） |
| `venueManage.js` | `venueBooking.js`（共享时间验证逻辑）、`venueBookings.js`（重定向目标） |
| `flowTimeline.js`（venue） | `venueBooking.wxml`、`venueManage.wxml`、`pendingVenueApprovals.wxml`（三页面共用） |
| `submissionDetail.js`（audit） | `pendingApprovals.js`、`myApprovalHistory.js`（审批操作后刷新列表） |
| `adminUtils.js`（scoring） | 所有 12 个 Behavior 文件（每个都可能引用 adminUtils 的函数） |
| `sharedApi.js`（scoring） | 所有 11 个 Behavior 文件（依赖 `callCloud()`） |
| `api.js`（全局） | 所有页面和 Behavior（callFunction 是所有 API 调用的入口） |
| `eventBus.js`（全局） | `portal.js`、`venueBooking.js`、`myVenueBookings.js`、`pendingVenueApprovals.js` |
| `app.wxss` / `home.wxss` | **不得修改** — 影响所有页面 |
| `blue-polish.wxss`（audit/venue） | **不得修改** — 影响整个 audit 或 venue 模块 |

### 8.5 高频修改陷阱

| 场景 | 常见遗漏 |
|------|---------|
| 新增页面 | 忘记在 `app.json` 的 `subPackages[].pages` 数组注册 |
| 新增 API | 只改前端 `callFunction` 调用，忘记后端注册路由到 `index.js` |
| 修改 setData 字段名 | 只改 JS，忘记同步改 WXML 中的绑定 |
| 删除函数 | 只删定义，忘记搜索所有调用处 |
| 修改函数签名 | 忘记更新所有 Behavior 和页面中的调用 |
| 拖拽相关修改 | 忘记测试 `dragActive: false` 重置（否则页面滚动永久禁用） |

---

## 9. 关键工具函数速查

### 9.1 前端工具 (miniprogram)

```javascript
// api.js
callFunction({ name, data })          // 通用 API 调用，返回 Promise
showShortToast(title, icon)           // Toast（自动截断 ≤7 中文字符）
formatAuditTime(raw)                  // 审核时间格式化 "YYYY-MM-DD HH:mm"
getErrorText(error, fallback)         // 提取错误文本

// eventBus.js
eventBus.on(event, callback)          // 注册事件监听
eventBus.off(event, callback)         // 注销事件监听
eventBus.emit(event, data)            // 发送事件

// tableFile.js
// CSV/Excel 解析工具
```

### 9.2 后端工具 (server/src/utils)

```javascript
safeString(val)                       // null/undefined → ''，避免 'NULL' 比较错误
generateId()                          // 64 位 base-62 随机字符串 ([0-9a-zA-Z])
toNumber(val, fallback)               // 安全数字转换
roundScore(val, decimals)             // 四舍五入评分
```

### 9.3 场地模块内部函数 (venueBooking.js)

```javascript
timeToMin(t)                          // "08:30" → 510
minToTime(m)                          // 510 → "08:30"
fmtLocalDate(d)                       // Date → "YYYY-MM-DD"（安全字符串比较）
snapMin(m, snap=10)                   // 取整到最近 SNAP 分钟
findBlockedOverlap(s, e, blocked)     // 区间是否跨越 blocked 区域
findOpenGap(s, e, openMerged)         // 区间是否落入开放间隙
buildBlockedIntervals(records)         // 从预约记录构建 blocked 区间
mergeIntervals(arr)                   // 合并重叠区间
findSmartEnd(startMin, open, blocked) // 找到 start+1h 的合法结束时间
```

---

## 10. 架构模式

### 10.1 Behavior 组合 — 管理面板模块化

管理面板 (`admin.js` ~587 行) 使用 WeChat `Behavior()` 组合 13 个模块：

```
admin.js
  ├── sharedApi.js         # 基础 API 包装
  ├── adminUtils.js        # 显示辅助工具
  ├── activityBehavior.js  # 评分活动 CRUD
  ├── templateBehavior.js  # 问题模板 + 拖拽排序
  ├── ruleBehavior.js      # 评分规则配置
  ├── resultBehavior.js    # 评分结果查看/导出
  ├── departmentBehavior.js
  ├── identityBehavior.js
  ├── workGroupBehavior.js
  ├── hrInfoBehavior.js    # 人事管理 + CSV 导入
  ├── auditBehavior.js
  ├── publicationBehavior.js
  ├── adminManagementBehavior.js
  └── settingsBehavior.js
```

**规则：** 新管理功能必须作为独立 Behavior 模块添加，不要写在 admin.js 主文件中。Behavior 之间通过 `sharedApi.js` 共享 API 访问。

### 10.2 EventBus — 跨页面通信

用于解耦页面间通知（如审核操作后刷新首页 badge）：

```javascript
// 页面 A：注册监听
eventBus.on('approvalChanged', this._onApprovalChanged);

// 页面 B：触发事件
eventBus.emit('approvalChanged', { type: 'approved' });

// 页面销毁时清理
onUnload() {
  eventBus.off('approvalChanged', this._onApprovalChanged);
}
```

### 10.3 页面生命周期

标准 WeChat Page 生命周期。**数据刷新放在 `onShow` 中，一次加载放在 `onLoad` 中：**

```javascript
Page({
  onLoad(options) {
    // 一次性的初始化：解析参数、加载静态配置
  },
  onShow() {
    // 每次显示时：刷新数据、重启轮询、重新检查状态
  },
  onHide() {
    // 页面隐藏时：停止轮询、清理定时器
  },
  onUnload() {
    // 页面卸载时：清理 EventBus 监听
  }
});
```

### 10.4 后端模块化 — 三模块 + 核心

```
server/src/modules/
├── core/       # 认证、组织、部门、身份、分组、HR、管理员、用户、系统
├── scoring/    # 评分活动、问题模板、评分规则、评分执行、结果、发布
├── audit/      # 审核流程、提交、签名、通知、文件安全、哈希链
└── venue/      # 场地管理、预约、审批流
```

---

## 11. 后端关键约束

- **所有数据表主键为 VARCHAR(64)**，由 `generateId()` 生成（64 位 base-62 随机字符串），无自增 ID
- **所有查询由 `org_id` 隔离**，通过 `getCurrentOrgId()` 读取当前组织
- **API 名称、参数、响应格式 = 原云函数**，保持向后兼容
- **`safeString()` 转换 null/undefined → ''** — 对 `openid` NULL 检查至关重要
- **JWT 中间件不拒绝未认证请求** — `req.openid` 为空字符串，由各路由自行检查
- **请求生命周期**：RequestContext(UUID) → Morgan → Helmet → CORS → Rate Limiter → Body Parser → Payload Check → Auth → Timeout(30s) → Route → 404 → Error Handler

---

## 12. 数据库核心表速查

| 类别 | 表名 | 用途 |
|------|------|------|
| 基础 | `organizations`, `system_config` | 组织记录、系统配置 |
| 架构 | `departments`, `identities`, `work_groups` | 部门、身份类别、工作分工 |
| 人事 | `hr_info`, `user_info`, `admin_info` | 人事记录、用户绑定、管理员 |
| 评分 | `score_activities`, `score_question_templates`, `score_questions` | 活动、模板、问题 |
| 规则 | `rate_target_rules`, `rate_rule_clauses`, `clause_template_configs` | 评分规则引擎 |
| 记录 | `score_records`, `score_answers` | 评分记录和答案 |
| 资料 | `hr_profile_templates`, `hr_profile_template_fields`, `hr_profile_records`, `hr_profile_record_values` | 人事扩展资料 |
| 归档 | 所有核心表对应 `_history` 表 | 组织切换时数据归档 |

完整建表语句见 `server/db/init.sql`。

---

## 13. 禁止事项清单

- ❌ 使用 `var`（必须 `let`/`const`）
- ❌ 英文注释
- ❌ 纯色背景（必须 linear-gradient）
- ❌ 新增按钮颜色（只用 primary/secondary/danger）
- ❌ 新增 chip 颜色（只用蓝/绿/橙/天蓝）
- ❌ 新增自定义动画
- ❌ 修改全局 CSS（home.wxss / blue-polish.wxss / app.wxss）
- ❌ 多次 setData 调用（必须合并为一次）
- ❌ 在 popup-mask 内放 `position: fixed; bottom: 0` 元素
- ❌ 在 WXML 中直接调用 `.split()` / `.replace()` / `.map()`
- ❌ 在 `main` 分支上直接提交
- ❌ Toast 超过 7 个中文字符
- ❌ 忽视关联代码的完整性校验
