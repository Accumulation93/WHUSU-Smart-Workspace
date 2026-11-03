# 人事资料值校验：结构化原因前端定稿

独立语言 Agent `/root/language_editor`。适用于模板切换和跨组织补充资料迁移的阻断明细，不是导入文件协议。服务端只返回reasonCode、reasonParams及授权范围内的成员、字段和原值事实。前端使用本表生成原因；不使用服务端reason/message，不根据中文反猜代码。

## 明细结构

每项必须显示“成员姓名 → 来源资料项 → 目标资料项 → 原内容 → 格式要求”。一个人有多个问题时按字段分别列出；同名成员不得仅凭名字合并。未授权学号不补入定位。未知原因保留成员/字段定位，显示统一无法转换原因，不能丢整条明细。

## hrValueValidation建议语料

| 结果码／语料键 | 完整定稿 | 实际判定与参数 |
|---|---|---|
| number_invalid | 内容无法识别为数字，请检查后修改。 | coerceMappedValue数字转换失败，不误称逗号或货币符号必不支持 |
| option_missing | 内容不在这个资料项的可选项中，请选择已有选项。 | 必须能在相邻位置看到目标允许选项，不能让用户猜 |
| date_invalid | 日期无法识别，请按“2026-11-03”这样的年月日格式填写。 | 示例，不改用户事实 |
| datetime_invalid | 日期时间无法识别，请按“2026-11-03 14:30:00”这样的格式填写。 | 日期和时刻完整 |
| phone_invalid | 请填写有效的中国大陆 11 位手机号码。 | 已核实1[3-9]后9位，不承诺国际号码支持 |
| email_invalid | 邮箱格式不正确，请按“name@example.com”这样的格式填写。 | 仅格式检查，不声称邮箱真实存在 |
| type_unsupported | 目标资料项的类型暂不支持转换，请选择其他处理方式。 | 不假称内容有错 |
| text_too_short(min) | 内容太短，请补充后再试（最低长度：{min}）。 | 现实现JS.length，不擅称汉字数；数值来自校验约束 |
| text_too_long(max) | 内容太长，请缩短后再试（最大长度：{max}）。 | 同上，不改实际计数规则 |
| integer_required | 请填写整数，不要带小数。 | 整数约束 |
| digits_too_short(min) | 数字位数不足，至少需要 {min} 位。 | 位数约束，保持服务端当前数位定义 |
| digits_too_long(max) | 数字位数过多，最多允许 {max} 位。 | 位数约束 |
| number_too_small(min) | 数值过小，不能小于 {min}。 | 下限 |
| number_too_large(max) | 数值过大，不能大于 {max}。 | 上限 |
| unknown | 这项资料暂时无法转换，请核对原内容和目标资料项。 | 未知码或参数缺失；不暴露内部码 |
| member | 成员 | 明细标签 |
| sourceField | 来源资料项 | 明细标签 |
| targetField | 目标资料项 | 明细标签 |
| originalValue | 原内容 | 明细标签 |
| requirement | 格式要求 | 明细标签 |
| allowedOptions | 可选项 | option_missing须邻近展示 |

min/max只接受校验后的有限数值，不把任意服务端字符串插入提示。参数缺失不显示undefined、NaN或空括号，降到unknown并保留定位。成员姓名、字段名称和原内容作为纯文本呈现，不作HTML。该批准不改变转换算法，也不将不兼容内容自动清空。
