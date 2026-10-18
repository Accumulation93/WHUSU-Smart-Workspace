# 小程序多岗位导入 V2

本期入口为人事信息中的人员导入，页面 `miniprogram/subpackages/scoring/pages/hrImport/hrImport`。共用服务端提供接口，网页界面尚未接入。以下描述对应 V2 实现，不能套用于已退役的单岗位算法。

## 管理员流程

1. 选择 CSV/XLSX 和工作表，确认列对应。姓名、学号必需；最多 5,000 行、200 列。解析时保留原表行号，空行不会改变问题定位。
2. 按问题类别处理，查看原值、新值和来源行。同一行可以出现在多个类别，所有选择共享同一份决定。分类中的同一原因、同一资料项排在一起，再按原表行号排序。
3. 使用本次变更核对新增成员、岗位和资料；按人员查看是辅助入口，也可打开行编辑器明确清空职能组或非必填资料。
4. 处理或排除全部问题后确认整批执行。断网先查询原请求，未找到时才重试原请求；不得重新生成批次编号。

空白和未映射列不修改旧值，非空填空默认执行；不同非空值必须保留或替换。清空是单独决定。新成员允许没有岗位；部分岗位信息必须明确补齐或忽略。完整组合不同要求新增或选择已有岗位；三列职能组表按组所属部门筛选，多个岗位必须明确选择。维护表识别码只允许精确定位，不因失效而回退。

有效资料只写当前组织的生效值，待审核值和待审核状态保持不变。导入不修改姓名学号，不合并自然人，不恢复离任成员，不删除、停用或合并岗位。

## 共用接口

接口均为已认证 POST `/api/<名称>`；操作者、组织、工作角色来自统一认证。除岗位维护表导出使用 `hr.people` 外均要求 `hr.import`。创建分类另外要求 `hr.departments`、`hr.identities`、`hr.work_groups` 对应权限；执行事务中重新读取权限。学号只在此人事管理链路返回，不进入通用人员选择器。

| 接口 | 请求 | 成功响应 |
| --- | --- | --- |
| `getHrImportMetadata` | `{}` | `fields, departments, identities, workGroups`，只含当前有效资料模板 |
| `previewHrTableImport` | 下方 V2 请求 | `previewId, summary, categories, decisions` |
| `getHrImportPreview` | `previewId, view, category?, offset?` | `items, total, offset, hasMore`；每次最多 40 项 |
| `getHrImportPreview` | `previewId, rowNumber` | `row`，含当前值、决定和岗位候选；候选不含学号 |
| `importHrTable` | `schemaVersion:2, previewId, requestId` | `previewId, requestId, summary, saved` |
| `getHrImportResult` | `requestId` | 同次执行结果，未完成/未找到为 `import_not_found` |
| `exportHrAssignmentTable` | `includeProfile?:boolean, format?:'xlsx'` | 不指定格式返回 `headers, rows, instructions`；XLSX 返回 `fileBase64, extension, instructions` |
| `exportHrImportIssues` | `previewId, format?:'xlsx'` | 同上表格结构，内容为分类、原因、原表行号及处理状态 |

所有成功响应有 `status:'success'`。`view` 为 `open`、`resolved`、`changes`、`rows`、`excluded`；前两者可按 `category` 筛选。`offset` 为非负整数。前端只渲染分页返回项，选中状态按受影响项更新，切换分类保留浏览位置；重新预览使旧列表失效。

```json
{
  "schemaVersion": 2,
  "headers": ["姓名", "学号", "职能组"],
  "rows": [["示例成员", "001", "示例组"]],
  "rowNumbers": [2],
  "basicMapping": {"name": 0, "studentId": 1, "workGroup": 2},
  "extensionMapping": [],
  "defaultNature": "staff",
  "previousPreviewId": "",
  "decisions": {"rows": {}, "dictionaries": [], "sources": {}}
}
```

`rowNumbers` 省略时按第 2 行起编号，提供时必须递增且与数据行等长。基础列键为 `name/studentId/nature/department/identity/workGroup/assignmentId/assignmentVersion`；补充资料映射为 `{fieldId,columnIndex}`，只可指向当前有效模板。岗位性质枚举为 `staff/liaison/other`，也识别维护表中的中文名称。姓名和学号分别匹配，规范化学号采用去首尾空格及小写。

### 决定与问题操作

