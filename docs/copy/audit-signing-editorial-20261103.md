# 签署与验签：独立语言审稿

作者 `/root/language_editor`，仅写文档。依据 audit-venue-calendar-context-20261103.md。下表审阅 auditSigning.js、auditVerification.js、signingEvidence.js；其他审核页面generated语料尚不在本表范围。

## 结构要求

签署工作区“确认并返回”只保存步骤草稿，不等于审批提交。个人签名库保存必须有独立结果，不能把保存失败写成图片生成失败。清空说明只涉及当前附件本步骤自由书写，不能误说清空文件。普通验签界面呈现文件、步骤、经办人和签署岗位；密码与证书专业信息留报告。未核实平台来源时不得显示可信平台经办人身份，也不能引导用户信任外部证书。文字精简不得删除这些事实边界。

## auditSigning.js 全部条目

| 键 | 状态／定稿 | 使用情境 |
|---|---|---|
| either | 保留：签名或盖章 | 至少一种 |
| eitherRequired | 保留：请至少添加签名或印章 | 两者都无时 |
| signedOrStamped | 保留：已签名或盖章 | 任一种完成 |
| originalRequired | 保留：无法读取签署前原件，请编辑申请并重新上传附件后提交。 | 不能擦除成品猜原件 |
| title | 保留：签署文件 | 文件工作区 |
| padTitle | 保留：手写签名 | 空白签名板 |
| browse | 保留：浏览 | 操作文件视图 |
| move | 保留：移动 | 操作选中签章 |
| pen | 保留：画笔 | 直接书写 |
| tools | 保留：画笔设置 | 颜色笔宽 |
| closeTools | 保留：收起设置 | 收起工具 |
| adjustLayers | 保留：图层与调整 | 顺序及几何 |
| erase | 保留：橡皮擦 | 局部自由笔迹擦除 |
| undo | 保留：撤销 | 步骤附件历史 |
| redo | 保留：重做 | 恢复撤销 |
| clear | 保留：清空书写 | 不删文件正文 |
| black | 保留：黑色 | 颜色选项 |
| blue | 保留：蓝色 | 颜色选项 |
| red | 保留：红色 | 颜色选项 |
| custom | 保留：自定义颜色 | RGB与十六进制 |
| color | 保留：笔迹颜色 | 当前或选中笔迹 |
| hex | 改为：十六进制颜色值 | 明确输入类型 |
| redChannel | 保留：红 | RGB通道 |
| greenChannel | 保留：绿 | RGB通道 |
| blueChannel | 保留：蓝 | RGB通道 |
| thin | 保留：细 | 笔宽档位 |
| medium | 保留：中 | 笔宽档位 |
| thick | 保留：粗 | 笔宽档位 |
| width | 保留：笔宽 | 工具属性 |
| eraserWidth | 保留：橡皮擦大小 | 擦除范围 |
| fit | 保留：适合页面 | 视图复位 |
| zoomIn | 保留：放大 | 文件视图 |
| zoomOut | 保留：缩小 | 文件视图 |
| page | 保留：页码 | PDF页号 |
| objects | 保留：签名与印章 | 可移动材料 |
| signature | 保留：签名 | 材料类型 |
| stamp | 保留：印章 | 材料类型 |
| addInk | 保留：直接书写 | 文件上绘制 |
| confirm | 保留：确认并返回 | 只保存步骤草稿 |
| cancel | 保留：取消 | 恢复进入前草稿 |
| retry | 保留：重新加载 | 文件读取失败 |
| loading | 保留：正在加载文件 | 文件准备 |
| failed | 保留：文件加载失败，请重试 | 读取失败 |
| stale | 改为：当前审批步骤已变化，请返回申请详情查看。 | 不模糊“该步骤” |
| empty | 保留：请先写下内容 | 空签名板 |
| clearTitle | 保留：清空本步骤书写 | 清空确认 |
| clearBody | 改为：清空当前附件在本步骤添加的书写？文件正文、历史签章和印章图层会保留。 | 区分历史签章与本步骤自由笔迹 |
| unavailable | 保留：当前文件暂不支持直接签署 | 不假称加载失败 |
| exportFailed | 保留：书写图片生成失败，请重试 | 仅图片生成阶段 |
| tooLarge | 改为：书写图片超过 2 MiB，请减少书写内容后重试。 | 与实际2MiB限制一致 |
| stampLoading | 保留：正在加载可用印章 | 目录读取 |
| stampEmpty | 保留：暂无可用印章 | 仅成功为空 |
| stampFailed | 保留：印章加载失败，请重试 | 目录失败 |
| imageLoading | 保留：正在加载印章图片 | 图片读取 |
| imageFailed | 保留：印章图片加载失败，请重试 | 图片失败 |
| processing | 保留：处理中 | 当前步骤 |
| future | 保留：未到达 | 后续步骤 |
| stopped | 保留：已终止 | 停止流程 |
| withdrawn | 保留：已撤回 | 撤回结果 |
| roundTitle | 保留：第 {0} 轮 | 轮次标题 |
| roundStates.approved | 保留：已通过 | 轮次状态 |
| roundStates.rejected | 保留：已驳回 | 轮次状态 |
| roundStates.withdrawn | 保留：已撤回 | 轮次状态 |
| roundStates.in_progress | 保留：处理中 | 轮次状态 |
| roundStates.pending | 保留：待提交 | 轮次状态 |
| roundStates.draft | 保留：草稿 | 轮次状态 |
| roundStates.stopped | 保留：已终止 | 轮次状态 |
| layers | 保留：图层 | 顺序管理 |
| stroke | 保留：笔迹 | 自由书写层 |
| layerUp | 保留：上移一层 | 调整堆叠顺序 |
| layerDown | 保留：下移一层 | 调整堆叠顺序 |
| history | 保留：撤回前记录 | 仅真实撤回历史；按轮次界面不应拿它替代轮次标题 |
| showHistory | 保留：查看撤回前记录 | 兼容历史入口 |
| hideHistory | 保留：收起历史记录 | 折叠 |
| actorUnknown | 保留：历史处理人未记录 | 不猜姓名 |
| assignmentUnknown | 保留：历史岗位信息缺失 | 不用当前岗位补历史 |
| details | 保留：详细检查 | 报告分区 |
| digest | 保留：技术信息 | 报告分区 |
| certificates | 保留：证书信息 | 报告分区 |
| summary | 保留：验证结果 | 结果摘要 |
| back | 保留：返回 | 返回上页 |
| size | 保留：大小 | 选中材料尺寸 |
| rotation | 保留：旋转 | 选中材料角度 |
| pendingRead | 保留：操作已完成，请重新加载结果 | 仅明确审批成功后重读失败，不用于超时未知 |
| colorInvalid | 改为：请输入 6 位十六进制颜色值，例如 000000。 | 明确格式 |
| signAgain | 保留：继续书写 | 返回书写 |
| remove | 保留：移除 | 当前步骤材料移除 |
| draftLost | 保留：书写草稿已失效，请重新打开签署页面 | 会话草稿失效 |
| saveTemplate | 改为：保存到签名库 | 不能误作审批保存 |
| rewrite | 保留：重新书写 | 空白板重写 |
| signatureLoading | 保留：正在加载个人签名 | 签名模板目录 |
| newSignature | 保留：新建签名 | 新空白板 |
| saveToLibrary | 保留：同时保存到签名库 | 可选附加动作 |
| recolor | 保留：修改所选签名颜色 | 不影响印章或其他签名 |
| signatureFailed | 保留：个人签名加载失败，请重试 | 签名读取失败 |
| signatureEmpty | 保留：暂无个人签名 | 仅成功为空 |
| sourceFailure | 保留：文件来源核实失败 | 不确认平台来源 |
| externalFailure | 改为：第三方证书信任检查未通过 | 已核实只在externalTrust.status为failed显示；未知或未核验不可复用 |
| more | 保留：加载更多 | 分页 |
| signatureSaveFailed（新增） | 个人签名未能保存到签名库，请重试。 | 必须是服务端明确失败；超时未知用公共结果未知提示 |
| draftConfirmHelp（新增） | 确认后返回审批页，当前书写和图层保留在本步骤；审批仍需在返回后提交。 | 仅存在submissionId的审批步骤工作区；独立签名库空白板不显示 |
| draftConfirmHelpTitle（新增） | 确认返回说明 | 共享帮助框标题 |
| draftConfirmHelpAction（新增） | 查看确认返回说明 | 工具栏信息图标的可访问名称 |

