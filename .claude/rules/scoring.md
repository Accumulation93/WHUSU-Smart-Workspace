---
paths: "miniprogram/subpackages/scoring/**"
---

# CLAUDE.md — WHUSU智慧工作台模块 (scoring)

> 模块专属规范。通用规范见根目录 `CLAUDE.md` 和 `.claude/rules/miniprogram.md`。

---

## 1. 模块结构

```
scoring/pages/
├── admin/                    # 综合管理面板与 Behavior 组合
│   ├── admin.js              # Page({}) 主文件
│   ├── modules/
│   │   ├── sharedApi.js      # 基础 Behavior：callCloud()（必须第一个注册）
│   │   ├── adminUtils.js     # 纯工具函数、常量与空表单工厂
│   │   ├── activityBehavior.js / templateBehavior.js / ruleBehavior.js
│   │   ├── resultBehavior.js / hrInfoBehavior.js
│   │   ├── departmentBehavior.js / identityBehavior.js / workGroupBehavior.js
│   │   ├── adminManagementBehavior.js / settingsBehavior.js
│   │   ├── publicationBehavior.js / auditBehavior.js
│   ├── gradeBand.wxs         # WXS：等第颜色映射
│   └── admin.wxss            # 综合管理页样式
├── score/                    # 用户评分表单
└── scorerTasks/              # 评分人任务完成度列表
```

---

## 2. Behavior 组合模式

```javascript
Page({
  behaviors: [
    sharedApi,         // ← 必须第一个！提供 this.callCloud()
    adminUtils,
    activityBehavior,
    // ... 其余
  ],
});
```

**规则：**
- `sharedApi` 永远第一个注册
- 新功能 **必须** 作为独立 Behavior
- Behavior 之间通过 `this.data` / `this.setData()` 共享状态

---

## 3. 标准 Behavior 方法模式

```javascript
async loadActivityList() {
  this.setLoading('activities', true);
  try {
    const result = await this.callCloud('listScoreActivities');
    this.setData({ activityList: result.list || [] });
  } catch (error) {
    wx.showToast({ title: '加载失败', icon: 'none' });
  } finally {
    this.setLoading('activities', false);
  }
}
```

---

## 4. adminUtils.js 关键函数速查

**表单工厂：** `emptyActivityForm()`, `emptyTemplateForm()`, `emptyRuleForm()`, `emptyHrForm()`, `emptyDepartmentForm()`, `emptyWorkGroupForm()`, `emptyIdentityForm()`, `createEmptyQuestion()`, `createEmptyProfileField()`

**数据转换：** `toNumber(val, fallback)`, `clampNumber(val, min, max)`, `formatScoreFixed3(val)`, `getProgressColor(ratePercent)`, `buildProgressFillStyle(ratePercent)`, `moveItem(list, fromIndex, toIndex)`

**CSV 导入：** `autoMapCsvColumn(headers, fields)` — Jaccard 相似度自动列匹配; `jaccardCharSimilarity(a, b)`; `detectFieldTypeFromValues(values)`; `validateCsvValueAgainstField(value, field)`

**规则引擎：** `createTemplateConfig()`, `normalizeClauseForEdit()`, `buildRuleListItem()`, `buildRuleClauseText()`, `buildRuleClausesForSave()`

---

## 5. 拖拽排序

**触发：** `bindlongpress` → 30fps 节流 touchmove → touchend
**插入调整：** `toIndex = insertIndex > fromIndex ? insertIndex - 1 : insertIndex`
**详细指南：** `.agents/skills/wechat-miniprogram-drag-sort/SKILL.md`

---

## 6. scorerTasks 页面

**数据流：** `getScorerTaskStatus`（支持分页）→ 按部门/身份类别/职能组过滤 → 导出 CSV/Excel
**WXSS：** `@import "../admin/admin.wxss"` 继承管理端样式

---

## 7. score.js 评分页面

- **双键盘：** 自定义屏幕键盘 + 物理键盘（隐藏 input 捕获）
- **提交重试：** 网络失败后 re-fetch 检查记录是否实际已保存
- **分数验证：** minValue ≤ score ≤ maxValue，对齐 stepValue

