# 综合管理页面语料分段独立审稿

源 `generated/subpackages/scoring/pages/admin/admin.js`，870行，跨多个真实子模块。按源顺序逐项登记，不把同名词按字符串自动改。已完成段落在此记录，剩余键没有表格条目即未批准。结构或事实待核的条目明确退回。

## 首段：导入、评分与管理入口

| 键 | 定稿／处理 | 情境 |
|---|---|---|
| authCodeExportAction | 导出表格 | 凭据导出 |
| authCodeDialogTitleRecovery | 恢复码已生成 | 仅实际已生成 |
| ignoreIncompatibleHint | 只导入检查通过的记录，以下问题记录将跳过。 | 需真实有跳过入口 |
| ignoreIncompatibleImport | 跳过问题记录并导入 | 明确排除后果 |
| importIssueTitle | 无法导入的记录 | 不用抽象不兼容 |
| importIssueHint | 以下记录无法按当前资料模板导入。你可以返回修改表格，或选择跳过这些记录。 | 逐人逐行原因仍必显 |
| importRowPrefix | 第␠ | 行号前缀 |
| importRowSuffix | ␠行 | 行号后缀 |
| gradeBandLabelText.fallbackPrefix | 分数区间␠ | 未命名等第 |
| gradeBandLabelText.rangeOpen | （ | 排版 |
| gradeBandLabelText.rangeSeparator | – | 区间连接 |
| gradeBandLabelText.rangeClose | ） | 排版 |
| rankMedalGold | 保留金牌符号 | 装饰 |
| rankMedalSilver | 保留银牌符号 | 装饰 |
| rankMedalBronze | 保留铜牌符号 | 装饰 |
| selectTime | 请选择时间 | 选择 |
| copy_00c8a8f256 | 全选 | 批量选择 |
| copy_00cb20b85e | 查看与编辑 | 两种真实动作 |
| copy_00ed459adb | 被评分人 | 统一术语 |
| copy_0180a9817b | 已填写 | 内容状态 |
| copy_018d741992 | 编辑身份类别 | 人事字典 |
| copy_01e16cdd90 | 评分活动 | 列表标题 |
| copy_01ed24e9b5 | 新增部门 | 字典 |
| copy_01fb465b6e | 加权 | 计算选项 |
| copy_02151fbb6a | 计算方式 | 计算设置 |
| copy_02419589be | 部门 | 人事属性 |
| copy_02a2beb65d | 已设置 | 配置状态 |
| copy_02a9c01344 | 取消编辑 | 放弃草稿 |
| copy_034ae84999 | 返回修改 | 检查结果返回 |
| copy_034e4a532e | 全选 | 全部候选 |
| copy_03cf7db777 | 请选择“题目内容”所在列，其他列可不选。 | 评分模板表格，不是成员导入 |
| copy_03f903662b | 导出总分汇总 | 不用速览造名 |
| copy_04c07f5c51 | 待审核资料 | 人事 |
| copy_04d8c1a10d | 保存身份类别 | 字典保存 |
| copy_05686d877c | 不限身份类别 | 仅此维度不限 |
| copy_0596fc0dc8 | 暂无电子印章 | 加载成功为空 |
| copy_05970eea73 | 指定人员 | 自然人条件 |
| copy_0601453416 | 选择题目所在列 | 评分模板导入 |
| copy_061e85a1bb | 去除最低分的个数 | 去极值配置 |
| copy_063079dbec | 开启后，必须选满设定的人数。 | 评优等额 |
| copy_069296c265 | 数字填写要求 | 资料类型 |
| copy_06dbb49961 | 取消 | 放弃 |
| copy_0735ccbfbd | 恢复评分活动 | 暂停恢复 |
| copy_07d8551536 | 身份类别说明 | 字典说明 |
| copy_0802c1f456 | 导入检查 | 结果 |
| copy_08b30a529d | 应用到所选身份类别 | 批量规则 |
| copy_0951b4ad83 | 分数 | 数值 |
| copy_09614cef6c | 关闭 | 关闭窗口 |
| copy_096f7b8d26 | 须完成全部评分 | 算分前要求 |
| copy_099072236c | 删除未引用旧语料 | 两端非语言业务源码无引用 |
| copy_0994de674c | 修改后需审核 | 资料模式 |
| copy_09bf239b61 | 评优人选指定权限 | 区分查看与指定 |
| copy_0addb950ff | 展开 | 图标独立 |
| copy_0afb532e6f | 可验证文件的人员 | 文件验签授权 |
| copy_0b0588a53d | 新增身份类别 | 字典 |
| copy_0bc13740e4 | 添加范围条件 | 规则 |
| copy_0bfd822c5b | 拆键：resultViewerDepartments＝可查看结果的部门；meritDesignatorDepartments＝可指定评优人选的部门 | 两种不同权限对象 |
| copy_0c90eb0204 | 驳回 | 审批 |
| copy_0cdd721407 | 新资料项 | 模板字段 |
| copy_0cedad90e4 | 选择身份类别 | 选项 |
| copy_0d4cc3a70e | 授予文件验证权限 | 文件验签授权 |
| copy_0da26e8c6e | 暂无内容 | 已知空值 |
| copy_0dc18b5a1e | 岗位范围条件 | 按岗位属性选择 |
| copy_0dc88c21dc | 处理账号恢复申请 | 认证治理 |
| copy_0dc99cac16 | 待审核 | 待处理状态 |
| copy_0e17af2227 | 评分详情 | 结果 |
| copy_0e17db0f53 | 表格记录 | 导入源 |
| copy_0e1e3fca77 | 添加发起人条件 | 申请资格 |
| copy_0e8673eda8 | 退回计数标题碎片，使用approvalStepsCount(count)：审批步骤（{count}步） | 完整格式 |
| copy_0ee803a476 | 保存组织 | 保存 |
| copy_0fe86822a1 | 未设置部门 | 缺属性 |
| copy_1016162deb | 可选内容 | 序列选项 |
| copy_1037d0aa5f | 成员资料修改方式 | 不泛称成员修改 |
| copy_104a8f33bb | 添加评分题目 | 统一模板／题目 |
| copy_105bbfcae6 | 身份类别： | 标签 |
| copy_10c21cf3bc | 输入新口令 | 账号 |
| copy_10eaadc5f1 | 请先设置哪些人可以查看评分结果。 | 公示前置 |
| copy_1105556893 | 暂无可用资料模板 | 模板库 |
| copy_11ca2ae839 | 这名评分人暂无待完成的评分任务。 | 评分人任务 |
| copy_12367d56b7 | 按身份类别筛选 | 目录筛选 |
| copy_12627736fc | 移除管理身份 | 不删账号 |
| copy_12b44cbb96 | 已完成／应完成 | 数量比例 |
| copy_12cd162fda | 被评分人 | 对象 |
| copy_13fbac1d6c | 编辑管理身份 | 管理授权 |
| copy_1427561539 | 请选择开始日期。 | 日期校验 |
| copy_14671f2231 | 填写身份类别说明 | 输入 |
| copy_14778213ca | 退回通用重试，按具体请求使用公共反馈 | 不猜结果 |
| copy_14be892ef9 | 最低分 | 分值 |
| copy_150a5c7309 | 同身份类别（相对对象待核） | 条件 |
| copy_150ec897d6 | 时区设置 | 系统显示 |
| copy_15e2eaec6c | 未设置开始日期 | 认领开放日期留空，不保证开关已启用 |
| copy_15f9edf8c6 | 认证码 | 账号凭据 |
| copy_165ed9ab37 | 应用新模板后，这个资料项及其已保存的内容将被删除。 | 模板切换markForDelete的真实后果 |
| copy_166a418985 | 人事信息 | 子应用 |
| copy_16a97e9865 | 不导入的表格列 | 忽略范围 |
| copy_16d27aa59e | 删除片段，使用approvalStepsCount | 避免括号孤立 |
| copy_16fc906860 | 编辑审批步骤 | 步骤 |
| copy_177c107dbc | 暂无身份类别 | 成功空目录 |
| copy_17903d1b98 | 评分结果查看权限 | 区分评优指定 |
| copy_17a784c758 | 评优名单汇总 | 汇总 |
| copy_189d8358eb | 保存评分活动 | 动作 |
| copy_190e42d4c5 | 新增岗位 | 成员岗位 |
| copy_19812618bf | 使用一次后失效（需真实一次性凭据分支） | 不套恢复凭据长期状态 |
| copy_1a2083394a | 退回计数碎片，需对应标题完整函数 | 不独立括号 |
| copy_1a5cfb71ab | 评分结果 | 结果 |
| copy_1a978b0d52 | 按部门筛选 | 筛选 |
| copy_1acba00634 | 本会岗位 | 既有岗位性质名称 |
| copy_1af11a9ca5 | 允许发起人指定本步骤的审批岗位 | 指定资格仍服务端复核 |
| copy_1b38edadcc | 保存岗位 | 保存 |
| copy_1bb7eb3e1a | 通过 | 审批动作 |
| copy_1bc1338d71 | 最多可指定规定名额的人选，不要求用满名额。 | requireExactQuota=false，限制最大数但不要求凑足 |
| copy_1bca0c5ed7 | 通过审核 | 人事审核 |
| copy_1cda406196 | 撤销恢复码 | 凭据 |
| copy_1d3038647e | 新建评分活动 | 新建 |
| copy_1d7bd8535a | 截止日期 | 日期 |

