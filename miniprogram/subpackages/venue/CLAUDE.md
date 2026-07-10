# CLAUDE.md — 场地借用模块 (venue)

> 模块专属规范。通用规范见根目录 `CLAUDE.md`，前端通用规范见 `miniprogram/CLAUDE.md`。

---

## 1. 模块结构

```
venue/
├── styles/blue-polish.wxss       # 场地模块全局样式（370 行）
├── utils/flowTimeline.js         # 审批流时间轴构建器
└── pages/
    ├── venueBooking/             # 🔥 用户端核心（1714 行）— 3 tab + 拖拽时间轴 + 自定义键盘
    ├── venueManage/              # 管理端核心（1802 行）— 3 tab + 规则引擎 + 审批流编辑器
    ├── venueBookings/            # 重定向桩（6 行 → venueManage?tab=bookings）
    ├── myVenueBookings/          # 用户预约列表（73 行，简化版）
    └── pendingVenueApprovals/    # 独立审批页（297 行）
```

---

## 2. venueBooking — 核心用户页面

### 2.1 三 Tab 统一页面

| Tab | 功能 |
|-----|------|
| 浏览 | 场地列表 + 时间表弹窗（周视图） + 借用表单弹窗 |
| 预约 | 用户自己的预约，含 `computeDisplayStatus()` 状态机 + flowTimeline |
| 审批 | 当前用户待审批项，30s 轮询 + 签名检测 |

### 2.2 拖拽时间轴

**这是场地模块最复杂的交互。**

**关键常量：**
```javascript
const TOTAL_MIN = 1440;   // 24 小时 = 1440 分钟
const SNAP = 10;           // 10 分钟对齐
```

**时间轴渲染：** `_buildTimeline()` — 24 小时分 30 分钟段，每段标记 `free`/`booked`/`activity`/`closed`，合并同状态段，百分比宽度渲染。

**两个拖拽手柄：**
- Start handle（轴上，向下箭头，蓝色 `#2563eb`）
- End handle（轴下，向上箭头，绿色 `#059669`）

**触摸处理 (`onHandleTouchMove`)：**
- 像素增量 → 分钟转换（`Math.round(px / width * TOTAL_MIN)`）
- `snapMin()` 取整到 10 分钟
- **唯一硬限制：** 今天不能选过去的时间
- **软限制：** blocked 区域和 end 交叉不做硬阻止（允许路过）
- `wx.nextTick` 帧节流（存 `_pendingSetData`，每帧只一次 `setData`）

**智能默认：**
- `findDefaultStartMin()` — 今天 → max(now, 第一个开放); 未来 → 第一个开放时间点
- `findSmartEnd(startMin, openMerged, blockedMerged)` — start + 1h，被 blocked 则前推
- `_findNearestAvailableDate()` — 过去日期 → 搜索未来 30 天找到有开放时段的日期

### 2.3 自定义时间键盘

**架构：** `position: fixed; bottom: 0; z-index: 101`（在 popup-mask 外部）

**状态机：**
```
normal → tap field → SELECTED（全选高亮）
SELECTED + tap digit → REPLACE + deselect
SELECTED + backspace → DESELECT（不删除）
SELECTED + tap same field → DESELECT（切换全选）
NORMAL + tap digit → APPEND（最多 2 位）
HOUR has 2 digits → auto-jump MIN + SELECTED
```

**灰键计算 (`_computeGrayKeys`)：**
- 结构限制：小时 max 23，分钟 max 59，前导数字限制
- 语义限制（start）：过去时间、开放时段外、blocked 区域内
- 语义限制（end）：必须 > start、区间不跨越 blocked、不落入 open gap

### 2.4 时间验证层次

1. **`_setStartTime()`** — 过去时间 → 开放时段 → blocked 区间 → end 续有效
2. **`_setEndTime()`** — > start → 开放时段内 → 区间无 gap → 区间无 blocked
3. **`_validateRange()`** — 提交前最终检查，报告具体冲突时间点
4. **`findSmartEnd()`** — 自动计算默认 end 时间

### 2.5 区间算法

```javascript
// 纯函数，module scope（不在 Page 内）
mergeIntervals(intervals)       // 合并重叠区间，O(n log n)
findOpenGap(rs, re, mergedOpen) // 在 [rs, re] 中找到第一个 gap 起点
findBlockedOverlap(rs, re, mergedBlocked) // 找到第一个 blocked 区间重叠
buildBlockedIntervals(dayData)  // 合并 bookedSlots + activitySlots
slotsToIntervals(slots)         // slot 对象 → {start, end} 分钟区间
```

