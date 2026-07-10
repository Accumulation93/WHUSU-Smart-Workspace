# CLAUDE.md — REDSU Scoring System

> AI 编程全局指南。子模块专属规范见 `.claude/rules/` 目录。
> 最后更新：2026-07-10

---

## 1. 项目概述

**REDSU 智慧工作台** — 武汉大学某部门成员互评考核微信小程序。

- **前端**：微信小程序原生框架（WXML / WXSS / JS），无第三方框架
- **后端**：Node.js Express (HTTPS :3000)，MySQL 8.0 (InnoDB, utf8mb4, `mysql2/promise`)
- **认证**：JWT Bearer Token（7天过期）+ 微信 code2session
- **部署**：Ubuntu 22.04 + PM2 ×2 + Nginx 反向代理
- **App ID**：`wxa0946295a962ee2e`，生产域名：`accumulation93.com`

模块：考核评分 / 人事管理 / 审核审批 / 场地借用。目录结构见各 `.claude/rules/` 文件。

---

## 2. 代码规范

### 2.1 变量声明 — 强制 `let` / `const`，禁止 `var`

**这是硬性规定。** 编辑任何文件时，必须将该文件中所有 `var` 迁移为 `let`/`const`。不被重新赋值→`const`，会被重新赋值→`let`。

> ⚠️ **例外**：WXS 文件（`.wxs`）不支持 `let`/`const`，必须保留 `var`。

### 2.2 注释语言：中文

所有注释、文档、commit message 使用中文。

### 2.3 命名规范

| 类别 | 规范 | 示例 |
|------|------|------|
| 文件/目录/函数/变量 | camelCase | `venueBooking.js`, `callFunction()` |
| 私有/内部 | `_` 前缀 | `_dragState`, `_computeGrayKeys()` |
| 常量 | UPPER_SNAKE_CASE | `API_BASE`, `TOTAL_MIN` |
| CSS class | kebab-case | `.drag-ghost-card` |
| 数据库表/列 | snake_case | `hr_info`, `score_records` |

### 2.4 文件组织

每个页面/组件必须是独立目录，包含同名 `.js`、`.wxml`、`.wxss`、`.json` 四个文件。

### 2.5 代码风格

- Page 顶层方法用传统 `function`，回调用箭头函数
- 字符串优先单引号，模板用反引号
- 新代码用 `async/await`，模块导出用 `module.exports`

---

## 3. Git 工作流

### 3.1 分支策略

- `main` — 稳定分支。**禁止直接在 `main` 上提交。**
- `feature/<功能名>` — 功能开发分支。

### 3.2 Commit 格式 (Conventional Commits)

```
<type>(<scope>): <中文描述>
```

| Type | 用途 | Type | 用途 |
|------|------|------|------|
| `feat` | 新功能 | `fix` | Bug 修复 |
| `refactor` | 重构 | `style` | 样式/UI |
| `perf` | 性能优化 | `chore` | 杂项 |

Scope 用具体模块名：`venue`, `audit`, `scoring`, `portal`, `auth`, `notification`, `ui` 等。

### 3.3 自动提交 — 每次变更必须 commit + push

**每次代码修改完成后，自动 `git add -A && git commit -m "..." && git push`，不需要用户提醒或确认。** 这是强制性工作流，不得跳过。

---

## 4. 设计系统 — 蓝奢玻璃风格

> 完整规范：`.claude/skills/blue-glass-ui/SKILL.md`

### 4.1 色板

| 角色 | 色值 |
|------|------|
| 主蓝 | `#1d4ed8` / `#2563eb` / `#3b82f6` / `#60a5fa` |
| 标题文字 | `#0f172a`，正文 | `#1e293b` |
| 次要文字 | `#64748b`，弱化 | `#94a3b8` |

### 4.2 Chips — 仅 4 色

| 变体 | 背景 | 文字 |
|------|------|------|
| 蓝 | `rgba(219,234,254,0.76)` | `#1d4ed8` |
| 绿 | `rgba(209,250,229,0.78)` | `#15803d` |
| 橙 | `rgba(255,237,213,0.78)` | `#c2410c` |
| 天蓝 | `rgba(224,242,254,0.76)` | `#0369a1` |

### 4.3 按钮 — 仅 3 种