首段到copy_1d7bd8535a已逐项登记，其后尚待续稿。权限相关含糊标签先核具体页面再写，不以统一“授权”强行覆盖。

## 第二段：名单、模板和授权

| 键 | 定稿／处理 |
|---|---|
| copy_1dc07a45f9 | 编辑发起人条件 |
| copy_1ddb44b743 | 表格中的空单元格不会覆盖已有资料。 |
| copy_1ddd4c9b39 | 申请编号 |
| copy_1e28fe0260 | 收起评分说明 |
| copy_1e4c43d5d1 | 认证设置 |
| copy_1e53bfa3db | 改trimCounts(high,low)：去除最高的 {high} 个分数和最低的 {low} 个分数 |
| copy_1f48adb58b | 新建模板（按实际子模块拆评分模板／资料模板／审核模板） |
| copy_1f4cbedfa9 | 暂无可评分人员 |
| copy_20033515d8 | 等第名称 |
| copy_2079e402f3 | 身份类别管理 |
| copy_2098fca507 | 生成恢复码 |
| copy_2100c88988 | 最高分（包含此分数） |
| copy_211047f590 | 编辑印章 |
| copy_214161848a | 管理权限 |
| copy_218426a7c7 | 截止时间 |
| copy_219552c39c | 条评优规则 |
| copy_21c539e0f9 | 新建印章 |
| copy_21d0297fd5 | 选择人员（按选择器person／assignment区分） |
| copy_220954fc7a | 填写评分活动说明 |
| copy_22123f353c | 当前评分活动 |
| copy_2220286f1c | 已完成 |
| copy_22296797fb | 拆键：newResultViewRule＝新增结果查看规则；newMeritDesignationRule＝新增评优指定规则 |
| copy_2278d2da18 | 保存印章 |
| copy_2313ec3016 | 删除未引用的废弃重提模式 |
| copy_2370e6144f | 人 |
| copy_2376d5dfcb | 选择一个身份类别 |
| copy_237707b205 | 指定职能组 |
| copy_237b08549b | 初始分值（startValue，不是最低分） |
| copy_23a586a08a | 可选择多个身份类别 |
| copy_23eefbcaad | 显示等第 |
| copy_2406186d54 | 请先保存或取消编辑，再切换工作角色。 |
| copy_247f66ca71 | 新增结果查看范围 |
| copy_24fb296f09 | 等第显示方式 |
| copy_2592864779 | 查询方式 |
| copy_26488e08c1 | 填写评分题目说明 |
| copy_265032194a | 撤销认证码 |
| copy_26d18e7955 | 退回带引号片段，需完整权限变更确认句 |
| copy_26fc004670 | 职能组列表 |
| copy_27d5123777 | 结果展示方式 |
| copy_282e15e226 | 已撤回 |
| copy_28542c7241 | 审批条件组（符合任意一组即可） |
| copy_296051824f | 开始日期 |
| copy_29f1c77823 | 填写组织说明 |
| copy_29f6c07d3f | 轮 |
| copy_2a0e50c5f6 | 清除 |
| copy_2aad29e5cf | 指定 |
| copy_2aaf72c584 | 已获文件验证权限的人员 |
| copy_2b4df49497 | 未设置 |
| copy_2c2a412327 | 评分人所属部门 |
| copy_2c3fe676c4 | 指定评优人选 |
| copy_2c5113a076 | 岗位信息不完整（岗位不是自由名称） |
| copy_2c969d9302 | 正在加载评优名单 |
| copy_2deb5cbfc9 | 组织名称 |
| copy_2dec661391 | 评分题目 |
| copy_2dfaff6e87 | 输入申请编号 |
| copy_2e2585427a | 已登录设备（实际session降级需另用登录记录） |
| copy_2e6789ec7c | 不限制 |
| copy_2e6a7d24f3 | 发布评分结果 |
| copy_2ed0eb7de9 | 印章列表 |
| copy_2f04d84ba3 | 评分题目及顺序 |
| copy_303b7a8611 | 职能组 |
| copy_309860972e | 个签名 |
| copy_30e235fb56 | 权重 |
| copy_310d71700e | 待审核 |
| copy_3188e61141 | 暂无身份类别 |
| copy_31b3c65645 | 保存范围设置 |
| copy_31cfd4ebeb | 无需新增 |
| copy_31d4595959 | 全部 |
| copy_31e8aaf67d | 评优对象的身份类别 |
| copy_3234735724 | 填写说明（选填） |
| copy_3239064773 | 暂未授予任何人文件验证权限。 |
| copy_32d3256b22 | 新增身份类别 |
| copy_32de7150bf | 等第分数区间 |
| copy_336944985b | 新建评分活动 |
| copy_3393048ea3 | 职能组范围 |
| copy_33a502217d | 考核评分 |
| copy_34338619cf | 当前值： |
| copy_34a7aa4018 | 跳过格式不符合要求的记录 |
| copy_354e8c46c3 | 分值说明 |
| copy_358c64db1a | 分值间隔 |
| copy_35d04fd49e | 退回按钮计数片段，确认按钮固定“确认选择”，数量独立摘要 |
| copy_35fabd21a9 | 当前评分活动 |
| copy_363e007ade | 编辑组织名称 |
| copy_36ed272af5 | 允许成员设置登录口令，并使用口令登录。 |
| copy_3704f9b212 | 管理权限 |
| copy_374780cd3d | 保存被评分人范围 |
| copy_37b2d47dd4 | 导出表格 |
| copy_37c16943eb | 最大长度 |
| copy_38f7aca35c | 身份类别 |
| copy_393f873d06 | 选择图片 |
| copy_397a0808d4 | 保存职能组 |
| copy_3a1a234d95 | 填写题目内容 |
| copy_3b7c76c871 | 删除所选项 |
| copy_3cd3d7a8c2 | 删除未引用的废弃重提模式 |
| copy_3dea97848e | 当前资料模板 |
| copy_3e0014d92a | 开启后，只导入检查通过的记录。 |
| copy_3e081d0fa1 | 删除未引用旧语料，不以单一状态称完整验证通过 |
| copy_3eb9b187ef | 上传文件 |
| copy_3f75d366b0 | 撤销 |
| copy_3f9ec35c15 | 没有符合筛选条件的人员 |
| copy_3fe1d6f4f6 | 暂无结果查看规则 |
| copy_405f619b06 | 部门： |
| copy_40859eeee7 | 尚未保存的修改 |
| copy_40f8a2873c | 生成评分人分类；旁边必须有独立generateScorerCategoriesHelp说明：按本组织现有岗位的部门和身份类别生成评分人分类，并同步已有分类。此处不生成字典、不改变账号权限。 |
| copy_413624a39e | 去除最高分的个数 |
| copy_414b7d9da7 | 结果公示 |
| copy_41e8060a1f | 保存资料模板 |
| copy_41f0769610 | 显示内容 |
| copy_42143afbe4 | 修改后直接生效 |
| copy_427890ecdb | 指定身份类别 |
| copy_42c145fb7a | 选择部门 |
| copy_43229676c3 | 生成新恢复码 |
| copy_43992b550e | 成员资料详情 |
| copy_439c4fcf37 | 认证设置未能加载，请重试。 |
| copy_43e8603f7a | 没有符合筛选条件的成员 |
| copy_447b221a5e | 新建组织 |
| copy_44b244e636 | 任务完成进度 |
| copy_44b682f101 | 隐藏并保留资料 |
| copy_44d2871601 | 岗位性质 |
| copy_453aeb2049 | 最大长度 |

