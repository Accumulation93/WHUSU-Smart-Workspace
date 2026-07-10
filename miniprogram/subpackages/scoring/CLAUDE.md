# CLAUDE.md — 考核评分模块 (scoring)

> 模块专属规范。通用规范（代码风格、设计系统、Git 等）见根目录 `CLAUDE.md`。
> 前端通用规范（页面生命周期、EventBus 等）见 `miniprogram/CLAUDE.md`。

---

## 1. 模块结构

```
scoring/pages/
├── admin/                    # 管理面板（~1500 行 + 12 个 Behavior）
│   ├── admin.js              # Page({}) 主文件，behaviors 数组注册
│   ├── modules/
│   │   ├── sharedApi.js      # 基础 Behavior：callCloud() Promise 包装（必须第一个注册）
│   │   ├── adminUtils.js     # 纯工具函数 + 常量 + 空表单工厂（1267 行）
│   │   ├── activityBehavior.js   # 评分活动 CRUD
│   │   ├── templateBehavior.js   # 问题模板 + 拖拽排序
│   │   ├── ruleBehavior.js       # 评分规则配置
│   │   ├── resultBehavior.js     # 结果查看 + 导出
│   │   ├── hrInfoBehavior.js     # 人事管理 + CSV 导入
│   │   ├── departmentBehavior.js # 部门 CRUD
│   │   ├── identityBehavior.js   # 身份类别 CRUD
│   │   ├── workGroupBehavior.js  # 工作分组 CRUD
│   │   ├── adminManagementBehavior.js # 管理员管理
│   │   ├── settingsBehavior.js   # 系统配置 + 组织管理
│   │   ├── publicationBehavior.js # 结果发布
│   │   └── auditBehavior.js      # 审核模板 + 签章管理
│   ├── gradeBand.wxs         # WXS：等第颜色映射
│   └── admin.wxss            # 3331 行完整样式
├── score/                    # 用户评分表单（879 行，独立 Page）
└── scorerTasks/              # 评分人任务完成度列表
```

---

## 2. Behavior 组合模式

**这是评分模块最核心的架构模式。** 管理面板通过 12 个 Behavior 组合而成：

```javascript
// admin.js
Page({
  behaviors: [
    sharedApi,         // ← 必须第一个！提供 this.callCloud()
    adminUtils,        // 工具函数
    activityBehavior,
    templateBehavior,
    ruleBehavior,
    // ... 其余 behavior
  ],
  data: { /* 所有共享状态 */ },
  // admin.js 自身的方法（如 setLoading、tab 切换）
});
```

**规则：**
- **`sharedApi` 永远第一个注册** — 其他 behavior 依赖 `this.callCloud()`
- 新管理功能 **必须** 作为独立 Behavior 添加，不写在 admin.js 主文件中
- Behavior 之间通过 `this.data` / `this.setData()` 共享状态
- 每个 Behavior 只导出 `Behavior({ methods: { ... } })`

---

## 3. sharedApi 模式

```javascript
// sharedApi.js — 所有 Behavior 的 API 基础
const { callFunction } = require('../../../../../utils/api');

module.exports = Behavior({
  methods: {
    callCloud(name, data = {}) {
      return new Promise((resolve, reject) => {
        callFunction({ name, data, success: res => resolve(res.result || {}), fail: reject });
      });
    }
  }
});
```

所有 Behavior 方法通过 `this.callCloud('functionName', payload)` 调用后端。

---

## 4. 标准 Behavior 方法模式

每个 Behavior 方法遵循统一模式：

```javascript
async loadActivityList() {
  this.setLoading('activities', true);
  try {
    const result = await this.callCloud('listScoreActivities');
    this.setData({ activityList: result.list || [], ... });
  } catch (error) {
    wx.showToast({ title: '加载失败', icon: 'none' });
  } finally {
    this.setLoading('activities', false);
  }
}
```

**要点：**
- `this.setLoading(key, bool)` 由 admin.js 提供（不在 Behavior 中）
- 所有 Cloud 调用用 try/catch/finally
- 错误用 `wx.showToast`，不超过 7 个中文字符

---

## 5. adminUtils.js — 工具函数速查

