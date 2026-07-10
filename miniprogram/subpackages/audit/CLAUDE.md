# CLAUDE.md — 审核模块 (audit)

> 模块专属规范。通用规范见根目录 `CLAUDE.md`，前端通用规范见 `miniprogram/CLAUDE.md`。

---

## 1. 模块结构

```
audit/
├── styles/blue-polish.wxss         # 审核模块全局样式（371 行）
├── components/
│   └── signaturePad/               # Canvas 手写签名板组件
└── pages/
    ├── mySubmissions/              # 我的提交（可筛选、已读/未读标记）
    ├── submissionDetail/           # 🔥 核心页面（2955 行）— 创建/查看/编辑/审批
    ├── pendingApprovals/           # 待审批列表（30s 轮询 + 计数变化检测）
    ├── myApprovalHistory/          # 审批历史（只读列表）
    ├── signatureManager/           # 签名模板 CRUD
    └── verification/               # 哈希链验证（三模式）
```

---

## 2. submissionDetail — 核心页面架构

**这是整个系统最复杂的页面（2955 行），融合了多种模式于一体：**

### 2.1 页面模式

| 模式 | 触发 | 功能 |
|------|------|------|
| `create` | `?action=create` | 创建新审核申请（模板或自由流程） |
| `view` | `?action=view&id=xxx` | 查看详情、审批、编辑、撤回 |
| `edit` | view 模式中点击"编辑" | 修改提交内容 |

### 2.2 创建模式流程

1. 选择流程类型：**模板**（选 `listAvailableFlowTemplates` → `previewTemplateSteps`）或 **自由**（手动添加步骤 + 选审批人）
2. 上传附件（`wx.chooseMessageFile` / `wx.chooseImage`，PNG/JPG/WEBP/PDF，max 10MB，client-side 校验）
3. 提交 → 文件逐个 `uploadAuditFile` → `startAuditSubmission`（模板）或 `startAdHocAudit`（自由）

### 2.3 审批工作流

1. 加载 `getSubmissionDetail` → 返回 submission + steps + files + signatures + 角色标志
2. 构建 `flowTimeline`（按 round 分组，含状态节点样式）

> ⚠️ 此处的 flowTimeline 构建逻辑在 `submissionDetail.js` **内部**实现，与 venue 模块的 `utils/flowTimeline.js` 是独立的两个实现。不要尝试用 venue 的版本替换。
3. 检测 `activeApprovalStepId` → 高亮当前审批步骤
4. **两种审批路径：**
   - **弹窗审批**（`openApprove`/`openReject`）— 传统弹窗 + 评论
   - **内联审批**（`confirmApprovalDirect`）— 直接页面内操作，主 UX 路径

**Round（轮次）概念：** 审核流程支持多次提交。每次驳回后重新提交（resubmit），round 递增。timeline 按 round 分组，已完成的前一轮步骤折叠隐藏。

**Resubmit 两种模式：**
| 模式 | 行为 |
|------|------|
| `fresh` | 从第 1 步重新开始（全新审核） |
| `from_rejector` | 从驳回步骤继续（仅驳回步骤的审批人重新审批） |

**Step 状态：** `pending` → `approved` ✓ / `rejected` ✗ / `superseded`（被新 round 覆盖）

### 2.4 签名/签章定位系统

1. 从 `sigSourcePickerVisible` 选择签名来源（已保存 / 新绘制）
2. 自动打开 `placementVisible` 定位弹窗 — 显示文件图片 + 十字准线
3. 支持页面导航（PDF 多页）、大小/旋转滑块、添加副本
4. **Snapshot-undo 机制：** 打开定位时存 `_placementSnapshot`；取消时恢复 snapshot；确认时丢弃

### 2.5 关键状态字段

| 字段 | 用途 |
|------|------|
| `submission` | 当前审核申请数据 |
| `flowTimeline` | 预计算的流程时间轴数组（含 CSS class、图标、状态文字） |
| `activeApprovalStepId` | 当前活跃审批步骤 ID |
| `userIsSubmitter` / `userIsApprover` / `userIsAdmin` | 角色标志 |
| `approvalVisible` | 审批弹窗可见性 |
| `sigSourcePickerVisible` | 签名来源选择器 |
| `placementVisible` | 签章定位弹窗 |
| `pendingSignatures` | 待确认的签名/签章列表 |
| `_placementSnapshot` | 定位前的签章快照（用于取消恢复） |

---

## 3. signaturePad 组件 — Canvas 坐标对齐

**文件：** `components/signaturePad/signaturePad.js` (287 行)

这是项目中 Canvas 使用最复杂的组件，解决了 WeChat Canvas 的经典坐标漂移问题：

### 3.1 DPR 感知坐标对齐（五层防御）

