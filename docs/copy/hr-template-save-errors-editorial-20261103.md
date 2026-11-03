# 资料模板保存错误独立定稿

使用稳定reasonCode、零基fieldIndex与可选fieldLabel。页面显示项号为fieldIndex+1；后端与页面未重排时才可定位该行。不要从message或姓名反查位置。错误提示留在对应资料项附近，整体摘要可跳到第一处错误；保留已填草稿。

## 模板级

| 键 | 定稿 |
|---|---|
| template_name_required | 请填写资料模板名称。 |
| template_edit_mode_invalid | 请重新选择资料的填写方式。 |
| template_fields_required | 请至少添加一个资料项。 |

## 资料项级

| 键 | 定稿 |
|---|---|
| field_name_required | 请填写资料项名称。 |
| field_type_invalid | 请重新选择资料类型。 |
| field_name_duplicate | 名称与其他资料项重复，请使用不同的名称。 |
| fieldNameDuplicateAt(index) | 名称与第 {index} 个资料项重复，请使用不同的名称。 |
| field_options_required | 请至少填写一个可选项。 |
| field_hint_too_long(limit) | 填写说明过长，请缩短后再试（最大长度：{limit}）。 |
| fieldIssue(index,label,reason) | 第 {index} 个资料项“{label}”：{reason} |
| unnamedFieldIssue(index,reason) | 第 {index} 个资料项：{reason} |
| templateIssueUnknown | 资料模板暂时无法保存，请检查填写内容后再试。 |

duplicateOfIndex也需转为人看的1基编号。field_hint_too_long是填写说明长度限制，不替所有字段捏造200字上限；maxlength按实际参数显示，不称汉字数。

## 长度与数值限制

已核后端这些分支只检查所填值是否为有限数字，不检查非负整数或最小值小于最大值，文案不能谎称检查了其他条件。页面已有大小关系校验继续保留独立提示。

| 键 | 定稿 | reasonCode与bound |
|---|---|---|
| fieldMinLengthInvalid | 最小长度需要填写有效数字，请检查后修改。 | field_length_invalid/min |
| fieldMaxLengthInvalid | 最大长度需要填写有效数字，请检查后修改。 | field_length_invalid/max |
| fieldLengthInvalid | 长度限制需要填写有效数字，请检查后修改。 | field_length_invalid未知bound，不猜最小或最大 |
| fieldMinValueInvalid | 数值下限需要填写有效数字，请检查后修改。 | field_value_invalid/min |
| fieldMaxValueInvalid | 数值上限需要填写有效数字，请检查后修改。 | field_value_invalid/max |
| fieldValueInvalid | 数值限制需要填写有效数字，请检查后修改。 | field_value_invalid未知bound |

这些理由均由fieldIssue/unnamedFieldIssue附上具体第几项和名称，不单独抛在页顶而不定位资料项。填写说明按Unicode码点长度计算，已批准最大长度提示可复用，不改成“200个汉字”。
