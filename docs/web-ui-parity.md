# 网页版与小程序视觉对齐规范（web 工程唯一事实来源）

> 目标：网页版 `web/` 的观感必须与微信小程序逐条对齐，尤其是玻璃质感与色调。
> 事实来源：`miniprogram/app.wxss`（运行时令牌）、`miniprogram/components/workspace-hero/workspace-hero.wxss`、
> `miniprogram/subpackages/main/pages/portal/portal.wxss`、`docs/ui-kit.md`。
> 冲突时以小程序实际渲染的值为准，本文件已按此原则取值。
>
> 换算：手机档 `1rpx = 0.5px`（375px 视口）；Pad 竖屏与 Pad 横屏直接使用 `app.wxss` 已有的 `px` 令牌。

## 一、工程边界

- 网页只允许引用 `web/src/styles/tokens.css` 的 `--ui-*` 变量，页面样式不得再写死尺寸或颜色。
- 禁止新增按钮颜色、状态标签颜色、自定义动画；唯一入场动画是 `glassFadeUp`。
- 卡片背景必须是 `linear-gradient`，不允许纯色；必须带 1px 浅色描边、`inset 0 1px 0` 顶部高光、
  外阴影与 `backdrop-filter: blur(12px)`。
- `<input>` / `<textarea>` 不使用 `display: flex`，用块级 + 行高 + 内边距。
- 文本按钮是紧凑圆角矩形，不是胶囊；`999px` / `50%` 只给头像、加载圈、时间轴节点、纯图标圆钮。

## 二、色板与状态标签

```
--ui-blue-900 #1e3a8a   --ui-blue-800 #1d4ed8   --ui-blue-700 #2563eb
--ui-blue-500 #3b82f6   --ui-blue-400 #60a5fa
--ui-text #0f172a       --ui-text-body #334155  --ui-text-muted #64748b
--ui-text-soft #94a3b8  --ui-danger #ef4444
--ui-line rgba(226,237,247,0.96)   --ui-line-blue rgba(147,197,253,0.64)
```

状态标签只有四色，红色只用于破坏性操作：

| 变体 | 背景 | 文字 | 描边 |
| --- | --- | --- | --- |
| 蓝 | `rgba(219,234,254,0.76)` | `#1d4ed8` | `rgba(147,197,253,0.64)` |
| 绿 | `rgba(209,250,229,0.78)` | `#15803d` | `rgba(110,231,183,0.58)` |
| 橙 | `rgba(255,237,213,0.78)` | `#c2410c` | `rgba(253,186,116,0.58)` |
| 天蓝 | `rgba(224,242,254,0.76)` | `#0369a1` | `rgba(56,189,248,0.56)` |

## 三、页面底色

```css
background:
  radial-gradient(circle at 12% 10%, rgba(96, 165, 250, 0.16) 0%, transparent 26%),
  radial-gradient(circle at 86% 18%, rgba(191, 219, 254, 0.22) 0%, transparent 24%),
  radial-gradient(circle at 18% 88%, rgba(125, 211, 252, 0.10) 0%, transparent 22%),
  linear-gradient(135deg, #f8fbff 0%, #f1f6fc 48%, #edf3fa 100%);
```

`.page` 还要在固定层放两个装饰光斑（`position: fixed; pointer-events: none`）：
`.page::before` 位于 `top:-60px; right:-45px; 160×160px`，
`radial-gradient(circle, rgba(96,165,250,0.18) 0%, rgba(96,165,250,0) 72%)`；
`.page::after` 位于 `left:-60px; bottom:75px; 140×140px`，
`radial-gradient(circle, rgba(147,197,253,0.16) 0%, rgba(147,197,253,0) 72%)`。

## 四、核心配料（照抄，不要凭感觉调）

### 玻璃卡片 `.card`

```css
padding: var(--ui-card-padding-y) var(--ui-card-padding-x);
border-radius: var(--ui-card-radius);
background: linear-gradient(135deg, rgba(255,255,255,0.80) 0%, rgba(248,251,255,0.72) 100%);
border: 1px solid rgba(255,255,255,0.62);
box-shadow: 0 9px 18px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.78);
backdrop-filter: blur(12px);
animation: glassFadeUp 0.46s ease both;
```

### 卡片内重复行 `.list-row`

```css
padding: var(--ui-list-padding-y) var(--ui-list-padding-x);
border-radius: var(--ui-list-radius);
background: linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(249,251,255,0.82) 100%);
border: 1px solid rgba(226,237,247,0.96);
box-shadow: 0 6px 12px rgba(15,23,42,0.04), inset 0 1px 0 rgba(255,255,255,0.78);
```

