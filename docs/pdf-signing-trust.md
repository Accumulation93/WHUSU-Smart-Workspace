# PDF 数字签名信任链配置

当前 PDF 签名的摘要、签名值和文档篡改检测是有效的；之前提示“不可信”的原因是代码为每个文件生成了自签名证书。自签名证书可以证明“签名值与公钥匹配”，但不能让 Acrobat、浏览器或其他 PDF 阅读器自动信任签发者。

## 生产环境要求

要让外部 PDF 阅读器显示“受信任”，必须使用以下任一方案：

1. 由 Adobe Approved Trust List（AATL）或目标阅读器认可的 CA 签发组织级文档签名证书；
2. 使用组织内部 CA 签发证书，并把根证书部署到所有阅读者的受信任根证书库。

不能把项目自己生成的根证书、普通 HTTPS 证书或“父证书”当作公共可信证书。CA 会要求组织身份材料，申请和审核必须由组织授权人员完成。

## 服务端配置

申请到“文档签名”证书后，将私钥、签名证书和中间证书链放入服务端密钥管理系统，再以环境变量或受保护文件路径提供给服务端：

| 配置 | 作用 |
| --- | --- |
| `PDF_SIGNING_PRIVATE_KEY_PEM` / `PDF_SIGNING_PRIVATE_KEY_PATH` | 与签名证书匹配的 RSA 私钥 |
| `PDF_SIGNING_CERTIFICATE_PEM` / `PDF_SIGNING_CERTIFICATE_PATH` | CA 签发的叶子证书 |
| `PDF_SIGNING_CERTIFICATE_CHAIN_PEM` / `PDF_SIGNING_CERTIFICATE_CHAIN_PATH` | 从签发者到根证书前的中间证书链，按 PEM 顺序拼接 |

服务端启动时会校验私钥与叶子证书的公钥是否匹配；不匹配会拒绝签名，不会静默退回自签名证书。证书链会写入 CMS/PKCS#7 签名容器，供 PDF 阅读器构建信任路径。

如果组织使用的是内部 CA，并且确实拥有可用于签发下级证书的父证书私钥，也可以配置 `PDF_SIGNING_PARENT_PRIVATE_KEY_PEM` / `PDF_SIGNING_PARENT_PRIVATE_KEY_PATH`、`PDF_SIGNING_PARENT_CERTIFICATE_PEM` / `PDF_SIGNING_PARENT_CERTIFICATE_PATH` 和可选的 `PDF_SIGNING_PARENT_CHAIN_PEM` / `PDF_SIGNING_PARENT_CHAIN_PATH`。系统会为每个签署人生成姓名证书并由父证书签发；这只有在父证书根已部署到阅读器信任库时才会显示为受信。公共 CA 的文档签名叶证书通常应直接配置上一组组织级证书，不能把公共 CA 的私钥放入系统。

## 迁移与旧文件

`20260809193000_pdf_signature_trust_chain.sql` 增加了证书链和信任状态字段。旧文件仍保留原有自签名证书；重新生成最终 PDF 签名后才会使用新 CA 身份。若需要让历史文件也受信，必须在未改变文档内容的前提下重新走合法签署流程，不能直接替换证书或修改 PDF 字节。

验签接口会分别返回：

- `valid`：签名摘要和签名值是否有效；
- `trustStatus`：`self_signed`、`issuer_not_embedded` 或 `chain_present`；
- `trusted`：是否至少已在 PDF 中携带证书链。最终是否被某台设备信任，仍由其受信任根证书库决定。