## 第三段：资料字段和评分设置

| 键 | 定稿／处理 |
|---|---|
| copy_4675a7e226 | 模板得分 |
| copy_46b1f83a99 | 填写部门名称 |
| copy_4727505bbd | 详细信息 |
| copy_47cdc1cd32 | 关闭后，评分人不能给本人评分。 |
| copy_47f9d64667 | 导入表格 |
| copy_4875d82d59 | 没有需要处理的原有资料。 |
| copy_49237813f2 | 评分任务完成情况 |
| copy_493a127a99 | 步 |
| copy_4990ecbcc4 | 身份类别范围 |
| copy_49a7fb10d7 | 导出管理员目录 |
| copy_49b5b1ec92 | 两端审核条件编辑器的identity_scope类型改引用已批准copy_0dc18b5a1e“岗位范围条件”，实际包含部门、身份类别、职能组，不只身份类别。内层copy_4990ecbcc4保留“身份类别范围”。 |
| copy_49cbf30d6b | 签名 |
| copy_4a0e80e55b | 确认应用 |
| copy_4a52a9d301 | 设置登录口令 |
| copy_4a52d5ce73 | 被评分人范围 |
| copy_4a8754e628 | 列 |
| copy_4adc175789 | 已有评分结果的成员 |
| copy_4b11a94d96 | 评分记录数 |
| copy_4b357a97b6 | 新增职能组 |
| copy_4b405169cb | 与申请岗位相同（具体部门／身份类别／职能组字段标签必须同时可见） |
| copy_4c06e10093 | 新增评优对象范围 |
| copy_4c329a4071 | 允许 |
| copy_4cd790e423 | 尚未选择模板 |
| copy_4cf8cbfee4 | 完成规定的全部评分后，才计入结果计算。 |
| copy_4d1b131cfb | 指定部门（可多选） |
| copy_4d3b682ec9 | 添加条件 |
| copy_4da037e8e6 | 退回动态按钮片段，按钮用“保存名单”，已选人数独立显示 |
| copy_4f5ffea945 | 良好（等第默认名称） |
| copy_4f6ab0ccf7 | 审核 |
| copy_4fd2c90e08 | 请选择范围。 |
| copy_4fd7b5de41 | 新增 |
| copy_5056ad7eb7 | 填写身份类别名称 |
| copy_512d095db5 | 评分题目说明 |
| copy_514b4a69ae | 文件： |
| copy_51996ace76 | 内容类型 |
| copy_52daff6e5d | 暂无职能组 |
| copy_52e124d1bc | 按岗位 |
| copy_5327cd39d0 | 请先选择所属部门。 |
| copy_5354228d3f | 最小长度 |
| copy_53adcabdff | 模板名称 |
| copy_549147dd7b | 首次认证 |
| copy_54d366a2c5 | 填写方式 |
| copy_54e953f1bb | 无 |
| copy_54f375d40f | 成员总数 |
| copy_557a7fc9dc | 评分人信息 |
| copy_560dc33d09 | 填写说明 |
| copy_563acb4455 | 登录口令 |
| copy_56cbab8f45 | 优秀（默认等第名） |
| copy_56eeb3e076 | 填入 |
| copy_57b008f8c7 | 待提交 |
| copy_594d78f7c9 | 尚未选择人员 |
| copy_59641d46c9 | 请选择如何处理原有资料。 |
| copy_5a1d751f54 | 指定身份类别（可多选） |
| copy_5a49161fd7 | 评分模板 |
| copy_5a91e32d9a | 全部身份类别 |
| copy_5aa4cb13ec | 评分活动 |
| copy_5b18d7f5ee | 允许上一步处理人指定本步骤的审批岗位 |
| copy_5b4cf5d1bf | 基本设置 |
| copy_5b54c6c107 | 题目数量： |
| copy_5c1dc295d8 | 新增等第分数区间 |
| copy_5d41fef45a | 按申请编号 |
| copy_5d5af942c5 | 已驳回 |
| copy_5dc621d7b8 | 去除最高分和最低分 |
| copy_5dd52b59e7 | 暂无部门 |
| copy_5deaa526c3 | 名额 |
| copy_5e053dd2d0 | 暂无评分题目 |
| copy_5eb168c392 | 等第 |
| copy_5ece2c09c8 | 请选择目标身份类别。 |
| copy_5f1469d154 | 暂无等第分数区间 |
| copy_5faa13ae7e | 全选筛选结果 |
| copy_5fd0089e2a | 收起 |
| copy_5ffa77253f | 暂无详情 |
| copy_600dad22eb | 暂无评分记录。 |
| copy_60c630a885 | 按分数从高到低 |
| copy_61386762d9 | 保留品牌后缀： - WHUSU智慧工作台 |
| copy_62676bc383 | 不限制 |
| copy_632d07e81f | 新增管理身份 |
| copy_634a8d035c | 搜索姓名、部门、身份类别或职能组（管理员候选必须移除学号查询及下发，不只改文字） |
| copy_637d8a9907 | 保存身份类别 |
| copy_638da8ae60 | 武汉大学学生会 |
| copy_6479e33014 | 填写模板名称 |
| copy_651186ec82 | 查看完整示例 |
| copy_6583057f67 | 需选满名额 |
| copy_66240d9d99 | 基本信息 |
| copy_66382c2bfd | 请填写不同于已有模板的名称。 |
| copy_67055d67dc | 新增一条被评分人范围规则 |
| copy_6760fdda32 | 尚未选择评分模板 |
| copy_6794fea233 | 暂无审核记录 |
| copy_67b12abfd3 | 完成后，新微信可用于登录；原微信将解绑，已有登录将结束。 |
| copy_67f4dcc157 | 编辑模板 |
| copy_6853ab11f7 | 审核流程 |
| copy_6888d59833 | 清空 |
| copy_68f7277730 | 全部部门 |
| copy_6a286f4221 | 是否须完成全部评分 |
| copy_6a48578660 | 内容一致 |
| copy_6a843c55ad | 新建组织 |
| copy_6a855406a9 | 退出设备（仅真实设备聚合模式） |
| copy_6b529b32de | 关闭后，将表格中的题目追加到现有题目之后。 |
| copy_6b5de892b0 | 组织信息暂未确认 |
| copy_6b7249dab1 | 生成认证码 |
| copy_6b9d23798a | 暂无可查看的评优名单 |
| copy_6c0ce64188 | 最低 |
| copy_6c56cd8336 | 可管理的管理员（实际列表权限决定范围，不猜全部超管） |
| copy_6cc2ee6bc8 | 起始分 |
| copy_6ce8bf8393 | 审批方式 |
| copy_6d3911624a | 请选择评分活动。 |
| copy_6d4987d954 | 可选成员 |
| copy_6dd2900f2a | 取消编辑被评分人范围 |
| copy_6de197a041 | 合格（默认等第名） |
| copy_6de6e1f11f | 不限制身份类别 |
| copy_6e9de47ad4 | 正在修改 |
| copy_6ee4bd4f78 | 保存并继续填写资料 |
| copy_6eeaccbeca | 印章图片 |
| copy_6efebc1cc6 | 评分题目（仅评分场景；导入错误需独立问题标签） |
| copy_71446eee47 | 保存组织设置 |
| copy_71a5b74266 | 其他岗位 |
| copy_71db23a36b | 保存 |
| copy_726cfc3525 | 设为当前评分活动 |
| copy_727b16b970 | 查看全文 |
| copy_72a40b3f52 | 检查表格内容 |