批准签署工具栏靠近确认按钮放独立信息图标，点击打开共享compact帮助框显示draftConfirmHelp；不常驻挤占画布，不新增审批确认步骤，不把说明藏在仅图层用户可见的位置。独立签名库空白板无审批步骤，省略此帮助。

## auditVerification.js 全部条目

| 键 | 状态／定稿 | 情境 |
|---|---|---|
| text.matchSectionTitle | 保留：相关审核记录 | 匹配业务记录 |
| text.currentResult | 保留：当前结果 | 当前检查 |
| text.viewResult | 保留：查看验证结果 | 打开结果 |
| text.matchingFiles | 保留：匹配文件 | 命中文件 |
| text.untitledSubmission | 保留：未命名审核 | 缺申请名 |
| text.unknownStatus | 保留：状态未知 | 状态缺失 |
| text.status.draft | 保留：草稿 | 业务状态 |
| text.status.pending | 保留：待提交 | 业务状态 |
| text.status.in_progress | 保留：审核中 | 业务状态 |
| text.status.approved | 保留：已通过 | 业务状态 |
| text.status.rejected | 保留：已驳回 | 业务状态 |
| text.status.withdrawn | 保留：已撤回 | 业务状态 |
| format.matchCount(count) | 保留：共找到 {count} 条相关审核记录 | 数值归一后计数 |