### 消息与待办行 `.notification-item`

```css
padding: 9px 8px; border-radius: 8px;
background: linear-gradient(135deg, rgba(255,255,255,0.82) 0%, rgba(246,249,255,0.72) 100%);
border: 1px solid rgba(219,229,241,0.76);
```

- 未读：`linear-gradient(135deg, rgba(255,255,255,0.96), rgba(239,246,255,0.84))`，描边 `rgba(147,197,253,0.55)`；
  已读：`opacity: 0.78`；待办行描边 `rgba(147,197,253,0.42)`。
- 左侧图标槽 `28×28px`、圆角 `8px`、
  `linear-gradient(135deg, rgba(239,246,255,0.94), rgba(219,234,254,0.84))`、描边 `rgba(147,197,253,0.4)`。
- 元数据两行：第一行是类别标签 + 工作角色；第二行是组织气泡，组织名 `flex:1; min-width:0` 可换行，
  “当前”固定不收缩。
- 标题 `--ui-type-emphasis` / 700 / `#0f172a`；描述 `--ui-type-caption` / `#64748b` / 单行省略；
  时间 `--ui-type-micro` / `#94a3b8`。

### 应用宫格 `.app-grid`

```css
.app-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 6px; }
.app-grid-item {
  padding: 6px 4px; border-radius: 9px;
  background: linear-gradient(135deg, rgba(255,255,255,0.88) 0%, rgba(246,249,255,0.78) 100%);
  border: 1px solid rgba(219,229,241,0.76);
  display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
}
.app-grid-item:active { transform: translateY(0.5px) scale(0.97); }
.app-grid-icon  { font-size: var(--ui-type-page); line-height: 1; margin-bottom: 2px; }
.app-grid-label { font-size: var(--ui-type-meta); font-weight: 700; color: #0f172a; }
.app-grid-badge { position: absolute; top: 3px; right: 3px; font-size: var(--ui-type-micro);
  font-weight: 600; color: #c2410c; background: rgba(255,237,213,0.84);
  border: 1px solid rgba(253,186,116,0.44); border-radius: var(--ui-compact-radius); padding: 1px 5px; }
```

列数：手机 3 列，Pad 竖屏 4 列，Pad 横屏与电脑 5 列。

### 搜索栏 `.app-search-bar`

```css
padding: 7px 10px; border-radius: 10px;
background: linear-gradient(135deg, rgba(255,255,255,0.92) 0%, rgba(246,249,255,0.82) 100%);
border: 1px solid rgba(219,229,241,0.96);
box-shadow: 0 4px 9px rgba(15,23,42,0.035), inset 0 1px 0 rgba(255,255,255,0.86);
```

### 底部操作组与页脚

```css
.actions { display: grid; gap: var(--ui-page-action-gap); }
.page-footer { margin-top: var(--ui-footer-gap); text-align: center; }
.footer-name { font-size: var(--ui-type-meta); font-weight: 600; color: #94a3b8; }
.footer-org  { font-size: var(--ui-type-caption); color: #94a3b8; }
```

### 按钮

```css
.btn-primary   { background: linear-gradient(135deg,#2563eb 0%,#3b82f6 45%,#60a5fa 100%);
                 box-shadow: 0 10px 17px rgba(37,99,235,0.20), inset 0 1px 0 rgba(255,255,255,0.24); }
.btn-secondary { background: linear-gradient(135deg,rgba(255,255,255,0.96),rgba(246,249,255,0.88));
                 color: #1e293b; border: 1px solid rgba(219,229,241,0.96);
                 box-shadow: 0 5px 11px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.84); }
.btn-danger    { background: linear-gradient(135deg,#ef4444 0%,#f87171 100%);
                 box-shadow: 0 8px 15px rgba(239,68,68,0.16), inset 0 1px 0 rgba(255,255,255,0.18); }
```

按下反馈 `transform: translateY(1px) scale(0.985)`。按钮文字双轴居中，自然高度 + `min-height` +
对称内边距 + 无单位行高。

### 页签

- 整行页签 `.tabs` + `.tab` + `.tab-active`：外壳是玻璃分段控件，激活项用
  `linear-gradient(135deg,#1d4ed8 0%,#2563eb 58%,#3b82f6 100%)` 与 `0 8px 15px rgba(29,78,216,0.22)`。
- 标题旁的二态切换用 `.compact-segmented` / `.compact-segmented-item`，高度取 `--ui-compact-height`，
  宽度按内容收缩，禁止复用整行页签高度。
