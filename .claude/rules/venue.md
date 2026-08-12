---
paths: "miniprogram/subpackages/venue/**"
---

# CLAUDE.md — 场地借用模块 (venue)

> 模块专属规范。通用规范见根目录 `CLAUDE.md` 和 `.claude/rules/miniprogram.md`。

---

## 1. 模块结构

```
venue/
├── styles/blue-polish.wxss
├── utils/flowTimeline.js       # 审批流时间轴（⚠️ audit 有自己的独立实现）
└── pages/
    ├── venueBooking/           # 🔥 用户端核心（1714 行）
    ├── venueManage/            # 管理端核心（1802 行）
    ├── venueBookings/          # 重定向桩（6 行）
    ├── myVenueBookings/        # 简化版用户预约列表（73 行）
    ├── pendingVenueApprovals/  # 独立审批页（297 行）
    ├── venueApprovalHistory/   # 当前身份审批历史
    └── venueApprovalHistoryDetail/ # 审批历史详情与后续进展
```

---

## 2. venueBooking — 拖拽时间轴

**常量：** `TOTAL_MIN = 1440`, `SNAP = 10`

**唯一硬限制：** 今天不能选过去的时间
**软限制：** blocked 区域和 end 交叉不硬阻止（允许路过）

**帧节流：** `wx.nextTick` 存 `_pendingSetData`，每帧只一次 `setData`

**手柄颜色：** Start 蓝色 `#2563eb`，End 绿色 `#059669`

---

## 3. 自定义时间键盘

**状态机：**
```
normal → tap field → SELECTED → tap digit → REPLACE
SELECTED + backspace → DESELECT
HOUR has 2 digits → auto-jump MIN
```

**灰键计算：** 结构限制（hour≤23, min≤59）+ 语义限制（时间验证）

---

## 4. 时间验证层次

1. `_setStartTime()` — 过去时间 → 开放时段 → blocked 区间 → end 有效性
2. `_setEndTime()` — > start → 开放时段内 → 区间无 gap → 区间无 blocked
3. `_validateRange()` — 提交前最终检查，报告具体冲突时间点
4. `findSmartEnd()` — 自动计算默认 end（start+1h，被 blocked 则前推）

---

## 5. 区间算法（纯函数，module scope）

```javascript
mergeIntervals(intervals)         // O(n log n) 合并重叠区间
findOpenGap(rs, re, mergedOpen)   // 在 [rs, re] 中找第一个 gap
findBlockedOverlap(rs, re, mb)    // 找第一个 blocked 区间重叠
buildBlockedIntervals(dayData)    // 合并 booked + activity slots
slotsToIntervals(slots)           // slot 对象 → {start, end}
```

---

## 6. venueManage — 管理端

### 规则系统（三层嵌套）

**5 种预约规则类型（⚠️ direct 与其他所有类型互斥）：**
- `direct` — 提交即通过
- `identity` — 特定身份审批
- `person` — 指定人员审批
- `admin` — 任意管理员审批
- `flow` — 多步骤审批流

### Display 状态机

| DB status | displayStatus | 条件 |
|-----------|--------------|------|
| `approved` | `inUse` | now ∈ [time_start, time_end] |
| `approved` | `completed` | now > time_end |
| `approved` | `approved` | now < time_start |

### 管理端审批页签与历史

- 管理端顶部页签独立提供“待我审批”，不再把待办入口嵌在“借用管理”筛选区内；待办页继续使用审批专用候选人和审批动作接口。
- 待我审批页提供“审批历史”入口。历史接口每次直接扫描当前组织的全部 `venue_bookings` 记录，再按当前审批人、当前身份上下文匹配审批快照或兼容的旧审批字段；不得建立或依赖单独的审批历史表，也不得用当前组织全部借用记录冒充历史。旧快照缺少身份上下文时，必须按稳定人员/管理员身份字段回退匹配，避免历史记录因字段格式升级而消失。
- 审批历史页不显示刷新按钮；下拉刷新仍可作为系统手势保留。每条借用记录只显示一张卡片，卡片不展示处理时间、处理步骤或审批意见，点击卡片进入 `venueApprovalHistoryDetail` 查看完整借用信息、本人处理的全部步骤及之后的审批进展。
- 历史记录保留借用当前状态、本人处理时间、处理结果、步骤名称和审批意见；组织或身份切换后必须作废旧请求并重新加载。
- 普通用户端必须在“待我审批”页签内提供“审批历史”入口，不得放在“我的借用”页或借用记录区域。审批历史详情必须复用日程借用详情的同一组件与字段形状，不能再维护只展示审批事件的第二套详情界面；服务端必须先完成当前组织、当前身份和当前操作者的历史权限匹配，再返回详情。
- 日程、我的借用和审批历史的详情进度必须使用同一套预计算逻辑，同时传递全部 `flowSteps` 与 `snapshots`。已完成步数取数据库当前步骤与快照最高已完成步骤的并集并限制在总步骤内，避免后续步骤通过后仍显示旧的“已完成 1 步”。

