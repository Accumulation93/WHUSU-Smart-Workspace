# 签署工作区改版语料

前端逻辑设计由 signing_shell_design 负责，独立写作与复核由 signing_shell_language 负责，工程接入由主 Agent 负责。

| 位置和触发 | 已审语料键 | 表达的实际结果 |
| --- | --- | --- |
| 文件工作区模式 | move、pen | 定位和手写是操作模式 |
| 工具栏和画笔面板 | fit、tools、closeTools、hex、colorInvalid | 整页显示复位相机。关闭只收起面板。颜色代码错误说明带井号的可用写法 |
| 图层入口、标题与空列表 | layers、closeLayers、pageLayerCount、layersEmpty | 入口不拼数字。数量指当前页，空状态不显示裸数字 |
| 图层顺序与位置 | strokeLayerName、removeLayer、layerAdjustments、positionEmpty | 保留图层名称，明确动作只针对选中项，定位适用于签名及印章 |
| 页码 | previousPage、nextPage、pagePosition | 两侧箭头具有可访问名称。第一个占位符是当前页，第二个是总页数 |
| 文件清空、空白签名板清空 | clear、clearTitle、clearBody、clearPadTitle、clearPadBody | 文件清空当前附件本步骤的所有手写页，保留其他材料 |
| 文件暂存、空白板确认 | saveDraftAndReturn、confirm、draftConfirmHelpAction、draftConfirmHelpTitle、draftConfirmHelp | 文件工作区返回申请详情后，仍需在详情提交。单独签名板保持确认并返回及可选入库 |
| 确认处理中 | savingDraft、preparingSignature、processing | 对应暂存文件签章、生成空白板签名和正在处理 |
| 面板下方的临时预览读取失败 | panelPreviewUnavailable | 面板仍可用，关闭即可回到实时画面 |

运行语料见 `shared/locales/zh-CN/auditSigning.js`。本页关闭按钮复用 `common.actions.close`。应用界面复核覆盖紧凑手机界面、关闭图标、空图层和暂存说明。
