---
paths: "miniprogram/**"
---

# CLAUDE.md — 微信小程序前端

> 本文件覆盖前端通用规范。项目级规范（代码风格、设计系统、Git 工作流等）见根目录 `CLAUDE.md`。

---

## 1. 文件组织

每个页面 **必须** 是独立目录，4 个同名文件：
```
pages/<pageName>/
├── <pageName>.js      # Page({}) 逻辑
├── <pageName>.wxml    # 模板
├── <pageName>.wxss    # 样式（页面级覆写）
└── <pageName>.json    # 页面配置
```

每个组件同理：4 个同名文件在组件目录下。

### 1.1 新增页面/分包

**新增页面步骤：**

1. 在对应目录下创建 4 个文件（js/wxml/wxss/json）
2. 在 `app.json` 中注册：
   - 主包页面 → `pages` 数组
   - 分包页面 → `subPackages[].pages` 数组
3. 分包 root 路径规范：
   ```json
   {
     "root": "subpackages/<模块名>",
     "name": "<模块名>",
     "pages": ["pages/<页面名>/<页面名>"]
   }
   ```

**关键约束：**
- 主包总大小 ≤ 2MB
- 单个分包 ≤ 2MB
- 所有分包总大小 ≤ 20MB
- 尽量用 `lazyCodeLoading: "requiredComponents"`

### 1.2 app.js 的特殊 require

```javascript
// app.js
require('./utils/tableFile.js');  // ⚠️ 必须保留！
```

即使 `onLaunch` 是空的，这个 `require` **绝对不能删除**。

---

## 2. 全局样式冲突

项目中有 **多处 CSS 重名选择器**：

| 文件 | 关键选择器 | 影响范围 |
|------|-----------|----------|
| `app.wxss` | popup 框架、全局 reset | 所有页面 |
| `pages/home/home.wxss` | `.field-input` (`display: flex`)、`.card`、`.hero` | import 它的所有页面 |
| `subpackages/audit/styles/blue-polish.wxss` | `.field-input` (`padding: 22rpx`)、`.card`、`.chip` | audit 所有页面 |
| `subpackages/venue/styles/blue-polish.wxss` | `.field-input`、`.card`、`.chip`、`.section-title` | venue 所有页面 |

**规则：**
- **绝不修改** `app.wxss`、`home.wxss`、`blue-polish.wxss`
- 页面级覆写使用更具体的选择器

---

## 3. Page 生命周期规范

```javascript
Page({
  onLoad(options) { /* 一次性初始化 */ },
  onShow() { /* 每次显示时刷新数据 */ },
  onHide() { /* 停止轮询、清理定时器 */ },
  onUnload() { /* 清理 EventBus 监听 */ }
});
```

---

## 4. EventBus

```javascript
const eventBus = require('../../utils/eventBus');
eventBus.on('venue:changed', this._handler);   // onShow 注册
eventBus.off('venue:changed', this._handler);  // onUnload 注销
eventBus.emit('venue:changed', { reason });
```

---

## 5. API 调用

```javascript
const { callFunction } = require('../../utils/api');
const result = await callFunction({ name: 'getScoreFormData', data: { targetId } });
```

---

## 6. 页面跳转规范

```javascript
wx.navigateTo({ url: '/subpackages/venue/pages/venueBooking/venueBooking' });
wx.redirectTo({ url: '/subpackages/venue/pages/venueManage/venueManage?tab=bookings' });
```

---

## 7. 关键禁止事项（前端专属）

- ❌ WXML 中直接调用 `.split()` / `.replace()` / `.map()` → 用 WXS
- ❌ `<input>` 上设置 `display: flex` → 用 `display: block` + `line-height`
- ❌ `popup-mask` 内放 `position: fixed; bottom: 0` 元素
- ❌ 多次 `setData()` 调用 → 合并为一次
- ❌ `wx.showToast` title 超 7 中文字符
- ❌ 修改全局样式文件（app.wxss / home.wxss / blue-polish.wxss）
- ❌ 拖拽 touchmove 中不节流 `createSelectorQuery`
