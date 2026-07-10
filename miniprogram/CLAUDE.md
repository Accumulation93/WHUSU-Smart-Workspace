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

---

## 2. 全局样式冲突 — 最高优先级注意事项

项目中有 **多处 CSS 重名选择器**，修改样式前必须先检查冲突来源：

| 文件 | 关键选择器 | 影响范围 |
|------|-----------|----------|
| `app.wxss` | popup 框架、全局 reset | 所有页面 |
| `pages/home/home.wxss` | `.field-input` (`display: flex`)、`.card`、`.hero` | import 它的所有页面 |
| `subpackages/audit/styles/blue-polish.wxss` | `.field-input` (`padding: 22rpx`)、`.card`、`.chip` | audit 所有页面 |
| `subpackages/venue/styles/blue-polish.wxss` | `.field-input`、`.card`、`.chip`、`.section-title` | venue 所有页面 |

**规则：**
- **绝不修改** `app.wxss`、`home.wxss`、`blue-polish.wxss`（它们是全局基准）
- 页面级覆写使用更具体的选择器（如 `.booking-form-popup .field-input`）
- 遇到覆写不生效 → 检查是否被上面的全局样式覆盖

---

## 3. Page 生命周期规范

```javascript
Page({
  onLoad(options) {
    // 一次性初始化：解析 URL 参数、加载静态配置
  },
  onShow() {
    // 每次显示时：刷新数据、启动轮询、重新检查状态
    // ⚠️ 数据刷新放这里，不要放 onLoad
  },
  onHide() {
    // 页面隐藏时：停止轮询、清理定时器
  },
  onUnload() {
    // 页面卸载时：清理 EventBus 监听、释放资源
  }
});
```

---

## 4. EventBus — 跨页面通信

`utils/eventBus.js` 提供轻量级发布/订阅：

```javascript
const eventBus = require('../../utils/eventBus');

// 注册（onShow 中）
onShow() {
  eventBus.on('venue:changed', this._onVenueChanged);
}

// 注销（onUnload 中，防止内存泄漏）
onUnload() {
  eventBus.off('venue:changed', this._onVenueChanged);
}

// 发送
eventBus.emit('approval:done');
eventBus.emit('venue:changed', { reason: 'cancelled', bookingId: 'xxx' });
```

**已有事件：**
| 事件名 | payload | 用途 |
|--------|---------|------|
| `approval:done` | 无 | 审核操作完成，portal 刷新 badge |
| `venue:changed` | `{ reason, bookingId }` | 场地数据变更，各页面刷新 |

---

## 5. API 调用

所有 API 调用通过 `utils/api.js` 的 `callFunction()`：

```javascript
const { callFunction } = require('../../utils/api');

// Promise 风格（推荐）
const result = await callFunction({ name: 'getScoreFormData', data: { targetId } });

// 带错误处理
try {
  const res = await callFunction({ name: 'saveScoreActivity', data: form });
  // res 就是服务端返回的 data
} catch (err) {
  wx.showToast({ title: '操作失败', icon: 'none' });
}
```

- 自动添加 `Authorization: Bearer <token>`
- 15 秒超时（自动 abort）
- 所有业务 API 均为 POST 到 `https://accumulation93.com/api/<name>`

---

## 6. 轮询模式

项目中多处使用 30 秒间隔轮询，标准模式：

```javascript
onShow() {
  this.loadData();
  this._pollTimer = setInterval(() => this._poll(), 30000);
},
onHide() {
  if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
},
_poll() {
  // 优先做轻量检测（如 count 对比），只有变化时才全量刷新
}
```

**签名检测**（venue 模块）：用数据签名串避免无效刷新 — 将关键字段拼接排序后 hash，只有签名变化才触发 `setData`。

---

## 7. 页面跳转规范

```javascript
// 跳转分包页面
wx.navigateTo({ url: '/subpackages/venue/pages/venueBooking/venueBooking' });

// 跳转主包页面
wx.navigateTo({ url: '/pages/portal/portal' });

// 带参数
wx.navigateTo({ url: '/subpackages/scoring/pages/score/score?targetId=' + id });

// 重定向（替换当前页，不增加页面栈）
wx.redirectTo({ url: '/subpackages/venue/pages/venueManage/venueManage?tab=bookings' });
```

---

## 8. 关键禁止事项（前端专属）

- ❌ 在 WXML 中直接调用 `.split()` / `.replace()` / `.map()` → 用 WXS
- ❌ 在 `<input>` 上设置 `display: flex` → 用 `display: block` + `line-height`
- ❌ 在 `popup-mask` 内放 `position: fixed; bottom: 0` 元素 → 放外面
- ❌ 多次 `setData()` 调用 → 合并为一次
- ❌ `wx.showToast` title 超过 7 个中文字符 → 用 `showShortToast()`
- ❌ 修改全局样式文件（app.wxss / home.wxss / blue-polish.wxss）
- ❌ 拖拽 touchmove 中不节流 `createSelectorQuery` → 节流到 33ms
