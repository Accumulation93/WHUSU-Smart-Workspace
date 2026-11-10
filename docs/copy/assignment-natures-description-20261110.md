# 岗位性质描述与删除提示

## 角色与范围

独立语言 Agent 负责本稿及 `shared/locales/zh-CN/assignmentNatures.js`，前端逻辑由设计 Agent 核对，业务实现由实施 Agent 执行。本稿不修改删除权限、引用检查或旧客户端兼容行为。

## 批准语料（2026年11月11日更新）

用户已取消岗位性质的系统保留项特殊删除限制。本节取代11月10日关于 reserved 的旧批准；是否可以删除只按当前权限与真实引用判断，不再因为原始编号或初始化来源显示特殊限制。

| 场景 | 键 | 文案 |
| --- | --- | --- |
| 描述字段 | description | 描述 |
| 可选描述输入 | descriptionPlaceholder | 说明适用的岗位或人员，可不填 |
| 描述超过2000个Unicode码点 | descriptionTooLong | 描述不能超过2000字。 |
| 已有引用阻止删除 | inUse | 这个岗位性质已用于岗位、规则或历史记录，不能删除。 |

新增、编辑、删除、确认、保存、取消与加载继续复用本文件已有语料。删除确认使用 `removeConfirm(name)` 完整函数，不把函数传入字符串格式器。描述内容属于用户填写事实，不进入语料库。

## 展示约束

描述紧随名称，允许留空；未填写时列表不增加“暂无描述”占位。真实引用阻断使用 inUse，不声称可以通过删除历史记录解除限制。权限不允许删除与业务引用阻断是不同情况，不用同一提示混淆。两端只通过前端语料解释受控原因，不直接显示后端 message。

批准删除 assignmentNatures.reserved、authorization.legacyNatureRequired 及 responseMessages 中 assignment_nature_legacy_required 的旧专用映射。兼容期间遇到旧服务端该错误码，仅使用 deleteFailed，不映射成 inUse，以免虚构实际引用。编辑入口仍独立依据 canUpdate 显示，删除权不表示编辑权。

旧接口缺少或提交失效岗位性质时，可以沿用服务端兼容提示 personnelCopy.assignmentNatureInvalid（“请选择有效的岗位性质”）及结构化错误码 assignment_nature_invalid；该服务端句子不能直接显示在新前端。新前端应按错误码引用其批准的前端语料，不从“未提交”猜测岗位性质。