- **Primary** — 蓝渐变 + 白字
- **Secondary** — 白玻璃 + 深色字
- **Danger** — 红渐变 + 白字（仅删除/解绑等破坏性操作）

### 4.4 容器黄金法则

每个卡片/容器必须同时满足：
1. `linear-gradient` 背景（`rgba(255,255,255,0.80-0.96)`），**绝不纯色**
2. `border: 1rpx solid rgba(255,255,255,0.62-0.96)`
3. `box-shadow` + `inset 0 1rpx 0 rgba(255,255,255,0.78)`（顶部高光）
4. `backdrop-filter: blur(24rpx)`

### 4.5 页面背景（必须用此渐变）

```css
page {
  background:
    radial-gradient(circle at 12% 10%, rgba(96,165,250,0.16) 0%, transparent 26%),
    radial-gradient(circle at 86% 18%, rgba(191,219,254,0.22) 0%, transparent 24%),
    linear-gradient(135deg, #f8fbff 0%, #f1f6fc 48%, #edf3fa 100%);
}
```

### 4.6 其他硬性约束

- 唯一动画：`glassFadeUp`（`opacity: 0→1, translateY: 18rpx→0`），不创建自定义动画
- 圆角：Hero `38rpx`，卡片 `30rpx`，按钮 `24rpx`，Chip `999rpx`
- **禁止新增**按钮颜色、chip 颜色、自定义动画

---

## 5. 已知坑点 TOP 5

> 全部坑点见 `.claude/rules/miniprogram.md` §3。"坑点大全"。

1. **WXS 必须用于模板中字符串操作** — WXML 不支持 `.split()`/`.map()`，必须写 WXS 模块
2. **`<input>` 禁用 `display: flex`** — 用 `display: block` + `line-height` + `padding` 居中
3. **禁止修改全局样式** — `app.wxss`、`home.wxss`、`blue-polish.wxss` 影响所有页面
4. **`setData` 必须合并为一次调用** — 多次 setData → 重复渲染 → 卡顿
5. **Toast ≤7 中文字符** — 超长会被微信截断。用 `showShortToast()`（已内置截断）

---

## 6. 质量要求

**每次修改后必须校验：**
1. 直接关联代码是否正确
2. 所有调用方代码是否正常
3. 文件内其他函数是否受影响
4. WXML/WXSS 修改后渲染无误
5. 完整用户操作链无断点

**目标：代码可直接推送到生产环境。**

### 修改前检查
- 读取文件最新内容（不要假设）
- 搜索所有引用此文件/函数的位置
- 检查全局样式是否影响新样式

### 跨模块影响速查

| 修改文件 | 必须同时检查 |
|----------|-------------|
| `api.js` | 所有页面和 Behavior |
| `eventBus.js` | `portal.js`、venue 各页面 |
| `adminUtils.js` | 所有 12 个 Behavior |
| `flowTimeline.js` (venue) | 3 个 venue 页面的 WXML |
| `submissionDetail.js` | `pendingApprovals.js`、`myApprovalHistory.js` |
| `app.wxss` / `home.wxss` / `blue-polish.wxss` | **禁止修改** |

### 高频陷阱

| 场景 | 易遗漏 |
|------|--------|
| 新增页面 | 忘记在 `app.json` 注册 |
| 新增 API | 只改前端，忘注册后端路由 |
| 修改 setData 字段名 | 忘记同步 WXML 绑定 |
| 拖拽相关 | 忘记 `dragActive: false` 重置 |

---

## 7. 禁止事项清单

- ❌ 使用 `var`（WXS 除外）
- ❌ 英文注释
- ❌ 纯色背景（必须 linear-gradient）
- ❌ 新增按钮颜色 / chip 颜色 / 自定义动画
- ❌ 修改全局 CSS（`app.wxss` / `home.wxss` / `blue-polish.wxss`）
- ❌ 多次 `setData` 调用不合并
- ❌ `popup-mask` 内放 `position: fixed; bottom: 0` 元素
- ❌ WXML 中直接调用 `.split()` / `.replace()` / `.map()`
- ❌ 在 `main` 分支直接提交
- ❌ Toast 超过 7 个中文字符
- ❌ 修改后不 commit + push
- ❌ 忽视关联代码的完整性校验
