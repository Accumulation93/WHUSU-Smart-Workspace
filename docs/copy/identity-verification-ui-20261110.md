# 身份核验结果页结构复核

卡片化验证：网页构建成功，三档浏览器 21 项通过（tmp/identity-ui-browser.log）；小程序兼容与注册各 39 页、按钮 989 项及 identityCardPage 测试通过。主项目微信模拟器已冷编译并注入仅内存示例，实际看到查看者 Hero、两张独立结果卡及完整刷新按钮，控制台无错误。官方预览上传失败于 TLS 建连（tmp/identity-two-cards-preview.log），未生成本轮二维码，不据此声明发布成功。实体手机、Pad 竖屏及横屏未完成现场验证。

后续卡片化复核：保留查看者 Hero；有效结果分为摘要卡与任职资料卡。摘要按标题、姓名、核验结论、普通次级状态排列，不使用状态标签块；组织与岗位在第二张卡中以普通字段呈现，核验时间与刷新在底部。加载或失败只保留反馈卡，不显示空资料卡。两端共用 card-gap。独立设计与语言 Agent 批准继续复用原有语料，不新增提示语。

用户随后明确要求恢复查看者自己的共享Hero。前端设计与语言Agent再次独立批准：顶部显示当前查看者会话，公共页名复用verifyTitle；管理权限深色、普通岗位蓝色，匿名仅品牌与页名。下方独立显示被核验对象，不向Hero传入核验资料。此次不新增语料。浏览器增加两类工作角色的身份分离、主题和卡片间距检查。

前端设计 Agent 与独立语言 Agent 已批准：浅色玻璃详情卡，标题、姓名与状态、核验结果、组织及岗位、核验时间、刷新依次展示。无岗位不在姓名下重复提示，岗位行保留。失败和加载不显示成功徽标。

复用现有 identityCard 语料：verifyTitle、verified、organization、position、checkedAt、refreshVerification、retry、loading、verificationUnavailable、failure、noPosition。无新增语料，不改接口、权限和本人身份卡；实施 Agent 只调整两端视图及局部样式。实体手机与 Pad 未完成现场验证。
