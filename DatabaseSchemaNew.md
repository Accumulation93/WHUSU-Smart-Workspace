# WHUSU Smart Workspace 当前 MySQL 模型说明

更新时间：2026-08-15

## 权威来源

本文件是领域索引，不复制完整 DDL。当前结构以 [server/db/init.sql](server/db/init.sql) 加上 [server/db/deploy/](server/db/deploy/) 中按账本执行的幂等迁移为准；表数量、字段数量和索引不要从本文件推断。

## 设计边界

- 业务实体主键通常使用 `VARCHAR(64)` 和 `generateId()`；部署元数据表 `schema_migrations` 使用迁移账本需要的键长度，是明确例外。
- 组织域表必须带组织边界并经过当前组织授权；全局组织表、认证表和部署元数据表按各自模型校验。
- 关系型核心实体使用独立表和外键；审批流状态、签名快照和部分历史兼容数据可以按 JSON 快照保存，并非“所有 JSON 都拆表”。
- 迁移只新增时间戳命名的幂等 SQL，不修改已执行迁移。

## 领域表索引

| 领域 | 主要表/表族 |
| --- | --- |
| 组织与架构 | `organizations`、`system_config`、`departments`、`identities`、`work_groups` |
| 统一身份与认证 | `persons`、`organization_memberships`、`membership_assignments`、`accounts`、`account_wechat_bindings`、`admin_grants`、`auth_sessions`、`auth_bootstrap_sessions`、`identity_claim_requests`、`identity_verification_tokens`、`identity_verification_invites`、`account_recovery_credentials`、`account_recovery_requests`、`auth_policy`、`auth_audit_events` |
| 兼容人事与管理员 | `hr_info`、`user_info`、`admin_info`、`auth_challenges`、`admin_permission_overrides`、`admin_permission_audit_logs` |
| 评分与公示 | `score_activities`、`score_question_templates`、`score_questions`、`score_template_order`、`rate_target_rules`、`rate_rule_clauses`、`clause_template_configs`、`score_records`、`score_answers`、`result_publications`、`pub_view_rules`、`pub_view_rule_clauses`、`pub_grade_bands`、`pub_merit_rules`、`pub_merit_rule_clauses`、`merit_list_designations` |
| 人事资料 | `hr_profile_templates`、`hr_profile_template_fields`、`org_hr_profile_template_snapshots`、`org_hr_profile_template_snapshot_fields`、`org_hr_profile_template_switches`、`org_hr_profile_template_switch_actions`、`hr_profile_records`、`hr_profile_record_values`、`person_profile_values`、`person_profile_value_history` |
| 审核、签名与通知 | `audit_flow_templates`、`audit_flow_template_steps`、`audit_flow_template_step_conditions`、`signature_templates`、`stamps`、`identity_stamp_assignments`、`audit_submissions`、`audit_submission_files`、`audit_submission_steps`、`audit_submission_signatures`、`audit_verification_permissions`、`audit_events`、`audit_read_cursors`、`notifications`、`notification_outbox`、`audit_number_sequences` |
| 场地借用 | `venues`、`venue_open_rules`、`venue_activity_rules`、`venue_booking_rules`、`venue_booking_policies`、`venue_approval_flows`、`venue_approval_flow_steps`、`venue_approval_flow_step_rules`、`venue_bookings`、`venue_booking_purposes` |
| 平台基础设施 | `request_deduplication`、`_shared_cache`、`identity_migration_guards` |

## 关键约束

- 场地审批历史不是独立历史表：服务端从当前组织的 `venue_bookings` 记录匹配审批快照或兼容旧字段，并先校验当前操作者、组织和身份。
- PDF 签名证书链配置和信任状态迁移见 [docs/pdf-signing-trust.md](docs/pdf-signing-trust.md)；不能把自签名证书当作公共可信证书。
- 迁移部署使用 `schema_migrations` 账本、迁移前快照和失败回退；生产禁止直接运行早期兼容迁移脚本追赶结构。
