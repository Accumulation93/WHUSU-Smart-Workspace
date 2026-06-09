集合名称                         | 采样文档数 | 字段数
index.js:268 -----------------------------+-------+----
index.js:270 admin_info                   | 2     | 11 
index.js:270 admin_info_history           | 0     | 0  
index.js:270 departments                  | 10    | 7  
index.js:270 departments_history          | 0     | 0  
index.js:270 hr_info                      | 200   | 8  
index.js:270 hr_info_history              | 0     | 0  
index.js:270 hr_profile_records           | 0     | 0  
index.js:270 hr_profile_records_history   | 0     | 0  
index.js:270 hr_profile_templates         | 0     | 0  
index.js:270 hr_profile_templates_history | 0     | 0  
index.js:270 identities                   | 4     | 7  
index.js:270 identities_history           | 0     | 0  
index.js:270 organizations                | 1     | 3  
index.js:270 rate_target_rules            | 40    | 18 
index.js:270 rate_target_rules_history    | 0     | 0  
index.js:270 score_activities             | 1     | 10 
index.js:270 score_activities_history     | 0     | 0  
index.js:270 score_question_templates     | 4     | 15 
index.js:270 score_records                | 4     | 11 
index.js:270 score_records_history        | 0     | 0  
index.js:270 system_config                | 1     | 5  
index.js:270 user_info                    | 2     | 5  
index.js:270 user_info_history            | 0     | 0  
index.js:270 work_groups                  | 43    | 10 
index.js:270 work_groups_history          | 0     | 0  
index.js:274 
index.js:276 
── admin_info  (11 个字段, 采样 2 条) ──
index.js:284   字段路径                                               | 类型         | 所有类型               | 覆盖率      | 文档数     
index.js:285   ---------------------------------------------------+------------+--------------------+----------+---------
index.js:294   _id                                                | string     | string             | 100%     | 2       
index.js:296     -> 示例: 037e75a269e8bc490024c7ab7c7a0048 ; 148caf5069f2244200388fba6db77f5a
index.js:294   adminLevel                                         | string     | string             | 100%     | 2       
index.js:296     -> 示例: root_admin ; super_admin
index.js:294   bindStatus                                         | string     | string             | 100%     | 2       
index.js:296     -> 示例: active ; active
index.js:294   boundAt                                            | object     | object             | 100%     | 2       
index.js:296     -> 示例: {} ; {}
index.js:294   inviteCode                                         | string     | string             | 100%     | 2       
index.js:296     -> 示例: A9U49V ; 56AMLM
index.js:294   invitedAt                                          | object     | object             | 100%     | 1       
index.js:296     -> 示例: {}
index.js:294   name                                               | string     | string             | 100%     | 2       
index.js:296     -> 示例: 陈逸凡 ; 何承轩
index.js:294   openid                                             | string     | string             | 100%     | 2       
index.js:296     -> 示例: oZBtk3XCF7QqWUcgy_HO0AGO_Sxw ; oZBtk3WmDL93r4P5V7FoEvoBZzIo
index.js:294   studentId                                          | string     | string             | 100%     | 2       
index.js:296     -> 示例: 2023302181034 ; 2024302021053
index.js:294   updatedAt                                          | object     | object             | 100%     | 1       
index.js:296     -> 示例: {}
index.js:294   workGroup                                          | string     | string             | 100%     | 1       
index.js:276 
── admin_info_history  (0 个字段, 采样 0 条) ──
index.js:278   (空集合，无文档)
index.js:276 
── departments  (7 个字段, 采样 10 条) ──
index.js:284   字段路径                                               | 类型         | 所有类型               | 覆盖率      | 文档数     
index.js:285   ---------------------------------------------------+------------+--------------------+----------+---------
index.js:294   _id                                                | string     | string             | 100%     | 10      
index.js:296     -> 示例: ae0498ca69f1cdb1002f9bf974185cc5 ; e35392d069f1cd6e0030518456c03030
index.js:294   code                                               | string     | string             | 100%     | 10      
index.js:296     -> 示例: DEP_MOJUIWDL_TDCYXPJ6 ; DEP_MOJUHG8F_3GT47Q2B
index.js:294   createdAt                                          | object     | object             | 100%     | 10      
index.js:296     -> 示例: {} ; {}
index.js:294   description                                        | string     | string             | 100%     | 10      
index.js:294   name                                               | string     | string             | 100%     | 10      
index.js:296     -> 示例: 新闻宣传部（创意设计工作） ; 综合事务部（人力资源管理工作）
index.js:294   sortOrder                                          | number     | number             | 100%     | 10      
index.js:296     -> 示例: 0 ; 0
index.js:294   updatedAt                                          | object     | object             | 100%     | 10      
index.js:296     -> 示例: {} ; {}
index.js:276 
── departments_history  (0 个字段, 采样 0 条) ──
index.js:278   (空集合，无文档)
index.js:276 
── hr_info  (8 个字段, 采样 200 条) ──
index.js:284   字段路径                                               | 类型         | 所有类型               | 覆盖率      | 文档数     
index.js:285   ---------------------------------------------------+------------+--------------------+----------+---------
index.js:294   _id                                                | string     | string             | 100%     | 200     
index.js:296     -> 示例: 9cd783ff69f1ea2700348e434eaeec19 ; 743cebf869f1ea280031304a1069648a
index.js:294   createdAt                                          | object     | object             | 100%     | 200     
index.js:296     -> 示例: {} ; {}
index.js:294   departmentId                                       | string     | string             | 100%     | 200     
index.js:296     -> 示例: e35392d069f1cd6e0030518456c03030 ; e35392d069f1cd6e0030518456c03030
index.js:294   identityId                                         | string     | string             | 100%     | 200     
index.js:296     -> 示例: e35392d069f1cd73003051b706af0e3e ; e35392d069f1cd73003051b706af0e3e
index.js:294   name                                               | string     | string             | 100%     | 200     
index.js:296     -> 示例: 马青鹏 ; 王子源
index.js:294   studentId                                          | string     | string             | 100%     | 200     
index.js:296     -> 示例: 2025302211127 ; 2025300002090
index.js:294   updatedAt                                          | object     | object             | 100%     | 200     
index.js:296     -> 示例: {} ; {}
index.js:294   workGroupId                                        | string     | string             | 100%     | 200     
index.js:296     -> 示例: 399cd1a569f1cd6f00305f4847bc1b07 ; 399cd1a569f1cd6f00305f4847bc1b07
index.js:276 
── hr_info_history  (0 个字段, 采样 0 条) ──
index.js:278   (空集合，无文档)
index.js:276 
── hr_profile_records  (0 个字段, 采样 0 条) ──
index.js:278   (空集合，无文档)
index.js:276 
── hr_profile_records_history  (0 个字段, 采样 0 条) ──
index.js:278   (空集合，无文档)
index.js:276 
── hr_profile_templates  (0 个字段, 采样 0 条) ──
index.js:278   (空集合，无文档)
index.js:276 
── hr_profile_templates_history  (0 个字段, 采样 0 条) ──
index.js:278   (空集合，无文档)
index.js:276 
── identities  (7 个字段, 采样 4 条) ──
index.js:284   字段路径                                               | 类型         | 所有类型               | 覆盖率      | 文档数     
index.js:285   ---------------------------------------------------+------------+--------------------+----------+---------
index.js:294   _id                                                | string     | string             | 100%     | 4       
index.js:296     -> 示例: e35392d069f1cd73003051b706af0e3e ; 482e95cf69f1cd6e002f7c7d7a58342c
index.js:294   code                                               | string     | string             | 100%     | 4       
index.js:296     -> 示例: IDT_MOJUHK3S_5IUJV1R4 ; IDT_MOJUHGG3_1YVSSS46
index.js:294   createdAt                                          | object     | object             | 100%     | 4       
index.js:296     -> 示例: {} ; {}
index.js:294   description                                        | string     | string             | 100%     | 4       
index.js:294   name                                               | string     | string             | 100%     | 4       
index.js:296     -> 示例: 未来学院学员 ; 部门负责人
index.js:294   sortOrder                                          | number     | number             | 100%     | 4       
index.js:296     -> 示例: 0 ; 0
index.js:294   updatedAt                                          | object     | object             | 100%     | 4       
index.js:296     -> 示例: {} ; {}
index.js:276 
── identities_history  (0 个字段, 采样 0 条) ──
index.js:278   (空集合，无文档)
index.js:276 
── organizations  (3 个字段, 采样 1 条) ──
index.js:284   字段路径                                               | 类型         | 所有类型               | 覆盖率      | 文档数     
index.js:285   ---------------------------------------------------+------------+--------------------+----------+---------
index.js:294   _id                                                | string     | string             | 100%     | 1       
index.js:296     -> 示例: 948392db69f1ca2900307d510dc8881f
index.js:294   createdAt                                          | object     | object             | 100%     | 1       
index.js:296     -> 示例: {}
index.js:294   name                                               | string     | string             | 100%     | 1       
index.js:296     -> 示例: 武汉大学第四十三届学生会
index.js:276 
── rate_target_rules  (18 个字段, 采样 40 条) ──
index.js:284   字段路径                                               | 类型         | 所有类型               | 覆盖率      | 文档数     
index.js:285   ---------------------------------------------------+------------+--------------------+----------+---------
index.js:294   _id                                                | string     | string             | 100%     | 40      
index.js:296     -> 示例: e35392d069f1db100031b9482f739398 ; 9756e76169f1db10002ed11c4de766e2
index.js:294   activityId                                         | string     | string             | 100%     | 40      
index.js:296     -> 示例: 8e40b4e269f1dafe0031d36d1495aecf ; 8e40b4e269f1dafe0031d36d1495aecf
index.js:294   clauses                                            | array      | array              | 100%     | 40      
index.js:296     -> 示例: [{scopeType, targetIdentityId, requireAllComplete, ...}] ; [{scopeType, targetIdentityId, requireAllComplete, ...}]
index.js:294   clauses[]                                          | object     | object             | 100%     | 60      
index.js:296     -> 示例: {scopeType, targetIdentityId, requireAllComplete, ...} ; {scopeType, targetIdentityId, requireAllComplete, ...}
index.js:294   clauses[].requireAllComplete                       | boolean    | boolean            | 100%     | 60      
index.js:296     -> 示例: false ; false
index.js:294   clauses[].scopeType                                | string     | string             | 100%     | 60      
index.js:296     -> 示例: same_department_identity ; same_department_identity
index.js:294   clauses[].targetIdentityId                         | string     | string             | 100%     | 60      
index.js:296     -> 示例: eb87832669f1cd6e00309eb47635a435 ; eb87832669f1cd6e00309eb47635a435
index.js:294   clauses[].templateConfigs                          | array      | array              | 100%     | 60      
index.js:296     -> 示例: [{templateId, weight, sortOrder}, ...] ; [{templateId, weight, sortOrder}, ...]
index.js:294   clauses[].templateConfigs[]                        | object     | object             | 100%     | 90      
index.js:296     -> 示例: {templateId, weight, sortOrder} ; {templateId, weight, sortOrder}
index.js:294   clauses[].templateConfigs[].sortOrder              | number     | number             | 100%     | 90      
index.js:296     -> 示例: 1 ; 2
index.js:294   clauses[].templateConfigs[].templateId             | string     | string             | 100%     | 90      
index.js:296     -> 示例: 99fa253a69e975a60037c6eb3fe5addc ; 18b1344f69e99155003c042d2fea42dc
index.js:294   clauses[].templateConfigs[].weight                 | number     | number             | 100%     | 90      
index.js:296     -> 示例: 1 ; 0.5
index.js:294   createdAt                                          | object     | object             | 100%     | 40      
index.js:296     -> 示例: {} ; {}
index.js:294   isActive                                           | boolean    | boolean            | 100%     | 40      
index.js:296     -> 示例: true ; true
index.js:294   scorerDepartmentId                                 | string     | string             | 100%     | 40      
index.js:296     -> 示例: 9cd783ff69f1cda600311e0928e77881 ; e35392d069f1cd6e0030518456c03030
index.js:294   scorerIdentityId                                   | string     | string             | 100%     | 40      
index.js:296     -> 示例: 482e95cf69f1cd6e002f7c7d7a58342c ; 482e95cf69f1cd6e002f7c7d7a58342c
index.js:294   scorerKey                                          | string     | string             | 100%     | 40      
index.js:296     -> 示例: 9cd783ff69f1cda600311e0928e77881::482e95cf69f1cd6e002f7c7d7a58342c ; e35392d069f1cd6e0030518456c03030::482e95cf69f1cd6e002f7c7d7a58342c
index.js:294   updatedAt                                          | object     | object             | 100%     | 40      
index.js:296     -> 示例: {} ; {}
index.js:276 
── rate_target_rules_history  (0 个字段, 采样 0 条) ──
index.js:278   (空集合，无文档)
index.js:276 
── score_activities  (10 个字段, 采样 1 条) ──
index.js:284   字段路径                                               | 类型         | 所有类型               | 覆盖率      | 文档数     
index.js:285   ---------------------------------------------------+------------+--------------------+----------+---------
index.js:294   _id                                                | string     | string             | 100%     | 1       
index.js:296     -> 示例: 8e40b4e269f1dafe0031d36d1495aecf
index.js:294   createdAt                                          | object     | object             | 100%     | 1       
index.js:296     -> 示例: {}
index.js:294   createdBy                                          | string     | string             | 100%     | 1       
index.js:296     -> 示例: 037e75a269e8bc490024c7ab7c7a0048
index.js:294   description                                        | string     | string             | 100%     | 1       
index.js:294   endDate                                            | string     | string             | 100%     | 1       
index.js:296     -> 示例: 2026-05-29
index.js:294   isCurrent                                          | boolean    | boolean            | 100%     | 1       
index.js:296     -> 示例: true
index.js:294   name                                               | string     | string             | 100%     | 1       
index.js:296     -> 示例: 第二学期工作考核
index.js:294   startDate                                          | string     | string             | 100%     | 1       
index.js:296     -> 示例: 2026-04-29
index.js:294   updatedAt                                          | object     | object             | 100%     | 1       
index.js:296     -> 示例: {}
index.js:294   updatedBy                                          | string     | string             | 100%     | 1       
index.js:296     -> 示例: 037e75a269e8bc490024c7ab7c7a0048
index.js:276 
── score_activities_history  (0 个字段, 采样 0 条) ──
index.js:278   (空集合，无文档)
index.js:276 
── score_question_templates  (15 个字段, 采样 4 条) ──
index.js:284   字段路径                                               | 类型         | 所有类型               | 覆盖率      | 文档数     
index.js:285   ---------------------------------------------------+------------+--------------------+----------+---------
index.js:294   _id                                                | string     | string             | 100%     | 4       
index.js:296     -> 示例: 99fa253a69e975a60037c6eb3fe5addc ; 18b1344f69e99155003c042d2fea42dc
index.js:294   createdAt                                          | object     | object             | 100%     | 4       
index.js:296     -> 示例: {} ; {}
index.js:294   createdBy                                          | string     | string             | 100%     | 4       
index.js:296     -> 示例: 037e75a269e8bc490024c7ab7c7a0048 ; 037e75a269e8bc490024c7ab7c7a0048
index.js:294   description                                        | string     | string             | 100%     | 4       
index.js:294   name                                               | string     | string             | 100%     | 4       
index.js:296     -> 示例: 通用_部门负责人对职委 ; 通用_公共对职委
index.js:294   questions                                          | array      | array              | 100%     | 4       
index.js:296     -> 示例: [{question, scoreLabel, minValue, ...}, ...] ; [{question, scoreLabel, minValue, ...}, ...]
index.js:294   questions[]                                        | object     | object             | 100%     | 28      
index.js:296     -> 示例: {question, scoreLabel, minValue, ...} ; {question, scoreLabel, minValue, ...}
index.js:294   questions[].maxValue                               | number     | number             | 100%     | 28      
index.js:296     -> 示例: 5 ; 5
index.js:294   questions[].minValue                               | number     | number             | 100%     | 28      
index.js:296     -> 示例: 0 ; 0
index.js:294   questions[].question                               | string     | string             | 100%     | 28      
index.js:296     -> 示例: 会议出勤率 ; 迟到情况
index.js:294   questions[].scoreLabel                             | string     | string             | 100%     | 28      
index.js:296     -> 示例: 每次会议均到场5分；
1-2次会议请假不扣分，请假3次以上，每一次请假扣1分；
如有无故缺席、临时请假等未能及时请假的行为，一次扣2分，扣完为止。 ; 无迟到情况5分；
迟到一次扣1分，扣完为止。
index.js:294   questions[].startValue                             | number     | number             | 100%     | 28      
index.js:296     -> 示例: 0 ; 0
index.js:294   questions[].stepValue                              | number     | number             | 100%     | 28      
index.js:296     -> 示例: 1 ; 1
index.js:294   updatedAt                                          | object     | object             | 100%     | 4       
index.js:296     -> 示例: {} ; {}
index.js:294   updatedBy                                          | string     | string             | 100%     | 4       
index.js:296     -> 示例: 037e75a269e8bc490024c7ab7c7a0048 ; 6ded7a7769eb01f9006604a468b84a8f
index.js:276 
── score_records  (11 个字段, 采样 4 条) ──
index.js:284   字段路径                                               | 类型         | 所有类型               | 覆盖率      | 文档数     
index.js:285   ---------------------------------------------------+------------+--------------------+----------+---------
index.js:294   _id                                                | string     | string             | 100%     | 4       
index.js:296     -> 示例: d967c8d469f23e59003dbc0746335e02 ; 399cd1a569f312f00053a2861feedcbc
index.js:294   activityId                                         | string     | string             | 100%     | 4       
index.js:296     -> 示例: 8e40b4e269f1dafe0031d36d1495aecf ; 8e40b4e269f1dafe0031d36d1495aecf
index.js:294   answers                                            | array      | array              | 100%     | 4       
index.js:296     -> 示例: [{questionIndex, score}, ...] ; [{questionIndex, score}, ...]
index.js:294   answers[]                                          | object     | object             | 100%     | 40      
index.js:296     -> 示例: {questionIndex, score} ; {questionIndex, score}
index.js:294   answers[].questionIndex                            | number     | number             | 100%     | 40      
index.js:296     -> 示例: 0 ; 1
index.js:294   answers[].score                                    | number     | number             | 100%     | 40      
index.js:296     -> 示例: 3 ; 2
index.js:294   ruleId                                             | string     | string             | 100%     | 4       
index.js:296     -> 示例: 482e95cf69f1db100030e9bf2148e00a ; 9cd783ff69f1db100032d4b06c0ffea0
index.js:294   scorerId                                           | string     | string             | 100%     | 4       
index.js:296     -> 示例: 97b16bdb69f1ea1e0032e2715208e2c3 ; 948392db69f1ea1e0033fa0f14eb4566
index.js:294   submittedAt                                        | object     | object             | 100%     | 4       
index.js:296     -> 示例: {} ; {}
index.js:294   targetId                                           | string     | string             | 100%     | 4       
index.js:296     -> 示例: 399cd1a569f1ea210033d9785dc817dd ; 948392db69f1ea230033fa4357587925
index.js:294   templateConfigSignature                            | string     | string             | 100%     | 4       
index.js:296     -> 示例: 99fa253a69e975a60037c6eb3fe5addc[0:0:5:1,0:0:5:1,0:0:10:0.5,0:0:5:0.5,0:0:5:0.5]... ; 293c767c69eb5926006e087f6cf90cd2[0:0:10:1,0:0:5:1,0:0:10:0.5]|e20fd67f69eb5bc700...
index.js:276 
── score_records_history  (0 个字段, 采样 0 条) ──
index.js:278   (空集合，无文档)
index.js:276 
── system_config  (5 个字段, 采样 1 条) ──
index.js:284   字段路径                                               | 类型         | 所有类型               | 覆盖率      | 文档数     
index.js:285   ---------------------------------------------------+------------+--------------------+----------+---------
index.js:294   _id                                                | string     | string             | 100%     | 1       
index.js:296     -> 示例: default
index.js:294   createdAt                                          | object     | object             | 100%     | 1       
index.js:296     -> 示例: {}
index.js:294   currentOrganization                                | string     | string             | 100%     | 1       
index.js:296     -> 示例: 948392db69f1ca2900307d510dc8881f
index.js:294   timezone                                           | number     | number             | 100%     | 1       
index.js:296     -> 示例: 8
index.js:294   updatedAt                                          | object     | object             | 100%     | 1       
index.js:296     -> 示例: {}
index.js:276 
── user_info  (5 个字段, 采样 2 条) ──
index.js:284   字段路径                                               | 类型         | 所有类型               | 覆盖率      | 文档数     
index.js:285   ---------------------------------------------------+------------+--------------------+----------+---------
index.js:294   _id                                                | string     | string             | 100%     | 2       
index.js:296     -> 示例: 148caf5069f222fc00386b7a695f91a8 ; d967c8d469f23203003bf10c0739734c
index.js:294   createdAt                                          | object     | object             | 100%     | 2       
index.js:296     -> 示例: {} ; {}
index.js:294   hrId                                               | string     | string             | 100%     | 2       
index.js:296     -> 示例: 948392db69f1ea1e0033fa0f14eb4566 ; 97b16bdb69f1ea1e0032e2715208e2c3
index.js:294   openid                                             | string     | string             | 100%     | 2       
index.js:296     -> 示例: oZBtk3WmDL93r4P5V7FoEvoBZzIo ; oZBtk3XCF7QqWUcgy_HO0AGO_Sxw
index.js:294   updatedAt                                          | object     | object             | 100%     | 2       
index.js:296     -> 示例: {} ; {}
index.js:276 
── user_info_history  (0 个字段, 采样 0 条) ──
index.js:278   (空集合，无文档)
index.js:276 
── work_groups  (10 个字段, 采样 43 条) ──
index.js:284   字段路径                                               | 类型         | 所有类型               | 覆盖率      | 文档数     
index.js:285   ---------------------------------------------------+------------+--------------------+----------+---------
index.js:294   _id                                                | string     | string             | 100%     | 43      
index.js:296     -> 示例: 98d3bbc169f1cd72003115603f66baca ; 9cd783ff69f1cd9a00311d736340bd78
index.js:294   code                                               | string     | string             | 100%     | 43      
index.js:296     -> 示例: WG_MOJUHJIY_BLU0E7U9 ; WG_MOJUIE0L_AY7GIEO5
index.js:294   createdAt                                          | object     | object             | 100%     | 43      
index.js:296     -> 示例: {} ; {}
index.js:294   departmentCode                                     | string     | string             | 100%     | 43      
index.js:296     -> 示例: DEP_MOJUHG8F_3GT47Q2B ; DEP_MOJUID2P_0HKGXUEM
index.js:294   departmentId                                       | string     | string             | 100%     | 43      
index.js:296     -> 示例: e35392d069f1cd6e0030518456c03030 ; 611e990a69f1cd98002f4cb95cad3954
index.js:294   departmentName                                     | string     | string             | 100%     | 43      
index.js:296     -> 示例: 综合事务部（人力资源管理工作） ; 外联部（港澳台交流与事务工作）
index.js:294   description                                        | string     | string             | 100%     | 43      
index.js:294   name                                               | string     | string             | 100%     | 43      
index.js:296     -> 示例: 总校培训组 ; 技术组
index.js:294   sortOrder                                          | number     | number             | 100%     | 43      
index.js:296     -> 示例: 0 ; 0
index.js:294   updatedAt                                          | object     | object             | 100%     | 43      
index.js:296     -> 示例: {} ; {}
index.js:276 
── work_groups_history  (0 个字段, 采样 0 条) ──
index.js:278   (空集合，无文档)