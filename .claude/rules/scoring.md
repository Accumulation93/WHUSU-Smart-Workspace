---
paths: "miniprogram/subpackages/scoring/**"
---

# CLAUDE.md — 考核评分模块 (scoring)

> 模块专属规范。通用规范见根目录 `CLAUDE.md` 和 `.claude/rules/miniprogram.md`。

---

## 1. 模块结构

```
scoring/pages/
├── admin/                    # 管理面板 + 12 个 Behavior
│   ├── admin.js              # Page({}) 主文件
│   ├── modules/
│   │   ├── sharedApi.js      # 基础 Behavior：callCloud()（必须第一个注册）
│   │   ├── adminUtils.js     # 纯工具函数 + 常量 + 空表单工厂（1267 行）
│   │   ├── activityBehavior.js / templateBehavior.js / ruleBehavior.js
│   │   ├── resultBehavior.js / hrInfoBehavior.js
│   │   ├── departmentBehavior.js / identityBehavior.js / workGroupBehavior.js
│   │   ├── adminManagementBehavior.js / settingsBehavior.js
│   │   ├── publicationBehavior.js / auditBehavior.js
│   ├── gradeBand.wxs         # WXS：等第颜色映射
│   └── admin.wxss            # 3331 行完整样式
├── score/                    # 用户评分表单（879 行）
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
**详细指南：** `.claude/skills/wechat-miniprogram-drag-sort/SKILL.md`

---

## 6. scorerTasks 页面

**数据流：** `getScorerTaskStatus`（支持分页）→ 按部门/身份/分组过滤 → 导出 CSV/Excel
**WXSS：** `@import "../admin/admin.wxss"` 继承管理端样式

---

## 7. score.js 评分页面

- **双键盘：** 自定义屏幕键盘 + 物理键盘（隐藏 input 捕获）
- **提交重试：** 网络失败后 re-fetch 检查记录是否实际已保存
- **分数验证：** minValue ≤ score ≤ maxValue，对齐 stepValue

---

## 8. 模块特定禁止事项

- ❌ admin.js 主文件添加大段业务逻辑 → 放 Behavior
- ❌ 修改 adminUtils.js 函数签名 → 检查所有 Behavior 调用处
- ❌ 拖拽排序后忘记重置 `dragActive: false` → 页面滚动永久禁用
- ❌ Score 页面修改后不测试双键盘输入路径
