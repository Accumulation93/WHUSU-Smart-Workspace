# 考核结果与评分结果用语核对

场景由 `/root/assessment_copy_design` 核实，定稿由 `/root/assessment_copy_language` 放行，`/root/assessment_copy_implementation` 接入。用户把给别人打分的结果称为“评分结果”，把被评价方得到的汇总结果称为“考核结果”。

| 位置 | 共享语料键 | 已接入定稿与情境 |
|---|---|---|
| 普通端公示 | `home.text.results`、`scoringResults`、`noPublication`、`noVisibleResults` | 考核结果公示、考核结果、暂无考核结果公示、暂无可查看的考核结果 |
| 普通端公示分组 | `home.text.publicationGroup*` | 本人、同部门、同职能组、本组织、可查看范围各自称考核结果。两个身份类别动态键保留 `name` 参数 |
| 管理端数据入口 | `admin.scoringResultsTab`、`scoringCompletionTab`、`copy_1a5cfb71ab`、`copy_9d954432df` | 考核结果、评分进度、考核结果、评分任务完成情况。只有评分完成情况权限时使用进度页签，页面标题随所选视图变化 |
| 管理端统计与导出 | `admin.copy_4adc175789`、`copy_03f903662b` | 收到有效评分的成员、导出考核结果。已有至少一条计入的评分与已生成最终考核结果分开 |
| 公示设置与发布 | `admin.copy_10eaadc5f1`、`copy_17903d1b98`、`copy_2e6a7d24f3`、`copy_e5c0e22c49`、`copy_414b7d9da7` | 设置考核结果可见范围、发布考核结果和考核结果公示入口 |
| 管理端评分顶栏公示页签 | `admin.scoringPublicationTab` | 结果公示。适配手机窄屏同时显示五个页签，完整标题继续使用考核结果相关术语 |
| 公示范围 | `admin.copy_9a4a6e8793`、`publicationBehavior.copy_9a4a6e8793`、`adminUtils.copy_1580e09c5c`、`copy_3787c80077`、`copy_8e7c345003`、`copy_9a4a6e8793`、`copy_c70c40dae1`、`copy_fd80cc149b` | 查看本人或者指定范围成员的考核结果。保持原有范围条件 |
| 评分规则开关 | `admin.copy_4cf8cbfee4` | 评分人完成规定的全部评分后，所给分数才计入被评分人的考核结果。 |
| 共用状态提示 | `admin.copy_be942e85d1`、`resultBehavior.copy_bd06e9a531`、`copy_c59ab1ce4a` | 正在加载数据、数据未能加载，请重试。共用于总分、评分记录和完成情况，保持中性 |
| 权限资源 | `authorization.resources.scoring.results`、`scoring.publications`、`scoring.publishedResults`、`legacyPermissions` 对应描述、`adminPersonnel.dictionaryUsageCategories.publication_rules` | 区分考核汇总、评分明细和完成情况。仅修改描述名称与说明 |
| 公示通知 | `scoringPublication.notificationTitle`、`notificationDescription`、`messageFacts.notificationTitles.score_results_published`、`scoringPublished` | 考核结果已公示、模板「{0}」的考核结果已公示。`{0}` 是考核活动名。消息卡有活动名时在正文表示发生的事，无活动名时只显示通知标题 |
| 旧端兼容反馈 | `scoringPublication.notificationTitle`、`notPublished`、`noViewPermission`、`ownScope` | 考核结果已公示、考核结果尚未公示、无权查看考核结果、仅查看本人考核结果。保留原状态码和条件 |

提交评分结果、给他人打分的历史明细、评分任务完成情况与统计口径保留。网页、小程序和服务端窄通知副本由共享生成器生成。

## 评优名单编辑

前端逻辑设计核对了已保存人数和规则名额各自的数据来源，并确认两个端都应保留已保存的超额成员。语言 Agent 放行 `scoringPublication.awardSelection`，实施 Agent 接入两端和共享人员选择器。固定名额与上限复用 `home.format.exactQuota`、`home.format.maximumQuota`，已选数量保留人员选择器原有统计，提交成功复用 `home.text.saved`。

| 情境 | 语料键 |
|---|---|
| 已保存名册与规则名额分开显示 | `savedCount`、`savedOverCount`、现有固定名额及人数上限 |
| 正在选择，尚缺或超过名额 | `selectMore`、`selectFewer` |
| 服务端确认人数不符、人员重复或已超出当前评优范围 | `saveTooFew`、`saveTooMany`、`saveOverMaximum`、`saveAlreadyAssigned`、`saveCandidateChanged` |
| 规则变化、公示关闭、当前岗位权限变化和已确认失败 | `saveRulesChanged`、`savePublicationClosed`、`saveNoPermission`、`saveFailed` |
| 保存响应未知，或成功后重新读取失败 | `saveResultUnknown`、`savedListDiffers`、`savedNotRefreshed` |

名额报错只采用状态码和结构化人数。未知状态先读回评优名单，选择器保持原草稿。已知保存成功时只重新读取评优名单，保留考核结果的分页与加载进度。
