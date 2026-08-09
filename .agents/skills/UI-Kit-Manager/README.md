# UI Kit Manager

[English](README.en.md)

`ui-kit-manager` 现在不只处理组件化和 UI 规范。它被升级成一个项目创建初期、中途继续开发和老项目接管时使用的 Codex Skill：先按项目阶段判断该规划、该创建、该继续做，还是该只读接手，再让 Codex、Claude Code、Cursor、Gemini CLI 等 Agent 按同一套索引继续开发。

它保留原来的 UI 套件能力，但 UI 只是项目建制的一部分。

## 适合什么时候用

- 你只有一个模糊想法，例如“我想做一个门店库存系统”，但不知道该怎么开始。
- 你不懂代码，希望 Agent 先用人话问清楚需求，再规划项目。
- 你要创建一个新网站、App、SaaS、后台、桌面软件、工具、AI 工作流或内部系统。
- 你已经有一个做到中间的项目，希望 Agent 先看现状，再继续完成页面、功能、修复或收尾。
- 你接手了一个老项目，希望先只读扫描、理解结构，再建立维护索引。
- 你想让同一个项目能被 Codex、Claude Code、Cursor、Gemini CLI 等不同 Agent 共同维护。
- 你仍然想统一前端 UI、组件、主题、页面模板和设计规则。
- 你对动效、微交互、动态背景或更有记忆点的 React 页面有需求，需要一个开源参考站点。

## 三类主入口

### 1. 新项目：按授权选择规划或创建

当用户只有想法时，Skill 会先问 10 个普通问题，而不是要求用户回答技术栈：

1. 你想做的东西一句话是什么？
2. 主要给谁用？
3. 用户最重要的 3 件事是什么？
4. 有没有参考产品、截图、网站或 App？
5. 第一版要做网页、移动端、桌面软件、后台，还是还不确定？
6. 需要账号或不同身份吗？
7. 需要保存哪些信息？
8. 需要接入微信、支付、地图、邮件、飞书、OpenAI 等外部服务吗？
9. 第一版要达到演示、自己用、团队用、客户试用，还是上线收费？
10. 有什么必须避免的事？

回答后，它会生成项目目标、MVP 范围、用户角色、功能地图、数据对象、技术方向、文档计划和 Agent 维护规则。写文件前会先让用户确认。

如果用户明确说要直接创建、初始化或 scaffold 项目，Skill 不会强制完整十问；它只补问影响成本、账号、存储、外部服务、部署或第一版体验的关键问题，然后在授权范围内创建项目，并附带最小可用的维护文档。

### 2. 中途项目：先看现状，再继续做

当项目已经做到一半，用户要继续做功能、修页面、收尾或修 bug 时，Skill 会：

1. 确认仓库边界和 Git 状态。
2. 读取现有 `AGENTS.md`、`CLAUDE.md`、README、配置和已有维护文档。
3. 只检查与当前任务相关的代码和相邻示例。
4. 在用户已经授权的任务范围内继续实现。
5. 不把创建完整 docs 当成小功能或明确修复的前置条件。

只有当项目缺少上下文导致实现风险明显、多人/多 Agent 要接手、用户要求标准化，或变更影响架构、启动、数据/API、UI 规范时，才建议单独做一次 foundation/takeover。

### 3. 已有项目接手：先只读扫描，再请求许可

接管老项目时，默认只读：

1. 确认仓库边界和 Git 状态。
2. 扫描技术栈、启动命令、配置、入口文件、数据/API 线索、UI provider、现有 docs 和 Agent 文件。
3. 输出项目事实、未知项和风险。
4. 提出维护索引创建计划。
5. 等用户确认后，才创建或更新文档。

任何源代码、依赖、配置、环境变量、数据库、迁移、部署、计费、鉴权相关修改，都需要单独明确许可。

## 典型产物

```text
docs/00-目录索引.md
docs/01-项目架构/01-项目总览与技术栈.md
docs/01-项目架构/02-目录结构与代码边界.md
docs/02-启动部署/01-本地启动与开发调试.md
docs/02-启动部署/02-构建部署与环境变量.md
docs/03-数据与接口/01-数据模型与存储.md
docs/03-数据与接口/02-外部API与集成.md
docs/04-功能模块/01-功能模块地图.md
docs/05-UI与交互/01-UI套件与页面规范.md
docs/06-维护更新/01-后续维护与更新规则.md
docs/06-维护更新/02-docs整理与清理记录.md
AGENTS.md
CLAUDE.md
```

`docs/00-目录索引.md` 是人和 Agent 的第一阅读入口。`AGENTS.md`、`CLAUDE.md` 等文件只做薄适配，统一指向共享 docs。

## 脚本

项目基础扫描：

```bash
python scripts/scan_project_foundation.py --project /path/to/project
```

前端 UI 扫描：

```bash
python scripts/scan_ui_patterns.py --project /path/to/project
```

默认输出到终端时，两个脚本都是只读。带 `--out` 参数会写入指定报告文件；接管已有项目时，只有在用户同意创建/更新文档后才使用 `--out`。基础扫描器不会读取真实 `.env` 或 credential-like 文件内容，只记录文件名。

## 动效参考

当项目有 React 动效、微交互、文字动画、动态背景或创意落地页需求时，可以把 React Bits 作为参考：

- Website: https://www.reactbits.dev
- GitHub: https://github.com/DavidHDev/react-bits

它只作为灵感和组件参考，不会因为被推荐就自动安装依赖或复制组件；真正实现动效仍然需要单独确认。

## 安装

PowerShell:

```powershell
git clone https://github.com/penposs/UI-Kit-Manager.git $env:USERPROFILE\.codex\skills\ui-kit-manager
```

Bash:

```bash
git clone https://github.com/penposs/UI-Kit-Manager.git ~/.codex/skills/ui-kit-manager
```

安装后重启 Codex，让 Skill 列表刷新。

## 使用示例

```text
使用 $ui-kit-manager，我有一个模糊想法，想做给门店用的库存管理系统，你先问我问题，不要直接写代码。
```

```text
使用 $ui-kit-manager，帮我在这个目录直接创建一个库存管理后台，先用简单可维护的默认方案。
```

```text
使用 $ui-kit-manager，这个项目做到一半了，先看现状，然后继续把订单列表页做完。
```

```text
使用 $ui-kit-manager 接管这个老项目，先只读扫描，然后给我维护索引创建计划，不要改代码。
```

```text
使用 $ui-kit-manager 给这个项目建立 Codex 和 Claude Code 都能读的维护文档入口。
```

```text
使用 $ui-kit-manager 统一这个前端项目的 UI 套件、组件清单和页面模板。
```

## 校验

```bash
python /path/to/skill-creator/scripts/quick_validate.py .
```

预期结果：

```text
Skill is valid!
```
