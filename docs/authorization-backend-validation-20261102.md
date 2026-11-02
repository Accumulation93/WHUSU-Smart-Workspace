# 统一授权后端最终专项复验

2026-11-02 在主项目执行。数据库专项使用 `127.0.0.1:3362` 各自临时库，未连接生产写入，不运行完整 CI，不提交或部署。

| 测试文件（`server/test/`） | 最终结果 | 验证方式 |
| --- | --- | --- |
| authorizationIntegration.test.js | 退出 0 | 隔离 MySQL、实际 HTTP 参数、授权和业务保存回读；会话为测试夹具 |
| authorizationLegacyMigrationIntegration.test.js | 退出 0 | 暂存、对照、并发旧写、失败整单回滚、启用、新组织继承 |
| venueConfigurationAuthorizationIntegration.test.js | 退出 0 | 配置持久化、字段、撤权及组织边界 |
| organizationVenuePurposesIntegration.test.js | 退出 0 | 事由组织隔离、配置成包/接收/复制和字典关联；该文件不替代真实授权链 |
| auditTemplateSaveIntegration.test.js | 退出 0 | 两端真实提交参数、审核模板、评分结果/任务/规则/公示保存回读 |
| calendarIntegration.test.js | 退出 0 | 日程、场地动作与事务回滚 |
| identityCardIntegration.test.js | 退出 0 | 身份卡生成参数、保存回读、公开白名单和失效 |
| notificationDismissalIntegration.test.js | 退出 0 | 通知删除、跨领域失效、列表计数、缓存版本 |
| messageCenter.test.js | 退出 0 | 模拟依赖，消息聚合与角色隔离 |
| venueTodoMultiFlow.test.js | 退出 0 | 模拟依赖，旧模式多流程业务资格 |
| messageTodoAuthorization.test.js | 退出 0 | 模拟依赖，旧人事审核权限与读取次数 |
| crossOrgMessageRoutes.test.js | 退出 0 | 模拟依赖，聚合、筛选、部分失败和写入范围 |
| publicMessage.test.js | 退出 0 | 公共文案保护 |
| venueSharedRuleCopy.test.js | 3 项通过 | 周期、连续占用及非法规则纯计算 |
| venueBookingWindowCopy.test.js | 2 项通过 | 时间边界及损坏数值拒绝 |
| venueBookingRuleCopy.test.js | 2 项通过 | 岗位关联及副本展示 |

两份旧待办纯模拟测试首次因新动态授权依赖尝试加载真实数据库而失败。逐文件补明确的 shadow 授权依赖模拟后复跑通过，没有修改生产权限逻辑；新模式真实授权和撤权仍由前述隔离数据库用例验证。两个修改文件的语法与 `git diff --check` 通过。

本次 16 个文件通过不代表完整 CI、真实登录、最终网页或微信现场、手机/Pad布局、生产迁移或发布通过，这些仍由整轮交付分别核验。

## 上线前迁移和部署复审

再次阅读 `authorizationCutover`、`authorizationLegacyMigration/Plan/Inventory`、`authorizationDeployment.js/.sh`、`deployProduction.sh` 和 `deployEntrypoint.sh`。旧权限缺失关联、未知键、无映射能力、人工修改和来源变化均阻断，不自动猜测补权。对照阶段只采用调用方明确验证的旧权限，激活与旧写入通过同序事务锁协调。

发布要求两个不同且真实存在的兼容版本，验证 Git 祖先关系、磁盘解释器和依赖、当前软链接及全部实际进程工作目录。激活使用同一个发布锁。正式启用后，当前运行版先检查候选提交，回退检查位于链接和数据库恢复之前；账本所记两份发布目录不被常规清理删除，读取失败时保留全部目录。

第二次发布不能是只改文档或空提交：现有发布器会直接跳过没有运行文件变化的提交，纯网页发布也不重启服务进程；实际进程仍在第一版目录时激活应拒绝。需按正常服务端滚动发布形成第二份实际运行的兼容版本，再执行生产对照与激活。

复审后再次运行 `authorizationDeployment.test.js`（3项）、`deploymentAutomation.test.js` 和 `authorizationLegacyMigrationIntegration.test.js`，均退出0。此次没有新增运行代码修改、没有操作生产、没有运行完整CI；HR与迁移模型改动冻结，后续仅处理最终检查确认的缺陷。

## 完整 CI 前的服务端逐文件检查

按 `scripts/ci/run.js` 的 Git 文件清单顺序，使用 `TZ=UTC` 和本机 3362 端口执行全部 258 个顶层 `server/test/*.test.js`。首次 241 个通过、17 个失败；逐文件补齐新授权依赖的模拟、隔离库迁移和测试密钥，以及更新仍指向旧路由 SQL 的检查后，17 个失败文件全部复跑退出 0。没有以放宽业务权限或删除安全断言来通过检查。本次结果是首次扫描与失败复验的组合，不冒充修改后的全套重跑或完整 CI。

原始日志保存在本机临时目录 `whusu-backend-final-20261102.log`、`whusu-backend-final-20261102-summary.log` 和 `whusu-backend-final-20261102-recheck.log`。复验保留账号治理撤权、旧接口零副作用、跨组织隔离、800 行表格真实导出，以及 3 步 PDF 实际签署与验签。

人事前端方法检查 `hr-profile-export-test.js`、`hr-template-save-continuation-test.js` 和 `hr-template-switch-suggestion-test.js` 三项再次通过，包含 255 列导出选择和真实 Behavior 方法。岗位性质的新增、仅创建权目录最小返回、岗位保存与重新读取由 `authorizationIntegration.test.js` 的真实 HTTP 参数链验证；ROOT 已确认最终复跑通过。前述检查不代替微信现场操作、实体设备或生产发布。

## 首份兼容发布的完整本机CI

提交 `4de58692095a29ebd489186e1aa81826cb2a8d1b` 的完整本机CI最终退出0，972项浏览器检查全部通过（14.5分钟），代码、原生单元、服务端、隔离数据库与官方依赖审计一并完成。Git notes的本机签名证明已通过 `readVerified` 核验。日志为本机临时目录 `authorization-full-ci-20261102-r7.log`；先前失败轮次没有证明，不能用于发布。此记录只证明该提交通过验证，不等于已推送或上线；正式启用版及生产结果分别确认。
