# UI 组件清单

当前项目使用原生微信小程序组件和项目自有 WXSS，不依赖第三方 UI provider。

## 共享组件

| 组件 | 路径 | 用途 | 必须保留的差异 |
| --- | --- | --- | --- |
| `workspace-hero` | `miniprogram/components/workspace-hero/` | 品牌、姓名、身份、组织与切换入口 | 手机换行更自然，Pad 收紧内边距，横屏压缩高度 |
| `viewport-portal` | `miniprogram/components/viewport-portal/` | 将共享弹窗内容提升到视口层 | 三种设备都固定遮罩和弹窗位置 |
| `ui-icon` | `miniprogram/components/ui-icon/` | 统一 SVG 图标加载和色调 | 图标尺寸随语义和设备令牌调整，不用 emoji |
| `signaturePad` | `miniprogram/subpackages/audit/components/signaturePad/` | 审核签名输入 | 保留画布专用触摸锁和横向空间 |

## 全局样式原语

| 原语 | 用途 | 典型使用位置 |
| --- | --- | --- |
| `.page` | 页面安全边距和背景 | 所有注册页面 |
| `.hero` / `.hero-admin` | 用户端/管理端头部 | 门户、评分、人事、权限、场地 |
| `.card` / `.section` / `.edit-box` | 主要玻璃表面 | 列表、表单、统计、详情 |
| `.list-item` / `.booking-item` / `.audit-submission-item` | 重复列表行 | 三个子应用的列表页 |
| `.tabs` / `.tabs-card` / `.tab` | 分段页签 | 评分、审核、场地、消息、认证 |
| `.primary-btn` / `.secondary-btn` / `.danger-btn` | 三种主操作角色 | 保存、取消、删除和提交 |
| `.field-input` / `.field-textarea` / `.picker-value` | 表单控件 | 人事、认证、场地、权限 |
| `.ui-overlay` / `.ui-dialog-shell` | 弹窗遮罩和壳 | 详情、选择、确认、编辑弹窗 |
| `.ui-overlay-blocker` | 背景触摸拦截层 | 所有居中弹窗，位于弹窗壳下方 |
| `.ui-dialog-header` / `.ui-dialog-body` / `.ui-dialog-footer` | 固定标题、可滚动正文、固定操作区 | 长表单、人员选择、审批步骤和详情 |
| `.ui-dialog-inset` | 使用弹窗令牌的对称水平留白 | 弹窗内独立字段、提示和操作行 |
| `.ui-dialog-content` | 普通弹窗的统一正文玻璃表面和边缘留白 | 详情、表单、选择器、长列表 |
| `.ui-dialog-content--workspace` | 专业宽窗口的受控工作区表面 | 时间表、签名定位、数据工作台 |
| `.ui-dialog-section` / `.ui-dialog-summary` | 按业务语义划分的表单组和摘要卡 | 详情摘要、相关字段组、流程概览 |
| `.ui-dialog-toolbar` / `.ui-dialog-list-panel` | 筛选操作区和候选列表表面 | 人员、组织、条件和批量选择器 |
| `.ui-dialog-compact-content` | 无滚动正文的短提示内容卡 | 确认、删除、未保存内容提示 |

## 状态表达

- 蓝色：当前选择、主要动作、处理中。
- 绿色：已完成、已绑定、可用。
- 橙色：待处理、需审核、提醒。
- 红色：驳回、删除、危险操作。
- 灰蓝：不可用、历史状态、弱化元数据。

状态标签是元数据，不使用原生按钮语义；只有真正可操作的元素才接受点击反馈。

## 组件边界

- 共享组件只负责结构、视觉和交互契约，不读取具体业务接口。
- 页面负责把业务数据映射成组件需要的展示字段。
- 子应用可以拥有专用列表行，但必须复用全局字体、设备令牌、按钮角色和弹窗契约。
- 不为单个页面复制 `workspace-hero`、弹窗遮罩或一套新的按钮基础样式。
- 页面 WXML 的静态间距、字号、颜色和圆角必须使用语义类；只有数据驱动的坐标、进度或动画允许动态行内样式。
- 弹窗正文不得直接贴着 `scroll-view` 边缘；功能分区按语义使用内卡，禁止每个字段套卡或清空整个正文表面。
