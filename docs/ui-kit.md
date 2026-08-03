# WHUSU Smart Workspace UI Kit

本文件是微信小程序前端视觉规范的事实来源。运行时令牌位于
`miniprogram/app.wxss`，组件清单见 `docs/ui-components.md`，页面模板见
`docs/ui-page-templates.md`。

## 设计方向

- 蓝色轻奢玻璃：浅蓝渐变背景、半透明白色表面、细边框、内高光和克制阴影。
- 管理页面优先使用紧凑的工作台布局；不使用营销页式的大面积留白。
- 业务逻辑和页面结构可以有差异，但基础字体角色、控件角色、弹窗契约和状态表达必须可预测。
- 原生微信小程序和自有 WXSS 是当前 UI provider；不引入 React、Tailwind 或第三方组件库。

## 设备层级

设备差异是设计的一部分，不能把所有设备压成一套尺寸。

| 层级 | 条件 | 字体特点 | 布局特点 |
| --- | --- | --- | --- |
| 紧凑手机 | `<390px` | 最小可读字号，避免弹窗放大 | rpx 触控间距，单列为主 |
| 标准手机 | `390–519px` | 比紧凑手机略大一级 | 保留手机卡片密度和两列摘要 |
| Pad 竖屏 | `≥520px` | 使用逻辑 px，所有正文角色大于手机 | 卡片和控件变矮变密，内容列居中 |
| Pad 横屏/大屏 | `≥900px` 且 landscape | 字号仍大于手机，但控件高度进一步收紧 | 工作区铺满可用宽度，页签整行均分 |

响应式断点只改变设备层级，不改变语义角色顺序：元数据 < 标签/正文 < 强调值 < 分区标题 < 页面标题。

## 运行时令牌

令牌全部定义在 `page { ... }` 中，并在媒体查询中覆盖。页面级 WXSS 不应重新猜测这些基础值。

### 字体

| 角色 | 用途 |
| --- | --- |
| `--ui-type-micro` | 极弱辅助信息 |
| `--ui-type-caption` | 时间、数量、次要说明 |
| `--ui-type-meta` | 描述、地点、状态详情 |
| `--ui-type-label` | 表单标签、轻量操作 |
| `--ui-type-control` | 页签、按钮和控件文字 |
| `--ui-type-body` | 正文 |
| `--ui-type-emphasis` | 强调信息 |
| `--ui-type-value` | 列表标题、重要值 |
| `--ui-type-section` | 卡片和分区标题 |
| `--ui-type-page` | Hero 或页面主标题 |

弹窗使用独立紧凑字阶：`--ui-dialog-title-size`、`--ui-dialog-body-size`、
`--ui-dialog-meta-size`、`--ui-dialog-label-size`、`--ui-dialog-control-size`。

### 间距与几何

| 令牌 | 语义 |
| --- | --- |
| `--ui-page-padding-*` | 页面安全边距 |
| `--ui-hero-*` | Hero 内边距、圆角和与正文的距离 |
| `--ui-card-*` | 主要玻璃卡片内边距、圆角和卡片间距 |
| `--ui-list-*` | 重复列表项的间距、内边距和圆角 |
| `--ui-control-radius` | 主按钮和大控件圆角 |
| `--ui-field-radius` | 输入、选择器和表单控件圆角 |
| `--ui-tab-*` | 页签字号、高度、内边距和圆角 |
| `--ui-section-title-inset` | 标题蓝色竖线与标题文字的距离 |
| `--ui-dialog-edge` | 弹窗与物理视口的安全边距 |
| `--ui-dialog-width-inset` | 弹窗横向两侧安全边距之和，供兼容性良好的 `calc()` 使用 |
| `--ui-dialog-padding` | 弹窗表面的对称内边距 |
| `--ui-dialog-section-gap` | 弹窗标题、正文分组和控件之间的间距 |
| `--ui-dialog-footer-gap` | 弹窗正文与底部操作区的距离 |
| `--ui-dialog-radius` | 弹窗表面圆角 |

