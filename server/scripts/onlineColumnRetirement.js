const { execFileSync } = require('child_process');

// 专用格式只接受一行 JSON 声明，不允许附带 SQL 或任意在线豁免。
function parseRetirement(content) {
  const text = String(content).trim();
  if (!text.includes('@online-drop-columns')) return null;
  const match = /^-- @online-drop-columns (\{[^\r\n]+\})$/.exec(text);
  if (!match) throw new Error('在线删列迁移只能包含单行声明');
  const value = JSON.parse(match[1]);
  const identifier = /^[a-z][a-z0-9_]{0,63}$/;
  if (Object.keys(value).sort().join(',') !== 'columns,compatibleSince,table'
    || typeof value.table !== 'string' || !identifier.test(value.table)
    || typeof value.compatibleSince !== 'string' || !/^[0-9a-f]{40}$/.test(value.compatibleSince)
    || !Array.isArray(value.columns) || !value.columns.length || value.columns.length > 16
    || value.columns.some(column => typeof column !== 'string' || !identifier.test(column))
    || new Set(value.columns).size !== value.columns.length) throw new Error('在线删列声明无效');
  return value;
}

function verifyRelease(retirement, { repo, currentSha, targetSha, rollbackSha = currentSha }) {
  if (typeof repo !== 'string' || !repo) throw new Error('缺少生产仓库路径');
  for (const sha of [currentSha, rollbackSha, targetSha]) {
    if (!/^[0-9a-f]{40}$/.test(sha || '')) throw new Error('在线删列需要当前运行与目标版本的完整 SHA');
    execFileSync('git', ['-C', repo, 'merge-base', '--is-ancestor', retirement.compatibleSince, sha], { stdio: 'pipe' });
    for (const column of retirement.columns) {
      try {
        execFileSync('git', ['-C', repo, 'grep', '-i', '-F', '-l', column, sha, '--', 'server/src'], { stdio: 'pipe' });
      } catch (error) {
        if (error.status === 1) continue;
        throw error;
      }
      throw new Error('当前或目标运行代码仍引用待删除列：' + column);
    }
  }
  if (currentSha === targetSha) throw new Error('必须先独立上线兼容版本，再提交删列迁移');
}

async function retireColumns(connection, retirement) {
  // 不支持 INSTANT 或存在元数据锁时直接失败，不降级为表复制或长时间锁表。
  await connection.query('SET SESSION lock_wait_timeout = 1');
  const [tables] = await connection.execute(
    'SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [retirement.table]);
  if (tables.length !== 1 || tables[0].ENGINE !== 'InnoDB') throw new Error('在线删列仅允许已存在的 InnoDB 表');
  const [rows] = await connection.execute(
    'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [retirement.table]);
  const names = new Set(rows.map(row => row.COLUMN_NAME));
  const pending = retirement.columns.filter(column => names.has(column));
  if (!pending.length) return;
  await connection.query('ALTER TABLE `' + retirement.table + '` '
    + pending.map(column => 'DROP COLUMN `' + column + '`').join(', ') + ', ALGORITHM=INSTANT');
}

module.exports = { parseRetirement, verifyRelease, retireColumns };
