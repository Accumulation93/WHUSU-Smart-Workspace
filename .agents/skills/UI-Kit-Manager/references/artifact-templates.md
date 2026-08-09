# Artifact Templates

Use these templates after the user approves document creation. Adapt names, paths, and language to the target project.

## `docs/01-项目架构/01-项目总览与技术栈.md`

```markdown
# 项目总览与技术栈

## 项目一句话


## 使用者

- TODO

## 当前阶段

- TODO

## 主要技术栈

| 层级 | 当前选择 | 依据 | 待确认 |
| --- | --- | --- | --- |
| 前端 |  |  |  |
| 后端 |  |  |  |
| 数据库/存储 |  |  |  |
| 部署 |  |  |  |
| UI |  |  |  |

## 核心目标

1. TODO

## 暂不处理

- TODO

## 重要风险

- TODO
```

## `docs/01-项目架构/02-目录结构与代码边界.md`

```markdown
# 目录结构与代码边界

## 顶层目录

| 路径 | 作用 | 维护注意 |
| --- | --- | --- |
| `src/` |  |  |

## 入口文件

- TODO

## 代码边界

- UI：
- 业务逻辑：
- 数据访问：
- 外部集成：
- 配置：

## 不应随意修改

- TODO
```

## `docs/02-启动部署/01-本地启动与开发调试.md`

````markdown
# 本地启动与开发调试

## 前置要求

- TODO

## 安装依赖

```bash

```

## 启动开发环境

```bash

```

## 常用检查

| 目的 | 命令 | 备注 |
| --- | --- | --- |
| 构建 |  |  |
| 测试 |  |  |
| Lint |  |  |
| 类型检查 |  |  |

## 调试入口

- TODO

## 常见问题

- TODO
````

## `docs/02-启动部署/02-构建部署与环境变量.md`

````markdown
# 构建部署与环境变量

## 构建命令

```bash

```

## 部署方式

- TODO

## 环境变量

Do not write real secrets in this file.

| 名称 | 用途 | 必需 | 示例/来源 |
| --- | --- | --- | --- |
|  |  |  |  |

## 外部服务与成本边界

- TODO
````

## `docs/03-数据与接口/01-数据模型与存储.md`

```markdown
# 数据模型与存储

## 存储方式

- TODO

## 核心数据对象

| 对象 | 说明 | 关键字段 | 关系 |
| --- | --- | --- | --- |
|  |  |  |  |

## 数据安全

- TODO

## 待确认

- TODO
```

## `docs/03-数据与接口/02-外部API与集成.md`

```markdown
# 外部 API 与集成

## 集成清单

| 服务 | 用途 | 凭证位置 | 风险/限制 | 测试方式 |
| --- | --- | --- | --- | --- |
|  |  | 不记录真实密钥 |  |  |

## 请求/回调边界

- TODO

## 失败状态

- TODO
```

## `docs/04-功能模块/01-功能模块地图.md`

```markdown
# 功能模块地图

## 模块清单

| 模块 | 用户 | 主要动作 | 入口路径 | 依赖 |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 第一版范围

- TODO

## 后续版本

- TODO
```

## `docs/05-UI与交互/01-UI套件与页面规范.md`

```markdown
# UI 套件与页面规范

## 产品表面

- 类型：
- 密度：
- 主要使用者：

## UI Provider

- 当前 provider：
- 样式系统：
- 组件目录：
- 页面模板目录：

## 设计档案

- 颜色：
- 字体：
- 圆角：
- 间距：
- 阴影：
- 动效：
- 动效参考：
- 图标/图片：

## 动效参考

- 推荐参考：
- 使用边界：
- 降低动态效果：
- 性能/移动端注意：

## 页面模板

| 模板 | 用途 | 必备状态 |
| --- | --- | --- |
| 列表页 |  | 加载/空/错误/权限 |
| 详情页 |  | 加载/错误/权限 |
| 创建/编辑 |  | 校验/保存/取消 |
| 设置页 |  | 保存/重置 |
| 仪表盘 |  | 加载/空/错误 |

## 组件清单

| 组件 | 路径 | 用途 | 注意 |
| --- | --- | --- | --- |
|  |  |  |  |
```

## `docs/06-维护更新/01-后续维护与更新规则.md`

```markdown
# 后续维护与更新规则

## 新 Agent 接手

1. 先读 `docs/00-目录索引.md`。
2. 根据任务读取对应分类文档。
3. 修改前检查 Git 状态。
4. 保留用户已有修改。

## 文档更新规则

- 架构、启动、数据/API、功能模块、UI 规范变化后，更新对应 docs。
- 新增公共组件、页面模板、外部集成、环境变量后，更新对应清单。
- 不确定的信息标记为 `待确认`。

## 修改边界

- 代码修改：
- 依赖/配置：
- 环境变量/密钥：
- 数据库/迁移：
- 部署/计费：
```

## `docs/06-维护更新/02-docs整理与清理记录.md`

```markdown
# docs 整理与清理记录

| 日期 | 操作 | 范围 | 依据 | 备注 |
| --- | --- | --- | --- | --- |
| YYYY-MM-DD | 初始化维护文档 | `docs/` | 只读扫描/用户说明 |  |

## 已知陈旧内容

- TODO

## 待整理

- TODO
```

## Agent Adapter Templates

Use `agent-compatibility.md` for full adapter guidance. At minimum:

```markdown
# Agent Instructions

## Read First

1. Read `docs/00-目录索引.md`.
2. Read the architecture, startup, data/API, feature, UI, or maintenance docs that match the task.
3. Check Git status before edits.

## Repository Boundary

- Project root:
- Main source paths:
- Generated/runtime paths to avoid:

## Approval Boundaries

- Preserve user changes.
- Do not modify source code, dependencies, config, env files, databases, migrations, deployment, billing, auth, or persistent data without explicit user approval for that change.
- Documentation updates are allowed only within the approved document plan.

## Commands

- Install:
- Dev:
- Build:
- Test:
- Lint/typecheck:

## Documentation Updates

When changes affect architecture, startup, data/API contracts, feature maps, UI rules, or maintenance workflow, update the shared docs.
```
