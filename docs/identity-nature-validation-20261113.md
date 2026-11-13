# 岗位性质与身份类别本轮验证记录

## 原生页面

主项目使用官方开发者工具 `auto` 完成编译启动，实际依次打开主包门户及 workspace、message、scoring、audit、venue、org 六个分包入口，7 个入口均未捕获 App 异常。org 切换入口按原业务跳转身份选择页。证据为本机 `tmp/identity-official-auto.log` 与 `tmp/identity-all-packages-runtime.json`。

在阻断真实请求的内存数据中，通过实际界面点击验证身份类别的性质选择与再次取消、同名合并描述选择、确认按钮启用和影响明细。明细按性质、岗位、人员排列，底栏完整。结束恢复请求并返回门户，没有向生产保存测试数据。证据为 `tmp/identity-native-cua-evidence.json` 和 `tmp/identity-native-impact.png`。

早期工具控制台另有 `routeDone webviewId` SDK 错误，不能将 App 异常计数为零描述为整个工具没有错误。最终提交 `acb05100906f11e89697752c633314b39e8eeaec` 的官方预览上传已成功，日志明确返回 `√ preview`，生成二维码及包体信息；主包与六个分包共 4,381,376 字节，七个入口未捕获 App 异常，39 页注册检查通过。证据为 `tmp/identity-final-acb05100-preview.log`、`tmp/identity-final-acb05100-preview-info.json` 与 `tmp/identity-final-acb05100-runtime.json`。此前 TLS 失败轮次不算成功。实体手机、Pad 竖屏和横屏未完成现场验证，不自动发布微信正式版。

## 完整检查

2026-11-13 原生公示追加检查发现并修复性质选择表面缺少页面作用域；查看、被查看、评优指定与被指定四处性质卡使用既有令牌，规则列表样式不受影响。微信模拟器真实打开查看与评优身份 picker，分别仅显示 staff 与 liaison 对应候选；旧不限性质编辑触发明确范围确认，现场取消，没有保存生产数据。冷编译后的控制台显示 No errors，原 `String is not defined` 渲染错误消失。公示状态及 WXS 无 String 宿主共 3 项测试、严格 UI 检查通过。证据包括 `tmp/publication-native-final.png`、`tmp/publication-native-probe.json`、`tmp/publication-native-final-tests.log`。

完整 CI 的旧场地夹具由独立 Agent 逐项修正：人员定位包含岗位性质，范围新增先选择性质并断言 natureIds。审批 12 项及借用/参会人 27 项三档浏览器验证通过。实体手机、Pad 竖屏与横屏仍未完成现场验证；本机 CI 最终状态以最终提交证明为准。

第一次完整检查发现来源复制草稿 SQL 审计及旧浏览器夹具的问题；第二次发现原生字典测试仍从拆分前的页面查找身份类别控件。失败轮次没有生成通过证明，也没有推送发布。

原生字典检查现读取真实 identityManager 组件，同时验证宿主传入加载状态、失败提示、重试绑定及失败保留已有目录。20 份原生测试文件逐一执行通过。最终完整 CI 必须在包含此修复的提交上重新运行，结果以该提交的签名证明为准。

## 生产边界

上线前只读核对为 2 个组织、10 个身份类别、1,565 个岗位，其中 1,553 个 active、12 个 revoked；缺少身份或性质引用的岗位为 0。9 类身份有岗位引用，唯一无引用类别仍为已确认的第四十三届部门主要负责人。第四十四届部门负责人的 liaison 引用包含 1 条 revoked 岗位，不能因状态排除该关联。

这些是结构与数据事实，不等同于生产全部接口逐角色等价验证。

## 兼容版本 A 上线

A 为 `acb05100906f11e89697752c633314b39e8eeaec`。完整本机 CI 退出码 0，浏览器 1,050 项全部通过，生成该提交的签名证明；日志为 `tmp/identity-nature-full-ci-a4.log`。发布运行号为 `43366013033`，已读取验证成功状态，生产部署日志于 2026-11-13 12:32:35 记录成功，耗时 62 秒。四个实际进程均在线且工作目录为 A，本机及公网健康返回 200，未进入维护；五项在线迁移使账本从 69 项增加至 74 项，发布前备份已生成。工作流最终状态另行核对，不以远端日志代替。

A 后只读对照于 UTC 04:34:17 完成：18 张表原字段投影的数量和 SHA256 均与迁移前一致；1,565 个岗位含 12 个 revoked，缺失或非法关联为 0；10 个身份关联符合方案，唯一无岗位身份为已确认的 staff，第四十四届部门负责人保留 staff 与 liaison。两组织仍未启用，八张规则表共 229 行的新性质条件均为 NULL，保留旧范围。证据为 `tmp/identity-production-before.json` 与 `tmp/identity-production-after-a.json`。

本提交 B 仅将协议 2 的首次启用标记改为 true，并登记上述验证；必须重新执行 B 自身完整本机 CI、滚动发布和实际进程检查后，才能以 A 为兼容回退版本逐组织启用。