**常量：**
- `STORAGE_KEY` = `'roleProfiles'`
- `TAB_LIST` — 14 个 tab 标识符
- `TIMEZONE_OPTIONS`、`RULE_SCOPE_OPTIONS`、`VIEW_SCOPE_OPTIONS`
- `PROFILE_EDIT_MODE_OPTIONS`、`PROFILE_FIELD_TYPE_OPTIONS`

**表单工厂：** `emptyActivityForm()`, `emptyTemplateForm()`, `emptyRuleForm()`, `emptyHrForm()`, `emptyDepartmentForm()`, `emptyWorkGroupForm()`, `emptyIdentityForm()`, `createEmptyQuestion()`, `createEmptyProfileField()`

**数据转换：** `toNumber()`, `clampNumber()`, `formatScoreFixed3()`, `getProgressColor()`, `buildProgressFillStyle()`, `moveItem()`

**CSV 导入：** `autoMapCsvColumn()`, `jaccardCharSimilarity()`, `buildCsvColumnMapping()`, `detectFieldTypeFromValues()`, `validateCsvValueAgainstField()`

**规则引擎：** `createTemplateConfig()`, `normalizeClauseForEdit()`, `buildRuleListItem()`, `buildRuleClauseText()`, `buildRuleClausesForSave()`

---

## 6. 拖拽排序（templateBehavior.js）

**触发：** `bindlongpress="startQuestionDrag"` → 30fps 节流的 touchmove → touchend

**关键状态：**
- `draggingQuestionIndex` — 被拖拽卡片索引
- `dragInsertIndex` — 插入目标位置
- `dragGhostTop/Left/Width` — ghost card 定位（`position: fixed`）
- `dragActive` — 抑制页面滚动（`<page-meta page-style="overflow: hidden">`）
- `templateQuestionScrollTop` — 自动滚动的 scroll-top 绑定

**自动滚动：** 手指靠近 scroll-view 上下 22% 边缘区域时触发，最大 3x 速度。使用 `_dragEffectiveScrollTop` 累积滚动增量。

**插入调整：** `toIndex = insertIndex > fromIndex ? insertIndex - 1 : insertIndex`

**完整的拖拽实现指南见** `.claude/skills/wechat-miniprogram-drag-sort/SKILL.md`。

---

## 7. gradeBand.wxs — 等第颜色

```javascript
var COLOR_MAP = {
  '优秀': '#f59e0b',    // 金色
  '良好': '#10b981',    // 翠绿
  '合格': '#3b82f6',    // 蓝色
  '不合格': '#ef4444'   // 红色
};
```

未知等第名称使用确定性 hash 从 `PALETTE` 调色板取色。在 admin.wxml 中通过 `<wxs module="gradeBandWxs" src="./gradeBand.wxs">` 引用。

---

## 8. 评分页面（score.js）关键模式

**双键盘系统：**
- 自定义屏幕键盘（quick-score chip 网格 + numpad）
- 物理键盘支持（通过隐藏 `<input>` 捕获，检测 `devtools`/`mac`/`windows` 平台）

**问题导航：** `currentQuestionIndex` + 方向键 / Enter（下一题）/ Shift+Enter（上一题）

**提交重试：** 如果 `submitScoreRecord` 调用失败，会重新调用 `getScoreFormData` 检查记录是否实际已保存（网络成功但响应丢失的边界情况）。

**分数验证：** 检查 `minValue` ≤ score ≤ `maxValue`，score 必须与 `startValue + N * stepValue` 对齐。

---

## 9. 评分结果导出

`resultBehavior.js` 支持：
- 按部门/身份/分组过滤
- 多维度查看（评分人完成度 / 被评分人得分）
- 导出到 CSV 和 Excel（通过 `buildTableFile` 和 `parseTableFile`）

---

## 10. 模块特定禁止事项

- ❌ 在 admin.js 主文件中添加大段业务逻辑 → 放 Behavior
- ❌ Behavior 中不调用 `this.setLoading()` → 由 admin.js 提供
- ❌ Score 页面修改后不测试物理键盘和屏幕键盘两种输入路径
- ❌ 修改 `adminUtils.js` 的函数签名 → 检查所有 Behavior 的调用处
- ❌ 拖拽排序后忘记重置 `dragActive: false` → 页面滚动永久禁用
