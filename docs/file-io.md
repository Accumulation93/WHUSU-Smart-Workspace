# 两端文件输入与输出

业务统一调用 `inputFile` 与 `outputFile`，小程序入口为 `miniprogram/utils/fileIO.js`，网页入口为 `web/src/runtime/fileIO.js`。网页文件控件统一使用 `FileInput.vue`，模式选择复用 `GlassDialog`；小程序使用原生操作菜单。

输入按业务类型提供微信文件选择、相册、拍照；网页提供本地文件选择。微信官方目前没有通用手机本地文档浏览接口，小程序不再展示必然失败的“浏览本地文件”，也不把聊天选择冒充系统文件管理。PDF、DOC、DOCX、XLS、XLSX、PPT、PPTX 继续通过微信原生文件选择器加载，保留原文件名和原字节，校验业务允许的扩展名。

输出包含预览、转发微信/系统分享、保存本地。小程序依据 API 是否存在、canIUse 和实际调用结果判断直接保存能力，不读取平台名称决定支持与否。明确不支持直接保存时，图片保存到相册；上述 7 类文档由用户确认后打开原生文档菜单，showMenu=true，并传入实际 fileType。菜单具体提供的保存、其他应用打开等动作由微信决定，打开菜单只返回 preview_opened，不触发“已保存”成功回调。取消、权限拒绝、磁盘错误不切换动作。浏览器另存为不可用时执行下载，但只报告已发起，不报告已保存。不跳转其他端。

文件上传及下载授权仍由原业务接口处理，两个统一入口不替代组织、角色及资源权限。相册保留原图，输出保留原字节，不转成预览图。返回状态区分 success、cancelled、unsupported、failed，小程序另有 preview_opened，网页另有 selection_started 与 download_started，不能当成已选取或已保存。

能力依据：[微信官方 API 类型定义](https://github.com/wechat-miniprogram/api-typings/blob/master/types/wx/lib.wx.api.d.ts) 的 chooseMessageFile、saveFileToDisk、openDocument。官方仍将 saveFileToDisk 标为 PC 支持；运行时探测不代表手机已实测支持，也不能凭函数存在承诺系统保存。原生菜单的具体项目无法由小程序枚举或保证。

## 签署工作区隔离

签署页、signaturePad、AuditSigningWorkspace、auditSigningAssets 与 signingDrafts 完全独立，不依赖文件输入输出接口。文件成图、画布、连续笔迹、图层、印章图片、草稿历史、透明层导出及 PDF 合成不迁入统一接口。只有附件选入和已有文件向用户预览、保存、分享使用统一入口。

## 接入与验证

审核附件创建和编辑、验签文件、印章图片、表格导入、全部依赖 tableFile/tableFiles 的业务导出、审核文件下载、证书导出接入。文件解析仍由 tableFile/tableFiles 负责；服务端不增加第二套接口。

针对性验证包括 `server/test/fileIO.test.js`、文件输入输出浏览器用例、签署独立回归及真实微信主包/分包编译。实体 Android、iOS、鸿蒙、手机与 Pad 的选择、分享和保存能力尚待现场验证，模拟器不替代真机。
