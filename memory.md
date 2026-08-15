# WHUSU Smart Workspace 项目记忆

更新时间：2026-08-15

> 本文件只保存低优先级历史上下文。当前路径、接口、数据库、发布和 UI 事实必须以 `AGENTS.md`、`CLAUDE.md`、`.claude/rules/`、`docs/`、当前代码和配置为准。历史内容不得覆盖当前事实。

## 当前运行基线

- 前端是原生微信小程序，后端是 Node.js/Express + MySQL 8.0。
- Express 只监听 `127.0.0.1:${PORT}`，生产 HTTPS 由 Nginx 终止；不要把本地服务写成 `https://localhost:3000`。
- `miniprogram/app.json` 顶层主包注册 2 个页面：`subpackages/main/pages/login/login`、`subpackages/main/pages/portal/portal`；物理目录位于 `subpackages/main`，但 `subpackages/main` 不是分包。
- 业务分包为 `workspace`、`message`、`scoring`、`audit`、`venue`、`org`，当前注册页面总数以 `app.json` 为准（2026-08-15 基线为 25 页）。
- 公共逻辑和语言资源位于 `miniprogram/utils`、`miniprogram/components`、`miniprogram/locales`；共享 WXSS 源位于 `miniprogram/subpackages/main/styles/**`。`miniprogram/subpackages/workspace/pages/home/home.wxss` 只是桥接文件。
- 业务分包只能引用自身或主包资源，禁止跨业务分包引用 JS、JSON、WXML、WXSS 或组件。兼容性审计同时检查路径存在性和包边界。

## 当前服务端目录

```text
server/src/
├── core/                         认证、组织、人事、管理员、文件和系统核心能力
├── modules/scoring/              评分与公示
├── modules/audit/                审核、签名、通知和附件
├── modules/venue/                场地借用与审批
├── middleware/                   请求、认证、组织、权限和版本边界
├── config/                       数据库等运行配置
├── locales/zh-CN/                用户可见服务端文案
└── utils/                        日志、校验、缓存和基础工具
```

数据库事实以 `server/db/init.sql` 和 `server/db/deploy/` 迁移账本为准。历史 `DatabaseSchema.md` 是 NoSQL 导出，不是当前模型；`DatabaseSchemaNew.md` 只是当前领域索引。

## 不可回归的 UI 契约

### 签名板与文件定位

- 可视白板和实时笔迹使用普通 `view`，隐藏原生 Canvas 只负责 1:1 导出。
- 白板 rect、触点 `clientX/clientY`、线段端点统一使用视口 CSS px（逻辑像素）绝对坐标；禁止 `pageX/pageY`、scrollTop、DPR、rpx 和固定偏移。
- 白板完成布局、尺寸变化或弹窗重新显示后重新测量 rect；事实数据只保存 `screenX/screenY` 绝对端点，样式生成时才根据当前 rect 减一次 `left/top`。
- 文件预览只保存 `positionX/positionY` 归一化中心点，图片保持宽高比；图片/PDF 合成和 PDF Widget 各自只做一次坐标转换。
- 必须用真实鼠标/触控轨迹验证指针、白板和笔迹逐点重合，静态检查不能代替现场验证。

### 弹窗与规则编辑器

- `miniprogram/app.wxss` 是弹窗几何唯一实现：`.ui-overlay` 和阻断层覆盖视口，`.ui-dialog-shell` 以 `50vw/50vh + translate(-50%, -50%)` 固定居中；不要改成页面级 flex/relative 几何。
- 普通弹窗是标题、直接子级 `scroll-view.ui-dialog-body`、底部 `ui-dialog-footer` 三段结构。内容按实际高度生长，只允许基于视口安全区计算的动态上限；禁止固定内容高度和固定像素翻页。
- 场地规则编辑步骤参考审核模板步骤卡；部门、职能组、身份必须显示真实名称；添加/编辑后语义定位到编辑器；取消/保存必须关闭子编辑器，保存先写回上级编辑器。
- 活动占用在周期下互斥选择生效时间范围或重复次数；场地开放/截止窗口是独立并列设置项；审批历史实时从借用记录匹配，不维护单独历史表。

### UI 语言与响应式

- 视觉事实来源为 `docs/ui-kit.md`、`docs/ui-components.md`、`docs/ui-page-templates.md` 和 `miniprogram/app.wxss`。
- 用户可见提示、指引、空状态、Toast、确认层、通知和导出标题进入 locale；状态码、路由、权限键、数据库值和内部日志不属于文案。
- 手机、Pad 竖屏、Pad 横屏使用独立受控令牌；文字按钮、状态气泡和页签使用统一圆角令牌，禁止新增长期裸字号、胶囊或固定大留白。

## 近期已完成事实

- 主包业务页已迁移到工作台/消息分包；门户、可信导航、上下文守卫、通知目标和测试已同步。
- 共享 `home.wxss` 已迁移到主包 `subpackages/main/styles/home.wxss`，所有业务分包改为主包导入；兼容审计已增加 WXSS、WXML、组件和 JS 的路径/跨分包检查。
- 场地审批历史按当前组织、身份和操作者从借用记录匹配；详情复用借用详情数据形状并展示完整后续进展。
- 审批人员重新指定只在模板步骤显式允许时开放，服务端会再次验证组织、步骤开关和候选人条件。
- PDF 自签名可证明完整性但不等于公共信任；CA 证书链和内部 CA 信任要求见 `docs/pdf-signing-trust.md`。

## 交付基线

- `main` 是唯一生产发布基线。完成任务按 `AGENTS.md` 运行匹配检查、中文 commit、推送、等待 CI 和部署，再核对远端完整 SHA、PM2、迁移账本及健康接口。
- 纯文档、UI 和前端路径修复不新增空迁移；数据库结构变更必须新增时间戳幂等迁移。
- 2026-08-15 路径修复提交为 `06d8620080f98a82853e9f7fc4365d6374888252`；该值只是本次快照记录，后续状态以 Git 和 CI 为准。