## 第四段：模板、人员和结果

| 键 | 定稿／处理 |
|---|---|
| copy_72d3c6f7c2 | 管理员 |
| copy_72dd9e6203 | 删除按钮人数片段，数量独立显示 |
| copy_7312ee863e | 审核模板 |
| copy_73b11affc2 | 文件验证未通过（仅必需检查确实失败，未知不是失败） |
| copy_74b0241999 | 指定评优人选 |
| copy_74e00681c9 | 暂停评分活动 |
| copy_74e8862ad7 | 拆键：applySelectedViewRules＝应用到所选查看规则；applySelectedMeritRules＝应用到所选评优指定规则 |
| copy_757dfc5eab | 改currentCandidatesCount(count)：当前人选（{count}人） |
| copy_75d14ce844 | 正在编辑被评分人范围规则 |
| copy_7616809fea | 编辑被评分人范围 |
| copy_764be134e6 | 更新条件 |
| copy_779363030e | 删除资料项 |
| copy_779db553f1 | 导出评分完成情况 |
| copy_7844b14771 | 新增评优对象范围 |
| copy_7897981e63 | 删除无引用废弃模式 |
| copy_79b2d9fea4 | 尚未设置当前评分活动 |
| copy_79b5b44e28 | 暂无评优名单 |
| copy_7a4ac1ad99 | 职能组名称 |
| copy_7a4d5ab30f | 姓名 |
| copy_7a62b752fe | 确认选择 |
| copy_7ab8854c73 | 新增结果查看范围 |
| copy_7badfe9830 | 设置首次认证和账号恢复的可用方式。 |
| copy_7c22a48e84 | 退回行数问题碎片，使用完整问题记录数量句 |
| copy_7c4117217c | 条被评分人规则 |
| copy_7cab7f5321 | 资料模板 |
| copy_7cf822347d | 去除最高分和最低分后取平均 |
| copy_7d4f155111 | 当前功能 |
| copy_7dce1d98a1 | 得分 |
| copy_7e4100d002 | 保存（模板本体与条款模板配置共用，各区标题须明确对象） |
| copy_7e6630535d | 盖章 |
| copy_7e6fe80a00 | 新增身份类别 |
| copy_7e7d84061a | 删除未引用旧搜索语料 |
| copy_7e9a5945ed | 新增成员 |
| copy_7ee1272d5b | 所属部门 |
| copy_7efbce059c | 示例内容 |
| copy_7f160b8a66 | 选择部门 |
| copy_801a88e4a1 | 已选 |
| copy_803b577438 | 删除未引用旧搜索语料 |
| copy_80708ed559 | 新增被评分人范围规则 |
| copy_809f3d3dd3 | 快捷选择 |
| copy_80c4bdb2f5 | 正在加载评分情况 |
| copy_80fba348b7 | 学号（仅授权人事资料或专用导出） |
| copy_811bde992e | 例如：优秀、良好、合格 |
| copy_81888e3e1d | 新增部门 |
| copy_82461fae0c | 当前工作角色没有管理权限。 |
| copy_827d50f428 | 身份类别名称 |
| copy_82a3e85f96 | 已暂停 |
| copy_82f17ccbef | 电子印章管理 |
| copy_83a484a00c | 填写评分模板名称 |
| copy_83bd4d9da0 | 暂无填写说明 |
| copy_8438adbb77 | 按职能组 |
| copy_84c222ed0d | 查看完整示例 |
| copy_859af29a3b | 添加超级管理员 |
| copy_85f42e4ef8 | 生成新认证码 |
| copy_86937eac2b | 成员资料 |
| copy_86accadcca | 暂无审批记录 |
| copy_86b7f3ae38 | 按组织展示你有权查看的岗位和管理身份。 |
| copy_87fcf63dd5 | 填写模板说明 |
| copy_8859c785ab | 请选择职能组。 |
| copy_8860e9ad76 | 新增职能组 |
| copy_88898b98bf | 身份类别列表 |
| copy_88ae76e6fe | 填写职能组说明 |
| copy_8a479a4213 | 暂无总分结果 |
| copy_8a8b68c027 | 显示分数 |
| copy_8abd0d1512 | 当前资料 |
| copy_8aee737e64 | 状态 |
| copy_8b397940d8 | 学院对接岗位 |
| copy_8b4ae14b7b | 重新加载 |
| copy_8b73330188 | 导出评分明细 |
| copy_8bad1e0cda | 导出文件 |
| copy_8cf734b362 | 组织列表 |
| copy_8d07ba7bae | 项管理权限 |
| copy_8d32562588 | 加入当前被评分人范围 |
| copy_8e2f75159e | 通过 |
| copy_8ec888d575 | 收起 |
| copy_8ef1f4695c | 电子印章 |
| copy_91459a2ebc | 填写部门说明 |
| copy_9242c7c6e4 | 新增岗位 |
| copy_92b82a2c4b | 删除去极值前半句，使用trimCounts |
| copy_932ce40cfb | 结束日期 |
| copy_93331f8a70 | 暂时无法读取 |
| copy_937301fe27 | 条件类型 |
| copy_9395b8661f | 印章名称 |
| copy_93ab263567 | 资料项名称 |
| copy_93c50c01c0 | 第 |
| copy_9511306804 | 暂无评分人类别 |
| copy_9595c13a29 | 添加审批步骤 |
| copy_95a84a25aa | 拆键：saveResultViewRule＝保存查看规则；saveMeritDesignationRule＝保存评优指定规则 |
| copy_961862242a | 取消全选 |
| copy_96187d380e | 创建模板 |
| copy_961b3afe6a | 请选择评分模板。 |
| copy_96380cec9a | 撤销这条评分记录 |
| copy_971b628f49 | 填写姓名 |
| copy_97a5c04e0f | 职能组 |
| copy_97dcf751c6 | 最高 |
| copy_9882d5696d | 删除按钮计数片段，摘要独立显示 |
| copy_988a1cf6bc | 允许使用认证码完成首次账号认证 |
| copy_988fd3b654 | 填写分值说明 |
| copy_98aea69c53 | 选择文件 |
| copy_98dc7c613a | 提交后需审核 |
| copy_98f2a2c9dc | 尚未添加审批步骤 |
| copy_996309f45d | 新建模板 |
| copy_99f2be3030 | 按姓名首字母排序 |
| copy_9a2854d17d | 全部成员 |
| copy_9a4a6e8793 | 查看本人评分结果 |
| copy_9a5675654c | 拆键：resultViewerIdentity＝可查看结果的身份类别；meritDesignatorIdentity＝可指定评优人选的身份类别 |
| copy_9a74f620ee | 生成默认等第 |
| copy_9ad6311419 | 评分人类别 |
| copy_9b5f84bf27 | 保存设置 |
| copy_9beb04f4f6 | 指定人员条件 |
| copy_9bf2c74ba4 | 返回应用服务 |
| copy_9c0e348f1b | 对应资料项（人事映射）／对应题目字段（评分模板映射），拆mappingProfileField与mappingQuestionField |
| copy_9c8b8eb1de | 同一个人的不同岗位分别评分。（仅真实按岗模式） |
| copy_9cf9a2961b | 填写职能组名称 |
| copy_9d1ff80fae | 请选择日期。 |
| copy_9d31093860 | 新增评分题目 |
| copy_9d34006a03 | 保存部门 |
| copy_9d6febb814 | 尚未指定评优人选 |
| copy_9d954432df | 评分任务完成情况 |
| copy_9e2afcd01b | 编辑结果查看范围 |