1. **双源测量** — `fields({ node: true, size: true })` + `boundingClientRect`，以 boundingClientRect 为准
2. **rpx 自动检测** — 如果 rect 尺寸 > `screenWidth * 1.2`，假定是 rpx，转换为 px
3. **touchStart 时重验证** — `_verifyCanvasRect` 在首次触摸时重新测量，布局保证已稳定
4. **transform 防御** — 每次绘制前重新应用 `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`
5. **边框隔离** — 视觉边框放在 wrapper 上（`.sigpad-canvas-border`），Canvas 本身无边

### 3.2 属性/事件

```javascript
properties: {
  initialImage: String,   // 初始图片 data URL
  penColor: '#1a237e',    // 笔触颜色
  penWidth: 3             // 笔触宽度
}
// 触发事件：confirm → { imageData: 'data:image/png;base64,...' }
```

### 3.3 导出管线

`toDataURL()` → `wx.canvasToTempFilePath` (DPR 原始分辨率) → 读取临时文件为 base64 → 返回 data URI

---

## 4. 审批轮询模式

`pendingApprovals` 使用 **计数变化检测** 避免无效刷新：

```javascript
_poll() {
  // 先轻量查询 count
  const { count } = await this.callCloud('checkPendingCount');
  if (count !== this._lastPendingCount) {
    // 只有数量变化时才全量刷新
    await this.loadData();
    this._lastPendingCount = count;
  }
  // count 相同：只更新"最后刷新时间"文字，不触发列表重渲染
}
```

---

## 5. 哈希链验证（verification 页面）

支持三种查询模式：
- **编号查询** — 按 submission number
- **ID 查询** — 按 submission ID
- **文件验证** — 选择文件 + 读为 base64，比对当前文件 hash 与链上最后一次签名时的 hash

结果显示：整体 valid/invalid、签名总数、逐轮详情（断链位置）、文件 hash 对比。

---

## 6. 文件上传和预览

```javascript
// 上传：选择 → client-side 校验 → read as base64 → uploadAuditFile
wx.chooseMessageFile({ type: 'file', count: 1 });
wx.chooseImage({ count: 1 });

// 校验规则：PNG/JPG/WEBP/PDF 格式，≤ 10MB

// 预览：downloadAuditFile → 保存到临时路径 → wx.openDocument 打开
// fallback: getAuditFile 返回 base64 → 写入临时文件 → 打开
```

---

## 7. 通知系统

审核模块有完整的通知系统（`server/src/modules/audit/routes/notification.js`，260 行）：

**通知类型（7 种）：**
| 类型 | 触发时机 |
|------|---------|
| `pending_approval` | 有新的待审批项需要处理 |
| `submission_approved` | 提交被通过 |
| `submission_rejected` | 提交被驳回 |
| `submission_progress` | 提交进度更新（步骤推进） |
| `booking_approved` | 场地预约通过 |
| `booking_rejected` | 场地预约被驳回 |
| 其他 | — |

**关键机制：**
- **14 天自动清理** — 过期通知自动删除
- **自愈对账** — `hasPendingApprovalNotification()` 检查是否存在对应通知，不存在则自动创建
- **批量创建** — `batchCreate()` 上限 200 条
- **定向删除** — `deleteByTarget()` 审批操作后清理旧通知

---

## 8. 未读标记（Read Cursors）

`mySubmissions` 的未读状态是通过**服务端 read cursors 机制**实现的，不是客户端本地状态：

```javascript
// 查看详情时自动标记已读
await callFunction({ name: 'markSubmissionRead', data: { submissionId } });

// 一键标记全部已读
await callFunction({ name: 'markAllSubmissionsRead' });
```

**规则：** 每次打开 submissionDetail 后必须调用 `markSubmissionRead`。未读标记（红点 + 左边框强调色）由服务端返回的 `isUnread` 字段控制。

---

## 9. 状态枚举（本地定义，无共享枚举文件）

每个页面硬编码自己的 status→label 映射：

| status | 显示 |
|--------|------|
| `draft` | 草稿 |
| `pending` | 待审核 |
| `in_progress` | 审核中 |
| `approved` | 已通过 |
| `rejected` | 已驳回 |
| `withdrawn` | 已撤回 |

---

## 10. 模块特定禁止事项

- ❌ 修改 `submissionDetail` 不测试创建和审批两条完整路径
- ❌ 改动 signaturePad 不测试 iOS 和 Android 双端（Canvas DPR 差异）
- ❌ 在审批流程中跳过 EventBus `approval:done` 事件 → portal badge 不更新
- ❌ 签名定位弹窗取消后不恢复 `_placementSnapshot` → 签名残留
- ❌ 审批后忘记 `markSubmissionRead` → 未读标记不消失
