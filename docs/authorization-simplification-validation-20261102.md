# 2026-11-02 授权身份与日常配置简化

本轮仅修改两端编辑、展示、共享文案与对应验证，不修改服务端授权执行或数据库结构。授权身份独立于人事身份类别；默认新增只显示人员、身份、数据范围三个部分。复杂规则保留高级编辑，既有权限未重写。

## 已执行检查

- `authorization.spec.js` 在Chrome手机、平板、电脑三档共33项通过，包括三步保存后重开、禁止/字段限制、批量删除、委托、身份发布与恢复。请求为隔离内存应答，不冒充生产写入。
- `authorizationMiniPage.test.js` 和 `authorizationSimplification.test.js` 共15项通过，包括真实页面方法、清空选择、隐藏后迟到响应、同名岗位不合并及复杂限制不可被简化丢弃。
- `authorizationIntegration.test.js` 使用隔离MySQL与HTTP完成保存回读、事务及组织隔离检查。新增用例直接使用前端 `prepareSimpleDraft/request` 生成身份绑定参数，真实保存后回读名称、岗位、数据范围及可重新简化状态，不是只接收请求。
- 网页生产构建通过；`parity-audit.mjs` 三档87项通过。原生39页注册、兼容性、123个弹窗结构、114个键盘模板、977个按钮居中及2732个控件严格UI检查通过。
- 共享26个模块及80个语言文件副本一致，语言单一来源、对齐、严格文案及本地化检查通过。文案质量建议仍有全仓1506条存量提示，未宣称全仓清零。

## 实际界面

主项目微信模拟器实际打开人员授权页，权威读取成功；点击新增授权，ready为true、advanced为false、错误提示为空，三步分区和深色管理hero正常。共享岗位选择器另行实际打开，读取777个岗位候选。未向生产写入授权、身份或测试人员。

截图在本机临时目录：`authorization-simple-native.png`、`authorization-simple-native-editor.png`、`authorization-simple-native-picker.png`；网页三档截图在 `web/test-results/authorization-authorizatio-9aef4-erves-saved-scope-on-reopen-*`。

最终源码官方预览成功：主包413683字节，审核392146、消息36281、组织214290、评分1285774、场地508972、工作区1260230字节，总计4111376字节。此前两次上传TLS中断按失败记录，成功结果来自后续真实重试；二维码和尺寸JSON位于临时目录 `authorization-simple-preview.png/json`。

实体手机、Pad竖屏、Pad横屏未完成现场验证。微信正式版不自动发布。完整CI按本轮纯前端规则不运行；提交和生产部署以实际发布记录为准。