## signingEvidence.js：用户摘要与报告说明

| 键 | 状态／定稿 | 情境与理由 |
|---|---|---|
| title | 保留：签署验证结果 | 普通结果标题 |
| technical | 保留：查看验证报告 | 专业报告入口 |
| reportTitle | 保留：验证报告 | 报告名 |
| appName | 保留：审核 | 子应用 |
| reportNavigationTitle | 保留：验证报告 - WHUSU智慧工作台 | 导航 |
| reportIntro | 保留：本报告分别说明文件是否完整、签名是否有效，以及每一步的经办人能否核实。同一报告中，相同的签署人编号表示同一个人；同名人员不会因此合并。 | 不以姓名合并、不混密码与身份 |
| reportExpired | 保留：请返回验签页，重新打开本次验证报告。 | 临时报告失效 |
| reportOpenFailed | 改为：验证报告未能打开，请返回后重试。 | 具体下一步 |
| identityConfirmed | 保留：签署人及签署岗位已核实 | 必须身份与岗位都核实 |
| identityUnknown | 保留：暂时无法核实签署人 | 不猜可信身份 |
| organizationLabel | 保留：签署时组织 | 关联具体签署时间 |
| assignmentLabel | 保留：签署时岗位 | 不补当前岗位 |
| timeLabel | 保留：处理时间 | 平台记录时间 |
| fileChecks.documentIntegrity | 保留：文件内容 | 普通检查标签 |
| fileChecks.cmsSignature | 保留：文件签名 | 普通检查标签 |
| fileChecks.receiptChain | 保留：处理记录 | 普通检查标签 |
| fileChecks.identityBinding | 保留：签署人身份 | 普通检查标签 |
| fileOnlyValid | 保留：文件签名有效 | 仅密码结果，不代表经办人核实 |
| unsignedFile | 保留：文件未签名 | 无可验证签名 |
| fileOnlyNotice | 保留：已检查上传文件。当前组织没有匹配的申请记录，无法核实平台中的经办人及岗位；这不等于文件签名无效。 | 业务关联与密码分离 |
| signerLabel(index) | 保留：签署人 {index} | 报告局部编号，不泄露全局ID |
| certificateTitle | 保留：在其他软件中验证 | 外部验证说明 |
| exportCertificate | 保留：导出公开证书 | 不导出私钥 |
| certificateScopeTitle | 改为：证书的验证范围 | 不含糊问题标题 |
| certificateNotice | 保留：第三方 PDF 软件用它核实平台签名和文件完整性，不核实每一步的具体经办人。经办人的身份、组织和岗位由本平台核验。证书不包含私钥或学号；同一证书可以签署不同文件，各文件的签名值独立生成。 | 必须已确认平台来源才展示 |
| certificateUseTitle | 保留：如何在其他软件中使用 | 操作帮助 |
| certificateGuide | 保留：导出证书，在 PDF 软件中导入，并与平台独立公布的证书指纹核对后再决定是否信任。只授予签名验证所需的信任，不启用脚本或动态内容。无法保存或分享时，可使用“复制证书文本”。 | 不能自动授予信任 |
| adobeTrustTitle | 保留：Adobe 提示签名有问题时 | 特定阅读器情境 |
| adobeTrustNotice | 保留：先展开签名详情。如果显示“文档未被修改”，但签名者身份未知，通常是证书尚未受信任。如果显示内容被修改或签名无效，则需要重新核查文件，不能仅靠设置信任解决。 | 不把篡改误当信任问题 |
| certificatePublicTrustTitle | 改为：第三方软件的信任范围 | 明确信任对象 |
| certificatePublicTrust | 保留：导入证书只改变当前阅读器的信任设置。要让收件人无需手动设置，平台需要使用其阅读器认可机构签发的文档签名证书；网站 HTTPS 证书不能替代。 | 技术边界不能删 |
| noCertificate | 保留：本次检查未取得可导出的平台证书。 | 不提供外来证书作为平台证书 |
| exportUnavailable | 改为：当前设备不支持导出证书文件。可使用“复制证书文本”，再到电脑保存。 | 不归因整个微信产品 |
| exportFailed | 改为：证书文件未能保存或分享，请重试，也可使用“复制证书文本”。 | 不承诺换手机必能修复 |
| exportWriteFailed | 改为：证书文件未能准备完成，请重试，也可使用“复制证书文本”。 | 未明确磁盘错误不猜存储原因 |
| exporting | 改为：正在导出证书 | 明确对象 |
| copyCertificate | 保留：复制证书文本 | 复制方式 |
| certificateCopied | 保留：证书文本已复制 | 仅剪贴板成功 |
| certificateTextGuide | 保留：将完整内容粘贴到电脑上的纯文本文件，保存为 WHUSU.cer（不要附加 .txt）。保留 BEGIN CERTIFICATE 和 END CERTIFICATE 两行，即可作为证书导入 PDF 软件。 | PEM边界不可改写 |
| certificateCopyFailed | 保留：证书内容复制失败，请重试 | 剪贴板失败 |
| hostedNotice | 保留：签署方式：平台为已登录账号的审批操作生成签名，个人不持有独立签署私钥。 | 不伪称个人独立数字证书 |
| platformUnconfirmed | 保留：尚未确认此文件由本平台签署。文件签名通过检查，也不代表平台已核实经办人身份。 | 来源不明不能冒充可信 |
| unconfirmedReportNotice | 保留：证书上的平台名称或姓名可以自行填写，不能作为来源证明。本次未确认平台签署身份，不提供该文件内的证书供你当作平台证书信任。 | 防证书名称冒用 |
| timeNotice | 保留：处理时间由平台记录，未使用第三方时间戳服务进行独立认证。 | 不伪称可信时间 |
| noSteps | 保留：暂时没有可核实的签署人记录。 | 不猜身份 |
| file | 保留：上传文件 | 本次文件 |
| noFiles | 保留：仅查询记录，未验证上传文件。 | 查询不等于用户文件验签 |
| fileTooLarge | 改为：文件超过大小限制 | 应配结构化限值，未提供不编造 |
| unknownReason | 保留：本项检查尚未得到明确结果。请重新验证；如果仍无法确认，请联系平台维护人员。 | 未知原因后备 |
| reason | 保留：检查说明 | 详细原因 |
| fileDigest | 保留：完整文件摘要（SHA-256） | 技术报告 |
| reference | 保留：本步凭证编号 | 技术报告 |
| keyVersion | 保留：签署密钥版本 | 技术报告 |
| certificateFingerprint | 保留：证书指纹（SHA-256） | 技术报告 |
| algorithm | 保留：签名算法 | 技术报告 |
| identityAlgorithm | 保留：身份绑定算法 | 技术报告 |
| snapshotAlgorithm | 保留：身份保护算法 | 技术报告 |
| inputDigest | 保留：处理前文件摘要 | 技术报告 |
| outputDigest | 保留：本步输出摘要 | 技术报告 |
| previousDigest | 保留：上一步凭证摘要 | 技术报告 |
| receiptDigest | 保留：本步凭证摘要 | 技术报告 |
| byteRange | 保留：签名覆盖范围（字节起点 / 长度） | 技术报告，不改协议语义 |
| signedBytesDigest | 保留：签名覆盖内容的摘要（SHA-256） | 技术报告 |
| wholeDocument | 保留：签名是否覆盖整份文件 | 范围检查 |
| yes | 保留：是 | 技术布尔结果 |
| no | 保留：否 | 技术布尔结果 |
| stepTitle(round,step,action) | 保留：第 {round} 轮 · 第 {step} 步 · {action} | 动作来自批准枚举 |

