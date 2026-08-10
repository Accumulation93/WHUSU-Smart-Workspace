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
