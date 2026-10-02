'use strict';

// 补充资料值写入改为多值批量插入：语义必须与逐条插入完全一致（含空值归一与唯一约束口径），
// 只是把 N 条语句压成少量多值语句，并按 200 行分批避免超出 max_allowed_packet。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

function loadIsolated(relative, dependencies) {
  const filename = path.resolve(__dirname, relative);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = (name) => (Object.prototype.hasOwnProperty.call(dependencies, name)
    ? dependencies[name] : originalRequire(name));
  loaded._compile(fs.readFileSync(filename, 'utf8'), filename);
  return loaded.exports;
}

async function run() {
  const queries = [];
  const pool = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      return [{ affectedRows: 5 }];
    }
  };
  const model = loadIsolated('../src/core/models/hrProfileValue.js', {
    '../../config/db': pool,
    '../../utils/orgContext': { getCurrentOrgId: async () => 'org-a' },
    '../../utils/helpers': {
      safeString: (value) => String(value == null ? '' : value).trim()
    }
  });

  // 空输入不发任何语句
  assert.strictEqual(await model.createMany([], pool, 'org-a'), 0);
  assert.strictEqual(queries.length, 0, '空输入不得发 SQL');
  assert.strictEqual(await model.createMany(null, pool, 'org-a'), 0);
  assert.strictEqual(queries.length, 0);

  // 多行合成一条语句；null 值仍归一成空字符串；is_pending 仍写 1/0
  const inserted = await model.createMany([
    { id: 'v1', recordId: 'r1', isPending: false, fieldId: 'f1', fieldValue: '甲' },
    { id: 'v2', recordId: 'r1', isPending: true, fieldId: 'f2', fieldValue: null }
  ], pool, 'org-a');
  assert.strictEqual(queries.length, 1, '两行必须只发一条语句');
  assert.ok(queries[0].sql.includes('VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)'));
  assert.deepStrictEqual(Array.from(queries[0].params), [
    'v1', 'r1', 0, 'f1', '甲', 'org-a',
    'v2', 'r1', 1, 'f2', '', 'org-a'
  ]);
  assert.strictEqual(inserted, 5);

  // 超过 200 行分批：450 行 = 200 + 200 + 50 三条语句
  queries.length = 0;
  const many = Array.from({ length: 450 }, (unused, index) => ({
    id: 'v' + index, recordId: 'r1', isPending: false, fieldId: 'f' + index, fieldValue: 'x'
  }));
  await model.createMany(many, pool, 'org-a');
  assert.strictEqual(queries.length, 3, '450 行必须分成 3 条语句');
  assert.strictEqual(queries[0].params.length, 200 * 6);
  assert.strictEqual(queries[1].params.length, 200 * 6);
  assert.strictEqual(queries[2].params.length, 50 * 6);

  // 单条插入接口保留，且只发一条语句
  queries.length = 0;
  await model.create('v9', 'r1', false, 'f9', '乙', pool, 'org-a');
  assert.strictEqual(queries.length, 1);
  assert.ok(queries[0].sql.trim().startsWith('INSERT INTO hr_profile_record_values'));

  // 路由层必须用批量接口，不能再逐字段循环插入
  const routeSource = fs.readFileSync(
    path.resolve(__dirname, '../src/core/routes/hrProfile.js'),
    'utf8'
  );
  assert.strictEqual(
    (routeSource.match(/profileValueModel\.createMany\(/g) || []).length,
    3,
    '本人提交、审核通过、管理员维护三条写入路径都必须走批量插入'
  );
  assert.ok(!/profileValueModel\.create\(/.test(routeSource), '路由层不得再逐字段单条插入');

  console.log('补充资料值批量插入回归通过：单语句多行、空值归一、200 行分批、三条写入路径全部走批量');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