## 第五段：导入、认证与模板应用

| 键 | 定稿／处理 |
|---|---|
| copy_9e545997b0 | 步 |
| copy_9ecea0b582 | 审核状态 |
| copy_9ecf7b0bd0 | 将新增到当前组织的资料 |
| copy_9f4c79680e | 暂无评分人 |
| copy_9f601dac32 | 分数显示方式 |
| copy_9fc4793280 | 按岗位分别评分 |
| copy_a017932da1 | 正在加载 |
| copy_a025c4351f | 处理方式 |
| copy_a0d495faa0 | 资料模板 |
| copy_a0f9ac898a | 申请列表 |
| copy_a0fd73c81e | 表格列名 |
| copy_a1399ed0a2 | 由管理员维护 |
| copy_a25637362e | 确认恢复账号 |
| copy_a36ffa9141 | 请检查表格内容。 |
| copy_a3c996a525 | 未命名评分模板 |
| copy_a44e21b978 | 新建印章 |
| copy_a4cbcb25b9 | 例如：宿舍号 |
| copy_a4d0a5c326 | 选择职能组 |
| copy_a530f9158a | 编辑职能组 |
| copy_a5674f1e5b | 按本步骤的审批条件确定可处理岗位 |
| copy_a59dd7ae8d | 添加发起人条件 |
| copy_a5a1bad35b | 请返回修改表格，或选择跳过无法导入的记录。 |
| copy_a63d02480e | 签名＋盖章 |
| copy_a6aff2251a | 暂无评优对象范围 |
| copy_a6b6f71690 | 新增管理身份 |
| copy_a6f7e5f124 | 查看明细 |
| copy_a782814703 | 评分活动名称 |
| copy_a7cce01d43 | 保存公示设置 |
| copy_a7cee696a3 | 待处理 |
| copy_a7f220a4a7 | 重置（需保持所在表单明确对象，不用于账号重置） |
| copy_a859dc349b | 改targetScoresTitle(name)：{name} 获得的评分（实际selectedResultTarget是被评分人） |
| copy_a8792b30e7 | 基本设置 |
| copy_a8bca898cb | 结果查看权限 |
| copy_a8c395216d | 删除未引用废弃重提模式标签 |
| copy_a8f6e57e29 | 评分模板名称 |
| copy_a97ad1165b | 开放日期 |
| copy_a9da08c33e | 分值间隔 |
| copy_aa4f0ed6cd | WHUSU智慧工作台 |
| copy_aa523247a6 | 职能组说明 |
| copy_aa81275ca1 | 可导入 |
| copy_ab3797ac2c | 指定人员（可多选） |
| copy_ac4d7a45e0 | 例如：部门负责人审批 |
| copy_acc985cabc | 删除 |
| copy_acca7e58d8 | 不限制部门、身份类别和职能组（仍须满足组织与有效岗位条件） |
| copy_ad183b164d | 未设置身份类别 |
| copy_ad9efc83fe | 删除未引用旧语料 |
| copy_adabb47646 | 应用模板 |
| copy_ade4fb64f7 | 查看评分结果 |
| copy_af065065d0 | 不设置截止时间 |
| copy_af99ad1b75 | 管理员列表 |
| copy_b059d32042 | 解除账号冻结 |
| copy_b06b169d19 | 顺序 |
| copy_b0d3b06307 | 将只导入检查通过的记录。 |
| copy_b1f975e018 | 将移除这项管理身份，不删除成员账号。 |
| copy_b26bdbb604 | 导出成员资料 |
| copy_b2c24eb575 | 允许给本人评分 |
| copy_b3109890c4 | 暂无岗位 |
| copy_b32daeb84f | 选择需要导出的基本信息和补充资料项。 |
| copy_b35531a5fd | 确认导入 |
| copy_b3ef8687f3 | 请为每项资料选择对应的表格列。 |
| copy_b49d7af0bd | 开始验证 |
| copy_b4c3e73028 | 共 |
| copy_b540933e66 | 请选择 |
| copy_b5c6b6df78 | 删除所选项 |
| copy_b642bafb60 | 全局管理权限 |
| copy_b66760c55a | 查看评分说明 |
| copy_b6e35653ea | 请切换到有权管理此功能的工作角色。 |
| copy_b722908172 | 关闭 |
| copy_b72973a16b | 等第分数范围 |
| copy_b750045581 | 不允许 |
| copy_b79428bf57 | 添加审批步骤 |
| copy_b7eb36a897 | 最低分（包含此分数） |
| copy_b8139ca252 | 删除这个分数区间 |
| copy_b86e259dd7 | 解绑 |
| copy_b8d5e5b952 | 评优对象范围 |
| copy_b92f43fb29 | 清除登录口令 |
| copy_b969caec7c | 正在加载认证设置 |
| copy_b96baa9918 | 管理身份类型 |
| copy_b9b9929aee | 评分人 |
| copy_b9d18e854e | 解绑微信 |
| copy_ba0ffa5386 | 填写手机号 |
| copy_ba3a4b8440 | 反选 |
| copy_bb0ad94473 | 确认步骤设置 |
| copy_bbaa4d5edb | 尚未填写题目内容 |
| copy_bbb93316d5 | 生成恢复码 |
| copy_bc267b6762 | 选择资料对应的表格列 |
| copy_bc78ef2011 | 岗位（不得引入自由文本岗位名称） |
| copy_bd24ac5b0c | 确认 |
| copy_bd83f7065b | 删除未引用废弃重提模式 |
| copy_be4c46b141 | 需要处理 |
| copy_be547ba4c7 | 审核记录 |
| copy_be942e85d1 | 正在加载评分结果 |
| copy_bed15e0757 | 重置筛选 |
| copy_bed2e70b8f | 显示时区 |
| copy_bf4cf396ad | 评分人的身份类别 |
| copy_bff094c480 | 按状态筛选 |
| copy_c03d6853ef | 选择人员（岗位选择须独立用选择岗位） |
| copy_c0a872bff0 | 部门说明 |
| copy_c0ad13da27 | 评分模板列表 |
| copy_c0ad651b1f | 台（仅真实设备聚合，不用于session） |
| copy_c15260b37c | 部门管理 |
| copy_c195d59710 | 认证码已生成 |
| copy_c1961a2760 | 继续编辑 |
| copy_c1965e0690 | 身份类别 |
| copy_c1f37f0512 | 替换现有评分题目 |
| copy_c2453e59bf | 不限制被评分人的身份类别 |
| copy_c318ac62ef | 恢复码 |
| copy_c34e8a16c0 | 保存模板 |
| copy_c3602a8c91 | 此超级管理员身份适用于全部组织 |
| copy_c38fbdddf0 | 删除已选计数片段，使用独立摘要 |
| copy_c3d0b2b161 | 暂无评分完成情况 |
| copy_c3e182f0c6 | 移除 |
| copy_c3ee16b49e | 暂无审核流程 |
| copy_c3f8ea9aaa | 每行填写一个选项 |
| copy_c47f370afa | 选择 |
| copy_c536f98c27 | 最小值 |
| copy_c59d25a358 | 个岗位 |
| copy_c5b6490a3f | 不合格（默认等第名称） |
| copy_c5dd070c37 | 审批步骤名称 |
| copy_c6a717f074 | 退回模板应用标题片段，改applyTemplateTitle(name)：应用“{name}” |