圆角按设备收紧：手机可使用较柔和的圆角，Pad 竖屏更克制，Pad 横屏使用更小的矩形圆角。状态标签可以是小型圆角矩形，主按钮、页签和弹窗不能使用胖胶囊。

## 共享交互契约

- `.page` 是页面外壳；页面内容必须由内容撑开，不为普通卡片预留视口高度。
- `.hero` / `.hero-admin` 是页面头部；认证后的页面优先复用 `workspace-hero`。
- `.card`、`.section`、`.edit-box`、`.list-card` 是主要玻璃表面。
- `.tabs`、`.tabs-card`、`.tab` 使用共享页签令牌；横屏页签必须整行均分或明确横向滚动。
- `.primary-btn`、`.secondary-btn`、`.danger-btn` 是三种主按钮角色；小型操作使用链接式控件。
- `.ui-overlay` 和 `.ui-dialog-shell` 是弹窗唯一几何所有者：全局只允许一处几何定义，遮罩固定覆盖 `100vw × 100vh`，弹窗以 `50vw / 50vh` 为锚点居中。
- `.ui-overlay-blocker` 只负责阻止背景触摸；弹窗壳不滚动，正文由直接子级 `scroll-view.ui-dialog-body` 滚动，嵌套列表继续使用 `nested-scroll-enabled`。
- 普通 WXML 不写静态 `style` 或 `placeholder-style`。进度宽度、时间表坐标、拖拽位置、动画延时等运行时几何可以保留动态行内样式；其余表现必须进入语义类并引用设备令牌。
- 页面返回、组织与身份切换、登录失效等系统行为使用现有共享流程，不在页面内重新实现一套。

## 样式所有权

1. 全局令牌和基础契约：`miniprogram/app.wxss`
2. 共享组件：`miniprogram/components/`
3. 子应用特殊布局：对应页面 WXSS
4. 业务状态和内容：对应页面 JS/WXML

页面 WXSS 可以改变布局方向、列数和内容排列，但不应覆盖全局字体角色、设备断点、弹窗定位、按钮角色或基础控件高度。
页面级弹窗类可以定义业务内容排列，但不得再次声明遮罩定位、弹窗中心点或独立的视口边距。

## 更新规则

- 新增组件前先查组件清单和页面模板。
- 新增可复用模式时，先补令牌或共享组件，再写页面局部样式。
- 改变字体、间距、圆角或断点时，同步更新本文件和 `miniprogram/app.wxss` 注释。
- UI 变更至少运行 `node scripts/ui-audit.js --strict`、`node scripts/miniprogram-compat-audit.js` 和 `git diff --check`，并在手机、Pad 竖屏、Pad 横屏各看一次。

## 弹窗内部层级（2026-08）

- 弹窗外壳、正文表面和功能分区是三个不同层级：外壳负责整窗安全留白，正文表面负责隔开滚动视口边缘，功能分区只用于摘要、表单组、筛选区和列表区等独立语义。
- 所有普通弹窗正文使用 `.ui-dialog-content`；时间表、签名定位等专业工作区叠加 `.ui-dialog-content--workspace`。短确认框没有滚动正文时，使用 `.ui-dialog-compact-content` 包裹提示内容，操作区保持独立。
- 功能分区使用 `.ui-dialog-section`、`.ui-dialog-summary`、`.ui-dialog-toolbar`、`.ui-dialog-list-panel`。禁止给每个字段单独套卡，也禁止把正文容器写成 `padding: 0; background: none; border: none`。
- 手机使用约 `30rpx` 外壳留白、`18rpx` 正文留白和 `22rpx` 分区留白；Pad 竖屏为 `22px / 14px / 16px`；Pad 横屏为 `20px / 12px / 14px`。设备差异必须保留，不能用横屏压缩值覆盖手机。
- 标题、正文卡片和底部操作左右对齐；同一垂直间距只能由一层负责。正文与内层列表保持原有滚动契约，增加卡片表面不得引入新的滚动容器。