问题卡返回稳定 `id`、`category`、`reason`、`rowNumbers`、可选 `targetId/targetLabel/field/fieldLabel`、`before/after`、`blocking`、`state`、`actions`。`state` 为 `open/resolved`，不能从中文提示推断类别。前端应按服务端 actions 展示操作，不自动替管理员决定岗位。

`decisions.rows[原表行号]` 支持：

- `exclude:true`：明确排除整行，岗位和资料一起不执行。
- `mode:'person'|'new'|'update'`：仅维护成员资料、新增岗位、修改岗位；`update` 配合 `assignmentIds`，可同一人多个岗位。
- `values:{nature,department,identity,workGroup}`：管理员修正该行岗位内容。
- `profileValues:{资料编号:值}`：修正映射资料。
- `policies:{键:'keep'|'replace'|'clear'}`：岗位键为 `岗位编号:属性名`，资料键为资料编号；通用属性键用于行编辑器的明确清空。
- `acceptVersion`：确认识别码目标的当前版本，必须使用 `rebase` action 返回的值。

`decisions.dictionaries` 保存已确认的分类键；`decisions.sources[来源键]` 保存选定原表行号。服务端 action 类型为 `policy/mode/select/edit/source/rebase/dictionary/exclude/undo/refresh`。`undo` 根据 `policyKey/dictionaryKey/sourceKey/version/assignment` 只撤销对应选择；没有专项键时重置相关行。`refresh` 是执行发现并发变更后返回的“数据已变化”问题操作，必须重新预览整批内容。

每次修改决定重新预览，并采用响应中的 `decisions`。如果业务数据变化，服务端移除受影响人员的旧选择和来源选择，并重新要求确认分类创建；未受影响的人员选择保留。不得用旧前端副本覆盖服务端修正后的决定。

### 固定分类顺序

| 键 | 管理员看到的类别 |
| --- | --- |
| identity_conflict | 人员身份不一致 |
| unavailable | 成员或岗位当前不可操作 |
| ambiguous | 岗位无法唯一确定 |
| intent | 需要确定新增还是修改 |
| incomplete | 岗位信息不完整 |
| group_mismatch | 部门与职能组不匹配 |
| dictionary | 需要创建新分类 |
| value_conflict | 已有值与导入值不同 |
| row_conflict | 同一人员或岗位的多行内容冲突 |
| invalid | 资料格式或必填项不符合要求 |
| duplicate | 修改后会出现重复岗位 |
| stale | 数据已变化，需要重新核对 |

分类返回 `count`（待处理问题）、`rowCount`（待处理的去重行数）、`resolved` 和 `total`。汇总为 `problemCount/problemRowCount/resolvedCount/newMembers/newAssignments/updatedAssignments/profileValues/newDictionaries/excludedRows/totalRows/canExecute`。问题数、行数和人数不能混用。

### 错误与兼容性

缺省或 null 的 schemaVersion 保持旧版导入模型、权限与错误格式；schemaVersion=2 使用本页流程，其他显式版本返回 import_upgrade_required。其他可预期状态包括 `invalid_import`、`import_expired`、`import_problems`、`import_stale`、`import_request_conflict`、`import_not_found`、`organization_forbidden`、`permission_denied`。执行后遇到 `import_stale` 必须重新预览；未知失败也须先查询原请求，不自动新建批次。

## 保存、版本与清理

迁移 `20261009220000_hr_import_v2.sql` 新建 `hr_import_previews`。预览计划绑定账号自然人、组织和工作角色，24 小时到期；成功结果保存 30 天。只保存解析后的必要单元格和计算计划，不保存原始工作簿，不在日志输出学号或整行数据。每日维护及预览入口按每批 200 条删除过期计划。

执行只接受服务端已存计划；事务中锁定计划、人员删除屏障、分类锁及相关记录，核对人员、岗位、字典、模板、权限与版本后统一写入。分类、成员、岗位、资料维护事件及成功结果同事务完成。失败全部回滚。请求唯一键为组织、账号自然人和请求号；同预览再次执行返回原结果，同请求对应其他计划拒绝。

岗位直接写 `membership_assignments`，再刷新兼容展示字段。已有 `cacheVersionContract.json` 登记了 persons、organization_memberships、membership_assignments、字典和资料记录的触发器，业务写入与版本递增同事务；预览表不参与业务领域缓存，不新增无关触发器。成功后客户端作废消息缓存并发出 `hr:changed`；人事入口在返回时重新初始化目录和分类。