## 第六段：成员清理与系统设置

| 键 | 定稿／处理 |
|---|---|
| copy_c6b23c03db | 退回删除管理身份片段，需完整名称函数 |
| copy_c7710f6c1e | 最大值 |
| copy_c8eafec97e | 目标身份类别 |
| copy_c952809d89 | 填写数字 |
| copy_c95c079dfd | 指定范围 |
| copy_c97f4e1c21 | 编辑部门 |
| copy_ca0f4c277a | 移入新资料项 |
| copy_ca89208b18 | 部门列表 |
| copy_ca92a29121 | 被评分人的身份类别 |
| copy_caa70e7c13 | 开放时间 |
| copy_caa7f1f1c1 | 账号与认证 |
| copy_caeab5d89c | 排序方式 |
| copy_cb81018d6d | 更换图片 |
| copy_cbbf92860a | 没有符合筛选条件的选项 |
| copy_cbdd390194 | 评分活动说明 |
| copy_cc101256f6 | 项资料 |
| copy_cc6356670c | 授予管理身份 |
| copy_cc7425f62e | 保存管理身份 |
| copy_cc82c2aee6 | 取消选择筛选结果（仅作用于筛选结果、保留其他选择时） |
| copy_cc8d2abb43 | 表格内容 |
| copy_ccd219e5f1 | 超级管理员 |
| copy_cd3540aaf7 | 加权平均 |
| copy_cd42443afc | 留空表示不限制 |
| copy_cea1da7603 | 搜索 |
| copy_cec32bdb96 | 清除筛选 |
| copy_cef74d5df5 | 创建资料模板 |
| copy_cf96ec6e3a | 退回复用：评分规则反选使用 reverseFilteredRules“反选筛选结果”；公示规则全选使用 selectAllVisibleViewRules“全选筛选结果”。两种动作不得共用一个键。 |
| copy_cfe99b2433 | 不要求完成全部评分 |
| copy_d036aa723a | 附件 |
| copy_d1856227b6 | 请选择身份类别。 |
| copy_d2005b0c5b | 退回示例碎片，exampleValue(value)：例如：{value} |
| copy_d2854566f8 | 例如：主席团成员、学院对接人员 |
| copy_d29a9747eb | 驳回原因： |
| copy_d379421477 | 按所属部门 |
| copy_d3da0e164a | 添加审批条件 |
| copy_d5e4a3193a | 已保存 |
| copy_d6bea542aa | 暂无可指定评优人选的身份类别 |
| copy_d6c7d5f681 | 填写评分活动名称 |
| copy_d71ef091dd | 输入关键词 |
| copy_d7ab4890db | 拆键：generateViewRules＝生成查看规则；generateMeritRules＝生成评优指定规则。只是补建分类，须附文末生成说明，不暗示已授默认权限。 |
| copy_d7be99abe4 | 填写邮箱 |
| copy_d7c8fd23a8 | 或（仅逻辑组关系；自然语句必须整句） |
| copy_d80d3752da | 尚未选择人员 |
| copy_d88a120c73 | 选填 |
| copy_d98f6ae430 | 确认恢复账号 |
| copy_d9ef5c1b3e | 保存后，可继续添加岗位和补充资料。 |
| copy_da2843df2e | 资料项 |
| copy_da7c6bfe5c | 评分任务完成情况 |
| copy_dbeac75f6f | 评分对象 |
| copy_dc077c17cf | 认证设置未能加载，请重试。 |
| copy_dc2056bbc9 | 编辑条件 |
| copy_dd83cfe437 | 请选择结束日期。 |
| copy_de101441cb | 删除已有资料 |
| copy_dee3b2111f | 结果查看范围 |
| copy_df05b9bf5d | 必填 |
| copy_df3af9a329 | 请先选择部门和身份类别。 |
| copy_df74a9927e | 尚未设置审批条件 |
| copy_dfe3ef46ab | 组织管理 |
| copy_e040ae3016 | 编辑 |
| copy_e067049fe8 | 已完成全部评分的人数（需实际完成人数，不能用已评目标数量） |
| copy_e07efb186e | 导出问题清单 |
| copy_e0e7db5698 | 新增资料项 |
| copy_e12c6d6080 | 模板列表 |
| copy_e15d9ac2ee | 重新计算并刷新 |
| copy_e168d7f67e | 使用中 |
| copy_e1c977eb9b | 没有符合筛选条件的成员 |
| copy_e1d94e445d | 全选筛选结果（须实际筛选集合而非加载一页） |
| copy_e29aac1957 | 查看明细 |
| copy_e393c20270 | 账号恢复 |
| copy_e39d601eb0 | 从表格读取（仅模板字段或题目读取，不等于成员已入库） |
| copy_e47b779507 | 发起人条件组（符合任意一组即可） |
| copy_e4a84c9a86 | 按人评分 |
| copy_e4b2684dfe | 暂无成员资料 |
| copy_e4e74de4c6 | 添加管理身份 |
| copy_e53f7aae11 | 说明 |
| copy_e57c8daee6 | 填写印章名称 |
| copy_e5b5701d94 | 选择职能组 |
| copy_e5c0e22c49 | 发布评分结果 |
| copy_e5f5be43de | 退回后半句，表格问题须完整句和逐行明细 |
| copy_e68b797796 | 验证文件签名 |
| copy_e73eea6f61 | 清除截止时间 |
| copy_e74c96dd07 | 系统默认组织 |
| copy_e7c1936709 | 搜索人事成员 |
| copy_e8b001bfef | 选择身份类别 |
| copy_e8ca7f8024 | 部门范围 |
| copy_ea0c75f8dd | 未限制发起人范围（不承诺任意外部人或无岗位账号可发起） |
| copy_ea5887b6b7 | 暂无补充资料 |
| copy_eab3f6240f | 编辑评分模板（按已核模板资源） |
| copy_eada426deb | 请选择部门。 |
| copy_eb1ebe5d11 | 冻结账号 |
| copy_eb65126cfe | 人事信息 |
| copy_ec62916da5 | 当前被评分人范围 |
| copy_ec94756105 | 允许指定本步骤的审批岗位 |
| copy_ec9aab61b0 | 尚未指定人员 |
| copy_ecfd21fdcd | 文件验证权限 |
| copy_edef2184fb | 授予文件验证权限 |
| copy_ee368e39ca | 最高分 |
| copy_eee2fd643a | 生成认证码 |
| verificationCodeValidity | 认证码有效期 |
| verificationCodeValidityDays | {0} 天（按真实配置，不固定24小时） |
| hrDeletionForceAvailable | 该成员有关联业务记录，可保留业务记录后删除成员资料。 |
| hrDeletionForceConsent | 我已了解：评分、审批、场地等业务记录会保留，并解除与被删除成员的直接关联；原学号线索仍仅限超级管理员查看。 |
| hrDeletionForceConfirm | 确认删除（保留业务记录的后果必须在确认正文和勾选项中显示） |
| hrDeletionForcedDone | 成员资料已删除，业务记录已保留并解除人员关联。 |
| copy_ef1232fbde | 已隐藏的资料 |
| copy_ef89679d22 | 留空，不新增 |
| copy_ef8b7ffa9b | 第 |
| copy_efa712e243 | 编辑评优对象范围 |
| copy_efd3ffe3d3 | 尚未设置结果查看权限 |
| copy_f09dcf0e17 | 退回步骤序号片段，stepLabel(order)：第 {order} 步 |
| copy_f1643742d1 | 指定部门 |
| copy_f1dc48a65c | 名额上限 |
| copy_f236827e3f | 内容已修改 |
| copy_f288d821cd | 新建评分模板（按已核资源） |
| copy_f29d0c426b | 允许小数 |
| copy_f2dd354103 | 账号信息未能加载，已显示的成员资料仍可查看。 |
| copy_f31350a7af | 职能组： |
| copy_f34e9d1f5c | 退回附件数后缀，attachmentCount(count)：{count} 份附件 |
| copy_f3a3b597fe | 与申请岗位的部门相同 |
| copy_f3bb9fa262 | 填写组织名称 |
| copy_f4094dd21d | 填写学号（仅人事授权场景） |
| copy_f489226f00 | 保存并设为默认组织 |
| copy_f4a45efaf1 | 更新 |
| copy_f4a56e89fa | 指定职能组（可多选） |
| copy_f4f964a807 | 清除开放时间 |
| copy_f591c0573c | 按人 |
| copy_f594467fe0 | 本组织的填写说明 |
| copy_f6afc42806 | 草稿 |
| copy_f6c2ad6b33 | 编辑评分活动 |
| copy_f6f826bc55 | 补充资料 |
| copy_f741fcce8e | 与申请岗位的职能组相同 |
| copy_f7736be7ba | 题目内容 |
| copy_f81bcf5295 | 请先保存修改。 |
| copy_f82a18c7a0 | 尚未选择目标身份类别 |
| copy_f97b69cf97 | 组 |