---

## 8. 岗位粒度与当前上下文

- 评分规则、评分人资格和评分动作只使用当前工作上下文中的有效 `assignmentId`；禁止从 `hr_info` 单岗位快照或身份类别 ID 推导当前岗位。无岗位成员不得执行岗位规则驱动评分。
- 后台评分记录按岗位建立并保存不可变岗位/工作上下文快照；前端默认按自然人展示。同一任务中同一自然人出现多个岗位记录时，才显示岗位标签，并包含足以区分的部门、身份类别和职能组。
- 自评限制按自然人判断，切换岗位不得绕过；历史结果展示记录产生时的岗位快照，不能用当前岗位覆盖。
- 历史评分记录缺失岗位快照时只能显示“历史岗位信息缺失”，禁止查询 `hr_info` 或当前岗位补写、覆盖或扩张权限。
- 岗位候选必须来自有效组织成员岗位，旧记录无法唯一映射到岗位时不得猜测或静默归并。
- 打开评分表、结果页或公示页只能读取数据，禁止因当前模板签名与历史记录不同而删除旧答案、旧评分记录或改写历史签名。
- 评分记录必须固化提交时模板、题目、规则解释和岗位快照；结果计算与导出只使用这些历史快照，不得用当前岗位、当前规则或当前模板重新解释历史分数。
- 历史快照不足时显示“历史评分依据缺失”并阻止需要精确依据的计算；任何修复必须通过带审计的幂等迁移执行，禁止在普通请求中静默补写。
- 已提交评分保持不可变，但评分表读取接口必须始终返回可查看详情：优先把 `calculation_context_snapshot` 中提交时的模板、题目、范围和答案适配到当前评分页，并返回 `status=success + readOnly=true`；当前模板、当前规则、活动暂停或时间范围变化不得阻止历史记录查看。
- 禁止把历史答案按当前模板题序硬映射，也禁止因 `template_config_signature` 与当前模板不同而返回失败或跳回首页。历史快照缺失或验签失败时，只能降级为“历史题号 + 原始分数”只读展示并明确标记题目文字未留存，不能猜测题目内容；连答案行也缺失时仍须展示提交记录元信息和明确空态，不得打不开或重定向。
- 只读评分详情沿用正常评分页的信息层级和题目卡片；必须隐藏输入捕获层、自定义键盘、编辑反馈和提交按钮，不得另做一套割裂的历史详情界面。
- `calculation_context_snapshot` 存入 MySQL JSON 后对象键顺序可能变化；任何持久化策略签名必须先按固定字段顺序投影再哈希，禁止直接对任意解析对象执行 `JSON.stringify` 后验签。新增或回填快照必须共用 `calculationSnapshotSignature`，并覆盖 MySQL JSON 键重排回归测试。
- 评分计算快照当前唯一写入格式为固定字段、固定类型的 `version=2`：所有新提交必须先经过 `canonicalizeCalculationSnapshot`，不得在路由内自行拼装变体或附加临时字段；`calculationPolicySignature` 必须使用 `v2:` 前缀。`version=1` 只允许作为迁移前读取兼容，禁止继续新增。
- 旧评分快照升级必须先用其原版本签名全量验真，再通过带时间戳的幂等迁移逐条规范化；规范化只允许统一字段、类型和签名版本，不得改变题目、答案、参与人、岗位或分数。部署必须依次执行全量预检、维护期写入和全量 v2 复验，任一步失败即回滚。
- 评分表加载失败不得定时跳回首页；页面必须保留语义容器，显示 locale 中的错误信息和原地重试操作。发布窗口内遇到旧服务返回的历史结构冲突状态，应提示数据正在恢复，不能让用户看到“一直加载后退出”。

## 9. 模块特定禁止事项

- ❌ admin.js 主文件添加大段业务逻辑 → 放 Behavior
- ❌ 修改 adminUtils.js 函数签名 → 检查所有 Behavior 调用处
- ❌ 拖拽排序后忘记重置 `dragActive: false` → 页面滚动永久禁用
- ❌ Score 页面修改后不测试双键盘输入路径