## signingEvidence.js 嵌套状态逐项

以下每项均批准原值。它们区分失败、未知和历史信息不足，不因更短而合并。

| 键 | 定稿 |
|---|---|
| simpleResults.documentIntegrity.passed | 内容核对一致 |
| simpleResults.documentIntegrity.failed | 内容未通过核对 |
| simpleResults.documentIntegrity.indeterminate | 暂时无法核实内容 |
| simpleResults.documentIntegrity.legacy_partial | 历史文件信息不完整 |
| simpleResults.cmsSignature.passed | 签名核对一致 |
| simpleResults.cmsSignature.failed | 签名未通过核对 |
| simpleResults.cmsSignature.indeterminate | 未取得有效的签名检查结果 |
| simpleResults.cmsSignature.legacy_partial | 部分历史签名无法核实 |
| simpleResults.receiptChain.passed | 各步记录核对一致 |
| simpleResults.receiptChain.failed | 处理记录未通过核对 |
| simpleResults.receiptChain.indeterminate | 暂时无法核实处理记录 |
| simpleResults.receiptChain.legacy_partial | 部分历史步骤无法核实 |
| simpleResults.identityBinding.passed | 经办人与签署岗位已核实 |
| simpleResults.identityBinding.failed | 签署身份未通过核对 |
| simpleResults.identityBinding.indeterminate | 暂时无法核实签署身份 |
| simpleResults.identityBinding.legacy_partial | 历史签署身份信息不足 |
| statuses.passed | 验证通过 |
| statuses.failed | 验证未通过 |
| statuses.indeterminate | 暂时无法确认 |
| statuses.legacy_partial | 部分历史记录无法核实 |
| sources.uploaded_file | 本次检查的是你上传的文件 |
| sources.stored_file | 本次检查的是平台保存的文件 |
| sources.record_lookup | 本次仅查询记录，尚未检查你持有的文件 |
| checks.documentIntegrity | 文件完整性 |
| checks.cmsSignature | 数字签名校验 |
| checks.receiptChain | 审批记录连续性 |
| checks.identityBinding | 经办人身份核验 |
| checks.platformCertificate | 平台证书核对 |
| checks.externalTrust | 第三方证书信任 |
| actions.approve | 通过 |
| actions.pass | 通过 |
| actions.sign | 签名 |
| actions.stamp | 盖章 |
| actions.estamp | 盖章 |
| actions.both | 签名并盖章 |
| actions.reject | 驳回 |
| digestTypes.file_sha256 | 输出摘要范围：完整文件（SHA-256） |
| digestTypes.pdf_byte_range_sha256 | 输出摘要范围：PDF 签名覆盖的内容，不含签名值本身（SHA-256） |