## 第七段：人事详情与永久删除

| 键 | 定稿／处理 |
|---|---|
| copy_f9d85998ba | 岗位 |
| copy_fa119a1829 | 筛选条件 |
| copy_fa66c182e7 | 按名额指定人选 |
| copy_fae2f8bfa5 | 退回输入提示片段，使用字段完整占位提示 |
| copy_fb3cdc524b | 取消全选 |
| copy_fb4bf20470 | 选择需要验证的文件 |
| copy_fbf1856932 | 复制 |
| copy_fc5b4ba39e | 项查看范围 |
| copy_fcb584d9c6 | 编辑资料模板 |
| copy_fcc739ca7b | 第一步由发起人指定审批岗位；后续步骤由上一步处理人指定。 |
| copy_fd2708bef0 | 评分人类别列表 |
| copy_fd31650797 | 普通管理员 |
| copy_fda919de66 | 设为默认 |
| copy_fdfebadcca | 编辑岗位 |
| copy_fe59d1afcd | 不设置 |
| copy_fe964455aa | 凭据仅展示一次，请妥善保存并分别交给对应成员。 |
| copy_ff6a3c2862 | 部门名称 |
| auditSelectAssignments | 选择审批岗位 |
| auditSelectAssignmentsHint | 选择具体人员的岗位 |
| hrAssignmentNature | 岗位性质（源中重复键同值，实施去重复声明，不改含义） |
| hrIdentityCategory | 身份类别（重复声明同上） |
| hrNoPosition | 暂未设置岗位 |
| hrNoPositionHint | 该成员仍属于当前组织。设置岗位后，才能参与按岗位安排的审批、评分等工作。 |
| hrLeaveOrganization | 离开当前组织 |
| hrFormerMembers | 已离开成员 |
| hrFormerMembersHint | 已离开的成员仍保留账号和历史记录，可以重新加入当前组织。 |
| hrReactivateMembership | 重新加入 |
| hrNoFormerMembers | 暂无已离开成员 |
| hrLeftAt | 离开时间 |
| hrIntegrityCheck | 检查基础资料一致性 |
| hrProfileEffectiveValue | 已生效内容 |
| hrProfilePendingValue | 待审核内容 |
| hrProfileNoValue | 未填写（仅已授权且确实空值；字段未返回须省略） |
| hrRejectReasonTitle | 填写驳回原因 |
| hrRejectReasonLabel | 驳回原因 |
| hrRejectReasonPlaceholder | 说明哪些资料需要修改，以及修改要求 |
| hrRejectReasonRequired | 请填写驳回原因。 |
| hrSubmitRejection | 确认驳回 |
| hrCorrectionTitle | 修正姓名与学号 |
| hrCorrectionHint | 姓名和学号由这个人的所有组织共用。修改后，以下组织中的信息也会更新。 |
| hrCorrectionCurrent | 修改前 |
| hrCorrectionProposed | 修改后 |
| hrCorrectionAffectedOrganizations | 受影响的组织 |
| hrCorrectionConfirm | 我已核对修改内容和受影响的组织。 |
| hrCorrectionApply | 确认修改 |
| hrCorrectionConflictTitle | 这个学号已属于另一名人员 |
| hrCorrectionConflictHint | 不能直接覆盖已使用的学号。若确认为同一人，可以将当前人员合并到下方人员，保留组织关系和历史记录。 |
| hrCorrectionMergeTarget | 合并到以下人员 |
| hrCorrectionMerge | 确认合并 |
| hrCorrectionUpdated | 姓名与学号已更新 |
| hrCorrectionMerged | 人员记录已合并 |
| hrCorrectionPreviewFailed | 修改影响范围未能加载，请重试。 |
| hrCorrectionConfirmRequired | 请先核对并确认修改影响范围。 |
| hrCorrectionSourceScope | 当前人员加入的组织 |
| hrCorrectionTargetScope | 目标人员加入的组织 |
| hrCorrectionAccountStatus | 全局账号状态 |
| hrAccountVerified | 已认证 |
| hrAccountFrozen | 已冻结 |
| hrAccountRecoveryRequired | 需要恢复账号 |
| hrAccountUnbound | 未创建账号 |
| hrMembershipActive | 在职 |
| hrMembershipLeft | 已离开 |
| hrMembershipMerged | 已合并 |
| hrGlobalAccountContact | 账号操作需要全局账号管理权限，请联系有权处理的管理员。 |
| hrWorkContextTerm | 工作角色 |
| hrPositionsAndAdminRoles | 岗位与管理身份 |
| hrPositions | 岗位 |
| hrViewDetail | 查看详情 |
| historicalAssignmentUnavailable | 岗位未记录 |
| hrDirectorySearchField | 搜索范围 |
| hrDirectoryKeyword | 搜索内容 |
| hrDirectoryKeywordPlaceholder | 输入关键词 |
| hrDirectorySort | 排序方式 |
| hrAdvancedFilters | 高级筛选 |
| hrCollapseFilters | 收起筛选 |
| hrMembershipStatus | 成员状态 |
| hrPositionStatus | 岗位状态 |
| hrDepartment | 部门 |
| hrWorkGroup | 职能组 |
| hrProfileStatus | 资料审核状态 |
| hrProfileCompleteness | 资料完整度 |
| hrAccountStatus | 账号状态 |
| hrBindingStatus | 微信绑定状态 |
| hrClearFilter | 清除筛选 |
| hrHistoricalPosition | 历史岗位 |
| hrMembershipJoinedAt | 加入时间 |
| hrMembershipLeftAt | 离开时间 |
| hrReactivateMembershipInline | 重新加入 |
| hrFormerReadOnlyHint | 该成员已离开当前组织，资料及离开前的岗位只能查看。重新加入后，需要重新设置岗位。 |
| hrDangerZone | 删除与清理 |
| hrPermanentDeletionHint | 删除前会检查关联资料和安全限制。请先查看检查结果，再确认删除范围；有关联业务记录时，按页面列出的方式处理。 |
| hrDeleteMembershipPermanently | 永久删除本组织成员资料 |
| hrDeletePersonPermanently | 彻底删除人员及账号 |
| hrDeletionEligible | 删除前检查已通过。删除后无法恢复，请核对下面的范围。 |
| hrDeletionBlocked | 当前不能直接删除，请查看下面列出的原因和可用处理方式。 |
| hrDeletionBlockers | 不能直接删除的原因 |
| hrDeletionCleanup | 将清理的资料 |
| hrDeletionAffectedRules | 受影响的规则 |
| hrDeletionRuleDisabled | 将停用 |
| hrDeletionRuleReferenceRemoved | 将取消人员指定 |
| hrDeletionRuleDisabledDone | 已停用 |
| hrDeletionRuleReferenceRemovedDone | 已取消人员指定 |
| hrDeletionConfirmStudentId | 输入该成员的学号，确认彻底删除 |
| hrHistoricalProfileFields | 历史资料项 |
| hrHistoricalProfileFieldsHint | 这些资料项已从当前模板中移除，保留的历史内容仍可查看。 |
| hrHistoricalPendingValue | 历史待审核内容 |
| hrProfileReviewHistory | 资料审核历史 |
| hrReviewAction | 处理结果 |
| hrReviewOperator | 处理人 |
| hrReviewReason | 处理说明 |
| hrReviewActionApproved | 审核通过 |
| hrReviewActionRejected | 审核驳回 |
| hrReviewActionMaintained | 管理员维护 |
| hrReviewActionUpdated | 资料更新 |
| hrReviewUnknownReviewer | 处理人未记录 |
| authPolicyStartTimeDefault | 00:00（时间占位，不改协议） |
| authPolicyEndTimeDefault | 23:59（同上） |
| numericZeroPlaceholder | 0 |
| numericOnePlaceholder | 1 |
| numericTenPlaceholder | 10 |
| numericHalfPlaceholder | 0.5 |
| numericHundredPlaceholder | 100 |
| verificationNumberPlaceholder | 填写申请编号，例如 SUB-20260611-001 |
| hrDeletionOrganizations | 涉及组织 |
| hrDeletionCleanupConsent | 我已核对并同意上述清理范围；尚未生效的人员指定将取消，失去全部候选人的规则将停用。 |
| hrDeletionCompleted | 永久删除已完成，请核对清理结果和需要调整的规则。 |
| hrDeletionCleaned | 已清理 |
| hrDeletionDisabledRules | 已变更的规则 |
| hrDeletionFinish | 完成 |
| hrConfirmPermanentDeletion | 确认永久删除 |
| savePassphrase | 保存口令 |
| navigationTitle | 考核评分 - WHUSU智慧工作台 |