### 规则编辑器布局硬规范

- 场地借用规则编辑器沿用审批子应用的步骤编辑结构：固定标题、独立滚动正文、固定底部操作栏三段分离；滚动正文必须是直接子级 `scroll-view.ui-dialog-body`，保存按钮必须位于 `ui-dialog-footer`。窗口高度由标题、正文实际内容和底部操作栏通过 flex 自然分配，只允许视口安全上限，禁止固定内容高度、固定 `max-height` 或固定翻页尺度。
- 活动占用只能先选择每天/每周/每月/每年周期，再在该周期下互斥勾选“按生效时间范围”或“按重复次数”；不勾选表示不限周期范围。界面只显示当前选项字段，时间范围、重复次数不是新的周期类别。服务端统一展开为具体日期的占用片段，跨日片段按日裁切后用于日程展示与借用冲突校验。
- 日程中的活动占用块和活动规则记录都必须可点击；点击后显示活动名称、场地、本次占用时间和重复规则，禁止仅渲染颜色块而无响应。
- 审批步骤参考审核子应用模板步骤展开样式。每条条件使用紧凑强调卡，部门、职能组、身份按语义行展示并自然换行，禁止大块空白。
- 每个“指定”条件必须显示实际的部门、职能组、身份名称；步骤卡片、步骤编辑器和条件编辑器都不得只显示“指定部门/指定职能组/指定身份”。名称由已加载的字典预计算后渲染，异步加载完成必须刷新，长名称允许在标签内换行。
- 编辑条件时隐藏步骤编辑器，不能同时渲染两个编辑器；部门、职能组、身份使用统一纵向条件选项卡，选择结果紧随对应条件显示。
- 步骤和条件子编辑器的关闭状态必须使用明确的 `null`，不能用 `undefined` 依赖小程序视图清除；取消必须关闭且不写回，保存必须先把编辑副本写回上级列表再关闭。
- 规则数量增加时，正文必须能滚动到底部；添加步骤、编辑、删除、取消和保存都必须保留原有事件与字段，并在手机、Pad 竖屏、Pad 横屏均可点击。
- 步骤条件卡必须按“条件关系标题 + 部门/职能组/身份三行语义字段”展示，范围值使用深色正文、标签使用弱化颜色并允许换行，禁止连续蓝色小字造成视觉噪声。
- 添加步骤、编辑步骤、添加条件和编辑条件后，必须通过 `scroll-into-view` 或等价的语义目标定位到对应编辑器；不得写死 scrollTop 或像素偏移，也不得要求用户自行翻页查找。关闭编辑器时必须清理定位状态。
- 任何规则编辑器 UI 改动完成后，必须执行 UI 审计、兼容性审计、差异检查，并通过真实操作验证打开、滚动到底、编辑条件和保存链路。
- 借用开放和截止规则存放在组织 + 场地策略层，分别支持不设置、提前天数、提前小时/分钟；不设置的边界语义必须在 UI 明示，且由服务端根据借用开始时间动态校验，禁止固定偏移值。

---

## 7. flowTimeline.js

预计算所有渲染数据（nodeClass、dotClass、icon、label、meta、comment、approverName、approvedAt、isLast）。
三个页面共用：venueBooking、venueManage、pendingVenueApprovals。

---

## 8. 模块特定禁止事项

- ❌ 拖拽手柄忘记 `wx.nextTick` 节流 → 严重卡顿
- ❌ 时间键盘放在 popup-mask 内 → 键盘出现在右侧
- ❌ 修改区间算法函数签名不检查所有调用处
- ❌ `flowTimeline.js` 输出格式变更不检查三个页面的 WXML
- ❌ 修改拖拽限制逻辑不给三种限制（过去时间/blocked/end-crossing）都测试
- ❌ venueBookings 页面添加逻辑（它是重定向桩）
