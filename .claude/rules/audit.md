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
├── components/signaturePad/   # Canvas 手写签名板
└── pages/
    ├── submissionDetail/       # 🔥 核心页面（2955 行）
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
2. 白板 rect、`Touch.clientX/clientY` 和线段端点统一为视口 CSS px 绝对坐标。线段数据保存 `screenX1/Y1/screenX2/Y2`，禁止 scrollTop、DPR、rpx 或固定偏移。
3. 普通视图渲染时才从绝对端点减一次白板 `rect.left/top`；白板与笔迹层必须裁切。
4. 隐藏 Canvas 不绑定触摸，只在确认时将绝对端点投影到白板局部坐标并导出 1:1 PNG。
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
