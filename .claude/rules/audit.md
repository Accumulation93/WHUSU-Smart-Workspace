---
paths: "miniprogram/subpackages/audit/**"
---

# CLAUDE.md — 审核模块 (audit)

> 模块专属规范。通用规范见根目录 `CLAUDE.md` 和 `.claude/rules/miniprogram.md`。

---

## 1. 模块结构

```
audit/
├── styles/blue-polish.wxss
├── components/signaturePad/   # 普通 View 实时笔迹 + 隐藏 Canvas 1:1 导出器
└── pages/
    ├── submissionDetail/       # 核心详情、审批与重提交页面
    ├── pendingApprovals/       # 待审批列表（30s 轮询）
    ├── mySubmissions/          # 我的提交（筛选 + 未读标记）
    ├── myApprovalHistory/      # 审批历史
    ├── signatureManager/       # 签名模板 CRUD
    └── verification/           # 哈希链验证
```

---

## 2. submissionDetail 核心架构

### 页面模式

| 模式 | 触发 | 功能 |
|------|------|------|
| `create` | `?action=create` | 创建审核申请（模板或自由流程） |
| `view` | `?action=view&id=xxx` | 查看、审批、编辑、撤回 |

### 审批工作流

1. `getSubmissionDetail` → submission + steps + files + signatures + 角色标志
2. 构建 `flowTimeline`（按 round 分组）— ⚠️ 此逻辑在 submissionDetail.js **内部**实现，与 venue 的 `utils/flowTimeline.js` 独立
3. 两种审批路径：弹窗审批 / 内联审批（主 UX 路径）

### 审批步骤卡展开规范

审批步骤卡展开详情必须位于同一 `.flow-info` 卡片内部，并在该可视卡片上显式添加 `.flow-info-expanded`；禁止只依赖祖先状态类和 CSS 顺序。展开态必须稳定覆盖已通过绿色或驳回红色背景并切换为白色玻璃层。`.flow-expand-detail` 与 `.flow-detail-processed-*`、`.flow-detail-comment` 只在 `subpackages/main/styles/home.wxss` 维护，场地借用详情必须复用该层级与样式；修改后验收通过/驳回的收起和展开四种状态。

### 模板审批人重新指定契约

- 模板修改时，只能在模板明确允许的情况下显示第一步“指定/修改指定”入口；服务端必须再次校验第一步开关、组织范围和模板原始审批条件。
- 第一步指定入口必须位于第一步模板预览卡内部；已指定人员在该卡内以紧凑气泡展示，禁止另起独立的第一步审批人卡片，未允许指定时不显示入口。
- 驳回后重提交创建新轮次时，模板步骤必须从模板原始条件重建，不能沿用上一轮已经收窄的指定人员条件；这样每个审批人重新收到某一步时，仍能按该步骤原始候选范围重新指定下一步。
- 审批页只在“下一步允许指定”时显示人员选择器；未开启时不显示入口，服务端也必须拒绝携带的指定人员参数。
- 人员选择器使用审批专用候选人接口，不调用管理员专用 `listHrInfo`；前端筛选只作用于当前组织返回的候选人集合。

### Round 和 Resubmit

| 模式 | 行为 |
|------|------|
| `fresh` | 从第 1 步重新开始 |
| `from_rejector` | 从驳回步骤继续 |

**Step 状态：** `pending` → `approved` / `rejected` / `superseded`（新 round 覆盖）

### 签名定位系统

**Snapshot-undo：** 打开定位时存 `_placementSnapshot`；取消时恢复；确认时丢弃。

---

## 3. signaturePad 组件 — 视口绝对坐标契约

签名板固定使用普通视图实时笔迹，原生 Canvas 只负责隐藏导出：

1. 可视白板为普通 `view`，实时线段也为普通 `view`；可视原生 Canvas 属于硬性违规。
2. 白板 rect、`Touch.clientX/clientY` 和线段端点统一为视口 CSS px（逻辑像素）绝对坐标。线段事实数据保存 `screenX1/Y1/screenX2/Y2`，禁止 scrollTop、DPR、rpx 或固定偏移。
3. 白板完成布局、尺寸变化或弹窗重新显示后重新测量 rect；普通视图渲染时才根据当前 rect 从绝对端点减一次 `left/top`，不得把旧 rect 推导的局部坐标写入事实数据。白板与笔迹层必须裁切。
4. 隐藏 Canvas 不绑定触摸，只在确认时将绝对端点投影到白板局部坐标并导出 1:1 PNG；导出 buffer 按白板实际可视宽高统一取整，禁止 DPR 放大。
5. 严格 UI 审计必须检查上述结构；改动后必须用真实鼠标/触控事件验证，禁止直接调用组件方法生成验收线。

---

## 4. 通知系统

7 种通知类型（`pending_approval`、`submission_approved/rejected/progress`、`booking_approved/rejected` 等）。
14 天自动清理。自愈对账（`hasPendingApprovalNotification`）。批量创建上限 200 条。

---

## 5. 未读标记（Read Cursors）

服务端 read cursors 机制，非客户端状态：
```javascript
await callFunction({ name: 'markSubmissionRead', data: { submissionId } });
await callFunction({ name: 'markAllSubmissionsRead' });
```

---

## 6. 哈希链验证

三种模式：编号查询 / ID 查询 / 文件验证（比对当前 hash 与链上最后签名 hash）。

---

## 7. 模块特定禁止事项

- ❌ 修改 submissionDetail 不测试创建和审批两条完整路径
- ❌ 改动 signaturePad 不测试开发者工具模拟器和实际触控设备
- ❌ 审批流程中跳过 EventBus `approval:done` 事件
- ❌ 签名定位弹窗取消后不恢复 `_placementSnapshot`
- ❌ 审批后忘记 `markSubmissionRead`
