-- 重新评分只保留当前结果；部署系统在执行破坏性迁移前生成完整数据库备份。
DELETE FROM absolute_time_source_registry
 WHERE table_name = 'score_record_revisions';

DROP TABLE IF EXISTS score_record_revisions;