## 检查原因逐项

以下为 signingEvidence.reasons，全部批准保留在专业报告，不直接堆到普通结果页。必须用服务端结果码选择，不直出服务端渲染句子。

| 键 | 定稿 |
|---|---|
| cms_signature_valid | 已用签署证书核对签名，签名值与所覆盖的文件内容一致。 |
| receipt_cms_verified | 本步审批凭证的数字签名校验通过。 |
| pdf_whole_document_verified | 签名覆盖整份 PDF，仅排除签名值本身；未发现签后追加内容。 |
| stored_file_digest_verified | 文件内容与平台保存的校验记录一致。 |
| evidence_identity_verified | 凭证中的人员、组织和岗位与签署时的身份记录及实际审批操作一致。 |
| evidence_chain_verified | 各步骤顺序连续，前后文件和凭证之间的关联均核对一致。 |
| platform_certificate_registered | 文件所用证书与平台登记的签署证书一致。此项不代表第三方软件自动信任。 |
| external_trust_not_evaluated | 本平台未核验外部证书信任链。第三方 PDF 软件是否信任，应以其验证结果和信任设置为准。 |
| legacy_evidence_insufficient | 历史记录未保存完整的逐步签署凭证，无法按当前标准核实全部步骤。 |
| legacy_identity_not_attested | 签署记录不完整，无法核实经办人及签署岗位。 |
| legacy_certificate_not_registered | 未找到这张历史证书对应的平台登记记录。 |
| evidence_legacy_prefix | 部分早期步骤缺少签署凭证，无法确认完整流程。 |
| pdf_unsigned | 文件没有可验证的 PDF 数字签名。 |
| not_pdf | 此文件不是 PDF。 |
| cms_digest_mismatch | 当前内容与签名记录不一致，文件可能已被修改。 |
| cms_signature_invalid | 数字签名未通过校验，不能确认签名有效。 |
| pdf_modified_after_signing | 此签名未覆盖文件末尾的追加内容，不能确认整份文件保持原样。 |
| file_digest_mismatch | 文件与登记摘要不一致。 |
| evidence_document_mismatch | 凭证与实际文件不一致。 |
| evidence_chain_invalid | 步骤顺序或前序凭证不一致。 |
| evidence_chain_incomplete | 步骤凭证缺失或数量不一致。 |
| evidence_identity_mismatch | 身份绑定不一致，无法确认签署人。 |
| evidence_event_mismatch | 凭证与实际审批事件不一致。 |
| evidence_key_unavailable | 缺少核验历史记录所需的密钥，请联系平台维护人员。 |
| evidence_key_configuration_missing | 平台验签配置不完整，请联系平台维护人员。 |
| evidence_key_revoked | 对应密钥版本已撤销。 |
| evidence_ciphertext_invalid | 身份保护数据校验失败。 |
| evidence_record_unavailable | 未取得本文件对应的签署凭证，暂时无法核实处理记录。 |
| evidence_certificate_unregistered | 未找到可用于确认此签名的平台证书登记记录。 |
| verification_timeout | 验证超时，请重试。 |
| verification_busy | 验证繁忙，请稍后重试。 |

静态语料审阅完成，不代表已完成签署、保存、审批、密码验证或现场设备回归。
