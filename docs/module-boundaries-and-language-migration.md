# 小程序功能边界与语言系统迁移计划

更新时间：2026-08-15

## 1. 当前事实

当前 `miniprogram/app.json` 注册了主包和 4 个分包：

- 主包：登录、门户、消息中心、`home` 综合用户页。
- `subpackages/scoring`：评分、评分任务，以及同时承载考核、人事、系统设置、审核管理的综合 `admin` 页。
- `subpackages/audit`：普通用户审核、审批、签名与验签页面。
- `subpackages/venue`：场地借用与场地管理页面。
- `subpackages/org`：组织/身份切换、权限与账号入口页面。

现状不是“一项功能一个分包”。主要揉合点有两个：

1. 主包 `pages/home` 通过 `subApp=scoring|hr|audit` 同时承载考核评分、人事资料、账号安全和审核入口。
2. `subpackages/scoring/pages/admin` 通过 `subApp=scoring|hr|system|audit` 同时加载 16 个管理页签，其中人事、系统和审核不属于考核分包。

迁移前没有独立语言系统，面向用户的中文散落在 JS、WXML、页面 JSON 和服务端响应中。2026-08-15 的基线审计发现：主包 235 条、考核分包 1238 条、审核分包 326 条、场地分包 502 条、组织分包 41 条、共享组件/工具 14 条、服务端 981 条可见文案。数字用于迁移跟踪，不代表业务数据、注释或开发日志必须翻译。

2026-08-15 已完成第一阶段：在不改路由、API、权限和业务判断的前提下，主包、全部现有分包、共享组件/工具和服务端公开文案已迁入独立语言资源；全局语言硬编码审计为 0。功能目录拆分仍按第 3 节分阶段实施，不能和文案迁移混成一次高风险改造。

## 2. 目标边界

### 2.1 主包只保留启动壳

- `pages/login`：认证入口。
- `pages/portal`：应用门户。
- 共享运行时：认证、组织上下文、可信导航、公共组件与公共语言资源。

门户是登录后的首个应用壳，保留主包是有意设计，不视为功能揉合。

### 2.2 独立功能分包

- `subpackages/message`：消息中心、跨组织待办与通知。
- `subpackages/scoring`：用户评分首页、评分表、评分任务、考核活动/模板/规则/结果/公示管理。
- `subpackages/hr`：用户人事资料、补充资料、账号与登录、人事人员/模板/部门/职能组/身份管理。
- `subpackages/audit`：用户审核首页、申请、待批、审批历史、签名、验签，以及审核模板/印章/申请/验签权限管理。
- `subpackages/venue`：场地借用、审批历史、日程和场地管理，保持现有边界。
- `subpackages/org`：组织与身份切换、权限管理和组织级身份上下文。
- `subpackages/system`：管理员账号与基础设置。

共享代码只允许放在 `miniprogram/utils`、`miniprogram/components` 和 `miniprogram/locales`；功能专用组件、工具和语言资源必须留在所属分包。

## 3. 功能迁移顺序

1. 先建立语言资源层和硬编码审计，不改变任何页面路由。
2. 把 `pages/home` 的考核、人事、审核三个视图区块拆成独立页面；保留旧地址作为只跳转的兼容入口。
3. 把综合 `scoring/pages/admin` 按页签所有权拆为 scoring、hr、audit、system 四个管理页；共享的数据选择器先提取为公共组件，禁止复制实现。
4. 把消息中心移入 `subpackages/message`，更新门户、可信导航和上下文守卫；旧地址保留兼容跳转。
5. 更新 `app.json` 分包清单和门户卡片地址，逐步删除兼容入口。

每一步必须保持 API 名称、请求参数、响应结构、权限判断、组织隔离、缓存键、页面入口和用户可见行为不变。不得在目录迁移中顺带修改业务规则。

## 4. 独立语言系统

### 4.1 文件布局

```text
miniprogram/locales/runtime.js
miniprogram/locales/zh-CN/common.js
miniprogram/locales/zh-CN/app.js
miniprogram/locales/zh-CN/main.js
miniprogram/locales/zh-CN/home.js
miniprogram/locales/zh-CN/generated/<原业务路径>.js
server/src/locales/runtime.js
server/src/locales/zh-CN/generated/<原业务路径>.js
```

- 主包核心页面使用可读语义键；历史页面的大批量等值迁移使用内容寻址键，资源文件按原业务路径镜像，避免不同页面互相污染。
- 内容寻址键只用于保证历史文案迁移可核对、可重复；新增功能必须使用可读语义键。修改文案时只改语言资源值，不把中文重新写回业务文件。
- WXML 文案通过页面 `data.copy` 读取，不在模板中保留中文常量。
- JS 中的 Toast、确认层、空状态、标签和导航标题只引用语言资源。
- 动态句子由语言文件提供格式化函数或模板，业务代码只传变量。
- API 状态码、路由、权限键、数据库枚举和业务标识不是语言，不得移入语言文件。
- 页面 JSON 不保存中文导航标题，由页面加载时从语言资源设置。

### 4.2 完成门禁

- 生产 JS 中不存在面向用户的中文字符串常量；语言资源文件除外。
- WXML 中不存在中文文本节点和中文可见属性；注释除外。
- 页面 JSON 中不存在中文标题或提示。
- 服务端用户响应、通知、导出标题和公开错误提示全部来自语言资源；内部日志、异常代码和数据库值保持原语义。
- 语言审计、全部 JS 语法检查、小程序兼容审计、严格 UI 审计、现有单元/集成测试和微信开发者工具主包/全部分包冷启动均通过。

CI 必须同时执行：

```bash
node scripts/user-visible-copy-audit.js --localization-prefix=miniprogram/ --strict-localization
node scripts/user-visible-copy-audit.js --localization-prefix=server/src/ --strict-localization
```

## 5. 回归策略

每个页面迁移前生成文案键值快照，迁移后逐项比较最终字符串；动态文案覆盖空值、单数、多数和变量插值。每个分包迁移独立提交，只有该分包完整通过后才进入下一分包。目录拆分阶段同时保留旧路由兼容页，并通过导航测试证明新旧入口到达同一功能。
