'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.resolve(__dirname, '../src/modules/scoring/routes/publications.js'),
  'utf8'
);

const unsafeContracts = [
  /pub_view_rule_clauses WHERE rule_id = \? ORDER BY/i,
  /pub_merit_rule_clauses WHERE rule_id = \? ORDER BY/i,
  /pub_(?:view|merit)_rule_clauses WHERE rule_id IN \(\$\{[^}]+\}\) ORDER BY/i,
  /pub_merit_rule_clauses pmrc[\s\S]{0,240}WHERE pmrc\.id = \?(?![\s\S]{0,100}pmrc\.org_id)/i,
  /DELETE FROM merit_list_designations WHERE clause_id=\?(?! AND org_id)/i,
  /DELETE FROM pub_(?:view|merit)_rule_clauses WHERE (?:rule_id|id)=\?(?! AND org_id)/i,
  /UPDATE pub_merit_rule_clauses SET[\s\S]{0,240}WHERE id=\?(?! AND org_id)/i
];

unsafeContracts.forEach((pattern) => {
  assert.strictEqual(
    pattern.test(source),
    false,
    '公示/评优子表查询不得脱离 org_id 或父记录边界：' + pattern
  );
});

assert(
  source.includes("pmr.publication_id = ?")
    && source.includes("pmrc.rule_id = ?")
    && source.includes("quotaRows.length !== clauseIds.length"),
  '客户端提交的评优条款集合必须同时校验组织、父规则、公示记录和集合完整性'
);

assert(
  source.includes('matchingMeritClauses')
    && source.includes('clausesByRule')
    && source.includes('ORDER BY rule_id, sort_order'),
  '公示条款读取应采用按组织批量查询，避免按规则 N+1 查询'
);

console.log('公示与评优组织隔离回归测试通过');