---

## 3. venueManage — 管理端核心

### 3.1 三 Tab

| Tab | 功能 |
|-----|------|
| 场地管理 | 场地 CRUD + 规则管理弹窗 |
| 预约管理 | 所有场地预约列表 + 筛选 + 审批弹窗 |
| 用途管理 | 借用事由预设 CRUD |

### 3.2 规则系统（三层嵌套编辑器）

```
Rules Popup
├── 子 Tab: 开放时间 | 活动时间 | 预约规则
├── 规则编辑器弹窗
│   ├── 周期类型选择 (daily/weekly/monthly/yearly/range)
│   ├── 时间字段
│   └── 预约规则类型: admin/flow/direct
│       └── 审批流编辑器（仅 flow 类型）
│           ├── 步骤列表（可上下排序）
│           └── 步骤条件
│               ├── 部门多选器
│               ├── 身份多选器
│               └── 分组多选器（按部门 Tab 分组）
```

### 3.3 预约合并策略

`venueManage` 的预约列表使用复杂的合并策略：
- 始终获取所有 pending + 时间筛选的非 pending
- 合并去重（pending 优先置顶）
- Client-side 过滤 computed 状态（`inUse`、`completed`）

---

## 4. flowTimeline.js — 审批流时间轴

```javascript
buildFlowTimeline(approvalProgress) → Array<{
  nodeClass,    // CSS class: 'flow-node-active' | 'flow-node-done' | 'flow-node-rejected' | 'flow-node-pending'
  dotClass,     // 圆点样式
  icon,         // ✓ / ✗ / 步骤号
  label,        // 状态文字
  meta,         // 审批时间 / "等待中"
  comment,      // 审批意见（点击展开）
  approverName, // 审批人姓名
  approvedAt,   // 审批时间
  isLast        // 是否最后一步（隐藏连接线）
}>
```

预计算所有渲染数据，WXML 零逻辑。**三个页面共用此工具**（venueBooking、venueManage、pendingVenueApprovals）。

---

## 5. 轮询签名检测

```javascript
_buildPendingSignature(pending) {
  // 拼接 id:status:step:totalStep:stepName:createdAt
  return pending.map(item =>
    [item.id, item.status, item.approvalCurrentStep,
     item.approvalTotalSteps, item.currentStepName, item.createdAt].join(':')
  ).sort().join('|');
}
```

只有签名串变化时才触发 `setData`。即使签名相同也更新"最后刷新时间"文字。

---

## 6. 事件通信

| 事件 | 触发时机 | 监听方 |
|------|---------|--------|
| `venue:changed` | 取消预约、审批操作后 | myVenueBookings、pendingVenueApprovals、venueBooking 自身 |
| `approval:done` | 审批完成后 | portal 页面（刷新 badge） |

**注意：** `myVenueBookings` 同时 emit 两个事件；`venueBooking` 用 `_emitVenueChanged` 辅助方法。

---

## 7. 模块特定坑点

1. **拖拽手柄 `onHandleTouchMove` 必须在 `wx.nextTick` 中做 setData** — 否则高频调用导致卡顿
2. **键盘面板必须放在 popup-mask 外部** — popup-mask 的 flexbox 居中会错误定位 fixed 元素
3. **时间键盘显示框使用 WXS 提取时分** — `{{fmt.hour(time)}}` / `{{fmt.min(time)}}`
4. **日期字符串比较用 `fmtLocalDate()` 格式** — `YYYY-MM-DD` 字符串比较安全
5. **venueBookings 页面是重定向桩** — 不要在里面添加逻辑，它只是一个兼容旧导航的跳板
6. **规则编辑器的审批流编辑器** 深度嵌套 — 修改时注意 `_editingStepIdx` 和 `_editingConditionIdx` 状态

---

## 8. 模块特定禁止事项

- ❌ 拖拽手柄忘记做 `wx.nextTick` 节流 → 严重卡顿
- ❌ 时间键盘放在 popup-mask 内 → 键盘出现在右侧
- ❌ 修改区间算法函数签名不检查所有调用处（三个页面都依赖）
- ❌ `flowTimeline.js` 输出格式变更不检查三个页面的 WXML
- ❌ 修改拖拽限制逻辑不给所有三种限制（过去时间/blocked/end-crossing）都测试
