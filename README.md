# WHUSU Smart Workspace

WHUSU智慧工作台是一个原生微信小程序与 Node.js/Express/MySQL 服务端组成的组织工作台，当前包含评分、人事、审核审批、场地借用、消息中心和组织/身份管理。

## 事实来源

- UI 规范：[docs/ui-kit.md](docs/ui-kit.md)、[docs/ui-components.md](docs/ui-components.md)、[docs/ui-page-templates.md](docs/ui-page-templates.md)
- 小程序编译边界：[docs/miniprogram-compiler-compatibility.md](docs/miniprogram-compiler-compatibility.md)
- 分包与语言边界：[docs/module-boundaries-and-language-migration.md](docs/module-boundaries-and-language-migration.md)
- 生产协作：[docs/deployment-automation.md](docs/deployment-automation.md)
- 当前数据库结构：[server/db/init.sql](server/db/init.sql)；历史迁移：[server/db/deploy/](server/db/deploy/)

## 当前目录边界

```text
server/                         Express 服务端、迁移和测试
miniprogram/                    原生微信小程序
  app.json                      顶层主包注册与 6 个业务分包注册
  subpackages/main/pages/       登录、门户；注册在 app.json.pages，仍属于主包
  subpackages/workspace/        综合工作台入口
  subpackages/message/          消息中心
  subpackages/scoring/          评分与综合管理页
  subpackages/audit/            审核、审批、签名与验签
  subpackages/venue/            场地借用与审批
  subpackages/org/              组织、身份和权限入口
  subpackages/main/styles/      主包共享 WXSS；业务分包可引用，不得互相引用
  components/                   跨分包共享组件
  locales/                      用户可见语言资源
```

包归属以 `miniprogram/app.json` 的注册位置为准，不以物理目录名称判断。业务分包只能引用自身分包或主包资源，禁止跨业务分包相对引用；共享 WXSS 源统一放在 `miniprogram/subpackages/main/styles/**`。`miniprogram/subpackages/workspace/pages/home/home.wxss` 只是兼容桥接文件，不是共享样式源。

## 快速开始

### 初始化数据库

```powershell
cd server/db
# Windows 执行 setup-local.bat
```

### 启动服务端

```powershell
cd server
npm install
npm start
# 本地 HTTP 默认监听 http://127.0.0.1:3000；生产 HTTPS 由 Nginx 终止
```

### 打开小程序

用微信开发者工具导入 `miniprogram/`，开发环境按需开启“不校验合法域名、web-view（业务域名）”。原生构建固定关闭隐式 runtime、SWC、enhance 和热重载路径，具体见编译兼容性规范。

## 交付前检查

```powershell
node scripts/miniprogram-compat-audit.js
node scripts/ui-audit.js --strict
node scripts/user-visible-copy-audit.js --localization-prefix=miniprogram/ --strict-localization
node scripts/user-visible-copy-audit.js --localization-prefix=server/src/ --strict-localization
node scripts/user-visible-copy-audit.js --strict-guidance
git diff --check
```

小程序改动还必须清缓存、冷启动微信开发者工具并编译主包和已注册分包入口；静态命令不能替代现场编译。完成后由 GitHub Actions 执行质量门禁和部署，纯文档/前端改动不伪造数据库迁移。

## API 与数据

业务接口统一通过 `/api/{functionName}` 提供，默认使用 POST、JWT Bearer 和组织上下文。服务端真实路由位于 `server/src/core/routes/` 与 `server/src/modules/*/routes/`，SQL 以 Model 层和 `server/db/init.sql`、已执行迁移为准；不要以历史 NoSQL 导出或旧 API 清单推断当前结构。

## 版本与发布

`main` 是唯一生产发布基线。完成修改后按项目入口规则执行检查、中文 commit、推送、等待 CI，并核对远端运行 SHA、PM2 进程和健康接口。不得提交密钥、`.env` 或强制推送。