- 顶层页签不超过五项时单行等宽；超过五项时横向滚动，禁止末项换行或看似消失。
- 禁止把管理工作台页签改成宽侧边栏：小程序在手机、Pad 竖屏、Pad 横屏保持同一套顶部分段页签语言。

### 共享 Hero

```css
padding: 17px 15px 14px; border-radius: 17px; color: #fff;
background: linear-gradient(135deg, rgba(37,99,235,0.98) 0%, rgba(59,130,246,0.95) 52%, rgba(96,165,250,0.92) 100%);
border: 1px solid rgba(255,255,255,0.24);
box-shadow: 0 11px 23px rgba(37,99,235,0.20), inset 0 1px 0 rgba(255,255,255,0.24);
backdrop-filter: blur(12px);
/* ::before 光斑：top -45px, right -27px, 115×115px, rgba(255,255,255,0.12) */
```

管理页变体 `tone="admin"`：
`linear-gradient(135deg, rgba(15,23,42,0.97) 0%, rgba(30,41,59,0.96) 44%, rgba(37,99,235,0.93) 100%)`，
阴影 `0 11px 23px rgba(15,23,42,0.20)`，内高光 `rgba(255,255,255,0.15)`。

Pad 竖屏 `padding 24px 26px 22px; border-radius 26px`；
Pad 横屏 ≥900px `padding 24px 28px 22px; border-radius 18px`；横屏再收紧 `padding 22px 26px 20px`。

内部顺序固定：品牌名 + 当前页名 → 姓名（最大标题）→ 身份摘要 → 工作角色玻璃卡。
禁止头像、姓名首字装饰、独立品牌图标块。工作角色卡
`padding 8px 9px; border-radius 11px; gap 7px`，
`linear-gradient(135deg, rgba(255,255,255,0.20), rgba(255,255,255,0.11))`，
图标槽 `25×25px; border-radius 8px; background: rgba(255,255,255,0.16)`。

### 分区标题 `.section-title`

```css
position: relative; padding-left: var(--ui-section-title-inset);
color: #0f172a; font-size: var(--ui-type-section); font-weight: 700; line-height: 1.4;
/* ::before: left 0; top 50%; translateY(-50%); width 3.5px; height 14px; border-radius 999px;
   background: linear-gradient(180deg,#2563eb 0%,#60a5fa 100%); */
```

分区标题、二级页签和成组操作必须归属于一张真实可见的玻璃表面（`.section-control-card` 或 `.card`），
禁止直接裸露在页面底色上。

### 表单

```css
.field-input, .field-textarea, .field-select {
  min-height: var(--ui-field-control-height);
  padding: var(--ui-control-padding-y) var(--ui-control-padding-x);
  border-radius: var(--ui-field-radius);
  color: #10233d; font-size: var(--ui-type-body);
  background: linear-gradient(135deg, rgba(255,255,255,0.96), rgba(246,249,255,0.88));
  border: 1px solid rgba(219,229,241,0.96);
  box-shadow: 0 4px 9px rgba(15,23,42,0.035), inset 0 1px 0 rgba(255,255,255,0.84);
}
```

字段间距、标签间距、同排间距分别取 `--ui-field-gap`、`--ui-label-gap`、`--ui-inline-gap`。
一段空白只能有一个所有者。

### 弹窗

只有三段：固定标题 → 独立滚动正文 → 固定操作栏。网页必须复用 `web/src/components/GlassDialog.vue`，
禁止页面自己写遮罩与居中。Pad 竖屏最大宽 `760px`，Pad 横屏 `1024px`，专业工作区 `1120px`。
遮罩负责灰、窗口负责白，文字不得越出白色表面。

## 五、网页外壳

- 外壳由 `web/src/components/AppShell.vue` 提供，小屏幕与电脑共用同一套结构：
  顶部玻璃条（品牌 + 当前页名 + 用户）→ 顶部玻璃分段页签 → 内容区。
- 顶部条吸顶（`position: sticky; top: 0`），使用与卡片相同的玻璃配料 + 底部细描边。
- 电脑端不做左侧固定导航；内容区最大宽度取 `--ui-content-max-width` 并居中。
- 底部主操作组用 `.actions`，品牌页脚用 `.page-footer`。

## 六、完成前必须核对

1. 三档断点（手机 `<520px`、Pad 竖屏 `520–899px`、Pad 横屏 `≥900px`）各看一次。
2. 卡片、列表行、状态标签、按钮、页签的最终生效值来自令牌，源码里没有裸色值。
3. 页面没有大白块、没有胖胶囊、没有大面积空留白、没有营销页式标题。
4. 触碰 JS 时运行 `node --check`，收尾运行 `git diff --check`。
