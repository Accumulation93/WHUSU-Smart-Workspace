# 权限展示修复验证记录

## 已实现的范围

按独立设计 `docs/copy/authorization-clarity-context-20261113.md` 和独立语言 `docs/copy/authorization-clarity-copy-20261113.md`，两端查询默认显示服务端判定为已授权的条目，切换全部后分别显示禁止、未单独授权与不可确认，搜索只过滤选定集合。逐项通用业务要求已移除，来源规则仍保留真实范围、投影字段与期限。

分配首页按工作角色主键分组，岗位为主标题、姓名为副标题；两级折叠默认关闭，展开后才创建明细。动态条件授权同页独立显示。权限角色目录默认折叠，已发布和草稿内容分别展开。共享展示不增加授权判断，不扩展人员或记录读取范围。

## 本地与网页

- `node --test server/test/authorizationMiniPage.test.js server/test/authorizationSimplification.test.js server/test/authorizationPortalEntry.test.js`：30项通过，包含真实页面方法生成的保存参数与回读、字段保护及未知查询状态。
- `npm run build`：通过。
- 最终构建后，Chrome `authorization.spec.js` 与 `authorization-portal-entry.spec.js`：手机、Pad竖屏、桌面横屏共69项整轮通过，产物在 `web/test-results-authorization-clarity-final-run/`。新增大规模场景为20个工作角色×15项授权×30项功能，验证折叠时不创建隐藏明细、父子重开一致、搜索不改变查询范围。
- `node scripts/parity-audit.mjs http://127.0.0.1:4197/web`：390、768、1280三档，每档29项，87项全部通过。
- `miniprogram-page-registration-test.js`：39页通过；`wechat-template-runtime-audit.js`：124模板复杂度通过，环境无Glass-Easel，不能替代官方编译。修改JS语法与 `git diff --check` 通过。

网页截图使用固定接口应答，不是生产保存或实体设备验证。新增测试首轮误用了重构前的预览构建，重新构建后通过；最终69项为重建后完整运行。4173端口被另一检查使用时另启4197，未停止其他任务进程。

## 官方微信与原生交互

最终官方 `cli.bat preview` 成功，日志 `tmp/authorization-clarity-preview-final.log`，新体积记录 `tmp/authorization-clarity-preview-final.json` 与预览图 `tmp/authorization-clarity-preview-final.png`。主包483807字节，audit405376、message37381、org274099、scoring1372354、venue515229、workspace1352210字节，总计4440456字节。

官方 `auto --auto-port 9431` 日志为 `tmp/authorization-clarity-auto.log`。390×844模拟器只读夹具实际点击一级工作角色、二级授权、收起、查询模块、查询操作和全部范围，结果 `tmp/authorization-clarity-native-check.json` 为 passed=true，exceptions与logs均为空数组。截图 `tmp/authorization-clarity-native-list.png`、`tmp/authorization-clarity-native-grant.png`、`tmp/authorization-clarity-native-inspection.png` 已实际查看。临时请求替换在finally恢复，随后再次读出mockPresent=false；未向生产保存测试授权。

原生截图由微信官方自动化接口取得。Windows窗口激活在Sky与CUA均失败，错误捕获的桌面背景没有用于验收。实体手机及原生Pad竖横屏未完成现场验证；网页三尺寸不能替代这些设备结果。后台隔离库验证、全局语料审核、提交、推送、CI和部署由本轮主任务独立记录，本记录不宣称这些步骤完成。