至此整份原有源已逐项登记。待核条目和结构退回不是通过，实施必须解决；不把尚未批准的标签原样留存后宣称全量完成。新增语料在对应情境表中列出，禁止按文字相同自动跨领域复用。

## 公示规则生成与名额说明

已读取publicationAuthorization.generate：查看规则按本组织参与岗位的部门与身份类别补建；评优指定规则从已有查看规则取分类；已有组合跳过，未创建条款，不能声称已经赋予查看或评优指定权限。AdminPublicationPanel不得复用评分人分类按钮。

| 键 | 定稿 |
|---|---|
| generateViewRules | 生成查看规则 |
| generateViewRulesHelp | 按本组织参与岗位的部门和身份类别补建查看规则，已有规则保持不变。生成后，请设置每条规则可查看哪些成员的结果。 |
| generateMeritRules | 生成评优指定规则 |
| generateMeritRulesHelp | 按已有查看规则的部门和身份类别补建评优指定规则，已有规则保持不变。生成后，请设置可指定哪些成员，以及评优名额。 |

copy_1bc1338d71的完整名额说明放普通说明行，不塞进chip。若需要短标签，新quotaMaximumOnlyLabel：不要求用满名额；标签旁仍显示实际名额，完整说明用于编辑区域。

评分人分类的新增、保存使用独立键createScorerCategory“新增评分人分类”、saveScorerCategory“保存评分人分类”，不能复用人事身份类别的copy_32d3256b22/copy_04d8c1a10d。公示新增按kind复用已批准newResultViewRule“新增结果查看规则”与newMeritDesignationRule“新增评优指定规则”，不另建同义词。

评分范围批量应用不得复用copy_08b30a529d的身份类别含义。新增applyToSelectedScorerCategories“应用到所选分类”，仅用于评分人分类区域，紧邻该区域标题及已选分类摘要；若离开该上下文则用完整说明selectedScorerCategoriesSummary(count)“已选 {count} 个评分人分类”。数量放独立摘要，不拼到按钮。选择对象是部门与身份类别的组合，不是更改人事身份类别。

## 公示查看与评优指定范围分离

已核matchesMeritClause：所有评优范围均叠加所选目标身份类别；同职能组仍须同部门。不能复用查看结果的范围选项，也不能把评优all_people解释为全部身份类别。

| 新键 | 定稿 |
|---|---|
| resultViewScopeTitle | 可查看哪些成员的结果 |
| meritTargetScopeTitle | 可指定哪些成员评优 |
| resultTargetIdentity | 可查看成员的身份类别 |
| meritTargetIdentity | 评优人选的身份类别 |
| meritScopeHelp | 人选须同时符合所选身份类别和岗位范围。“同部门、同职能组”均以获得指定权的岗位为准。 |
| meritScopeOrganization | 本组织内符合所选身份类别的成员 |
| meritScopeDepartment | 与指定人同部门，且符合所选身份类别的成员 |
| meritScopeWorkGroup | 与指定人同部门、同职能组，且符合所选身份类别的成员 |
| meritScopeUnknown | 评优人选范围暂未确认 |

meritScopeOrganization对应all_people/identity_only，Department对应same_department_identity/same_department_all，WorkGroup对应same_work_group_identity/same_work_group_all；这是现有后端等价行为，不为了不同枚举编造不同含义。新编辑器不得展示六个重复选项混淆用户：前端设计需合并等价选择的展示，并保留已有合法值，不擅改历史记录；新增时使用实际接口支持的规范枚举。own_results不属于当前评优编辑合法选项，不从查看范围复制进入。view继续使用已批准的查看者范围六项，目标身份仅两个identity范围显示。

获权人群部门与身份使用此前已批准resultViewerDepartments/resultViewerIdentity及meritDesignatorDepartments/meritDesignatorIdentity。列表摘要按kind显示范围及对应身份事实，不能统一使用“查看范围”。

公示批量应用复用applySelectedViewRules“应用到所选查看规则”、applySelectedMeritRules“应用到所选评优指定规则”。确认正文另用replaceViewRuleClausesConfirm“将用当前填写的查看范围和显示方式，替换下列规则原有的设置。是否继续？”／replaceMeritRuleClausesConfirm“将用当前填写的人选范围和评优名额，替换下列规则原有的设置。是否继续？”。下方独立列出全部选中规则的人群（部门、身份类别），不能只给数量，也不暗示新增人事身份类别。

前端设计确认merit新增规范值为all_people/same_department_identity/same_work_group_identity。编辑已有identity_only或两个_all等价值时，对应类别只显示一次，保留原值；仅用户实际切换类别时换值，不因打开编辑就迁移历史设置。
