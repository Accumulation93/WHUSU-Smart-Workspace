# 两端文件输入与输出

业务统一调用 `inputFile` 与 `outputFile`，小程序入口为 `miniprogram/utils/fileIO.js`，网页入口为 `web/src/runtime/fileIO.js`。网页文件控件统一使用 `FileInput.vue`，模式选择复用 `GlassDialog`；小程序使用原生操作菜单。

输入包含微信聊天、相册、拍照、浏览本地文件，按业务文件类型提供。小程序目前没有已核实可用的任意本地文件浏览 API，该项明确提示不支持，不以聊天选择替代。输出包含预览、转发微信/系统分享、保存本地；微信直接磁盘保存仅 PC 支持，手机图片可保存到系统相册，文档不支持时明确提示。浏览器另存为不可用时执行下载，但只报告已发起，不报告已保存。用户取消或失败后不自动换模式，不跳转其他端。

文件上传及下载授权仍由原业务接口处理，两个统一入口不替代组织、角色及资源权限。相册保留原图，输出保留原字节，不转成预览图。返回状态区分 success、cancelled、unsupported、failed，网页另有 selection_started 与 download_started，不能当成已选取或已保存。

## 签署工作区隔离

签署页、signaturePad、AuditSigningWorkspace、auditSigningAssets 与 signingDrafts 完全独立，不依赖文件输入输出接口。文件成图、画布、连续笔迹、图层、印章图片、草稿历史、透明层导出及 PDF 合成不迁入统一接口。只有附件选入和已有文件向用户预览、保存、分享使用统一入口。

## 接入与验证

审核附件创建和编辑、验签文件、印章图片、表格导入、全部依赖 tableFile/tableFiles 的业务导出、审核文件下载、证书导出接入。文件解析仍由 tableFile/tableFiles 负责；服务端不增加第二套接口。

针对性验证包括 `server/test/fileIO.test.js`、文件输入输出浏览器用例、签署独立回归及真实微信主包/分包编译。实体 Android、iOS、鸿蒙、手机与 Pad 的选择、分享和保存能力尚待现场验证，模拟器不替代真机。