岗位维护表一岗一行，无岗位成员保留一行，可附带生效资料。Excel 所有单元格按字符串写入，保留前导零，不写公式单元格。系统识别码和原始版本必须保留；删行不删除、空白不清空。大名单直接由共用服务端生成文件，不在小程序上传整份导出数据二次加工。

## 2026-10-09 验证记录

- `server/test/hrImportPlan.test.js`：18 组规划用例通过，涵盖三列匹配、多岗位、冲突、清空、字典权限、识别码版本、源行选择、排除、组合意图、原表行号、重复岗位及多目标部门校验；5,000 行纯规划约 10 毫秒，仅为本机算法测量。
- `server/test/hrImportPage.test.js`：在没有 Buffer、atob、btoa 的环境执行真实页面请求构建、选择撤销、兼容批量操作、文件选择临时隐藏及超时原请求重试。
- `server/test/hrImportV2Integration.test.js`：隔离 MySQL 完成真实页面参数→预览→执行→回读，并通过真实 HTTP 人事路由和数据库授权；覆盖整批拒绝、注入事务失败回滚、原请求重试、多岗和新分类创建、待审核值不变、Excel 导出回导、前导零、并发重复请求、权限撤销、过期清理和迁移 plan。5,000 个学号查询 6 次（没有已有人员的场景），不代表 5,000 行写入或设备渲染耗时。
- 全部 180 个服务端测试文件通过；27 个小程序页面注册与兼容性检查通过，47 个 WXML 用本机 Glass-Easel 生成并解析成功。严格 UI、弹窗、键盘、按钮、文案、语言副本、权限、租户 SQL、作用域与性能检查通过。
- 真实微信编译：开发者工具 Stable 2.01.2510290 的 `auto-preview` 已成功，主包 581,208 字节，6 个分包及主包合计 2,369,329 字节。实际打开导入页发现 4 处 `&amp;&amp;` 无法作为 WXML 表达式运算符，已逐处改为 `&&`，并在页面回归测试增加拦截；仅 Glass-Easel 静态生成没有拦住该差异。
- 现场进度：手机模拟器实际打开映射页、分类列表和岗位选择器；43 行夹具显示 43 个问题（42 个身份冲突及 1 个岗位歧义）。官方自动化模拟请求的跨环境数组引发候选类型异常，不能据此确认真实网络响应下的岗位选择通过，已准备本机 HTTP 与隔离 MySQL 验收副本。副本目前等待用户在开发者工具确认“信任并运行”。Pad 竖屏、Pad 横屏、键盘、清空、排除、完整执行及实体设备触控仍未完成现场验证。生产未创建测试数据。
- 上述为2026-10-09历史验证状态，不能代表当前发布。网页界面不在本期范围。

## 2026-10-18 接口发布不一致修复

生产11:08:19至11:08:40四次getHrImportMetadata均404。主项目入口已进入V2，但5个新增路由、2个版本化处理入口及建表迁移尚未发布。补齐整套依赖并保留旧客户端导入，不能只补metadata或要求用户反复重开。

本轮真实页面参数、HTTP与隔离数据库验证新旧导入保存回读、权限拒绝及事务回滚；主项目微信主包与6分包编译2,578,703字节。用户要求完整本机CI，结果与生产发布按最终提交另核对。实体手机与Pad尚未完成现场验证，微信正式版不自动发布。

## 2026-10-18 问题解释与分类定位修复

表头支持身份/身份类别、职能组/职能组（全称）/工作分工（职能组）/工作分工等明确别名，统一空白与中英文括号，不采用猜测式模糊匹配。Excel错误学号在归并人员前拒绝，保留源行号并要求修正原表，禁止多个错误单元格合并为同一人员。

岗位意图显示现有岗位与本行内容，点明差异字段；未登记名称说明具体分类及所属部门；缺失字段指出是否尚未映射表格列。没有比较内容的问题不再显示两份未填写。分类切换定位明细标题，重新访问缓存也同步标题并从开头查看。

本轮21组规划、页面专项及13组隔离数据库集成验证通过，真实保存后回读与回滚均覆盖。用户选择仅针对性检查，未运行全量CI；实体手机及Pad尚未现场验证。

本轮用户确认主项目手动预览生成二维码成功；CLI仍未返回。网页构建及87项视觉一致性检查通过。已有预览保存的是生成时的计划，重新选择原表并生成预览后使用新的判断与说明。
