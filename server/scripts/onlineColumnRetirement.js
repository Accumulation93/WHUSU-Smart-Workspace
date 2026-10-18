const { execFileSync } = require('child_process');
const crypto = require('crypto');

// 专用格式只接受一行 JSON 声明，不允许附带 SQL 或任意在线豁免。
function parseRetirement(content) {
  const text = String(content).trim();
  if (!text.includes('@online-drop-columns')) return null;
  const match = /^-- @online-drop-columns (\{[^\r\n]+\})$/.exec(text);
  if (!match) throw new Error('在线删列迁移只能包含单行声明');
  const value = JSON.parse(match[1]);
  const identifier = /^[a-z][a-z0-9_]{0,63}$/;
  if (Object.keys(value).some(key => !['columns', 'compatibleSince', 'table', 'indexes', 'sharedReferences'].includes(key))
    || typeof value.table !== 'string' || !identifier.test(value.table)
    || typeof value.compatibleSince !== 'string' || !/^[0-9a-f]{40}$/.test(value.compatibleSince)
    || !Array.isArray(value.columns) || !value.columns.length || value.columns.length > 16
    || value.columns.some(column => typeof column !== 'string' || !identifier.test(column))
    || new Set(value.columns).size !== value.columns.length) throw new Error('在线删列声明无效');
  if (value.indexes !== undefined && (!Array.isArray(value.indexes) || value.indexes.length > 16
    || value.indexes.some(index => typeof index !== 'string' || !identifier.test(index) || index === 'primary')
    || new Set(value.indexes).size !== value.indexes.length)) throw new Error('在线退役索引声明无效');
  if (value.sharedReferences !== undefined) {
    if (!Array.isArray(value.sharedReferences) || value.sharedReferences.length > 16) throw new Error('同名列引用证据无效');
    for (const reference of value.sharedReferences) {
      if (!reference || typeof reference.file !== 'string' || !/^server\/src\/[A-Za-z0-9_./-]+\.js$/.test(reference.file)
        || reference.file.includes('..') || !/^[0-9a-f]{64}$/.test(reference.sha256 || '')
        || typeof reference.reason !== 'string' || reference.reason.length < 10) throw new Error('同名列引用必须逐文件登记摘要与其他表用途');
    }
  }
  return value;
}

function verifyRelease(retirement, { repo, currentSha, targetSha, rollbackSha = currentSha }) {
  if (typeof repo !== 'string' || !repo) throw new Error('缺少生产仓库路径');
  for (const sha of [currentSha, rollbackSha, targetSha]) {
    if (!/^[0-9a-f]{40}$/.test(sha || '')) throw new Error('在线删列需要当前运行与目标版本的完整 SHA');
    execFileSync('git', ['-C', repo, 'merge-base', '--is-ancestor', retirement.compatibleSince, sha], { stdio: 'pipe' });
    for (const column of retirement.columns) {
      let matches;
      try {
        matches = execFileSync('git', ['-C', repo, 'grep', '-i', '-F', '-l', column, sha, '--', 'server/src'], { encoding: 'utf8', stdio: 'pipe' });
      } catch (error) {
        if (error.status === 1) continue;
        throw error;
      }
      for (const match of matches.trim().split('\n')) {
        const file = match.slice(41).trim();
        const evidence = (retirement.sharedReferences || []).find(reference => reference.file === file);
        if (!evidence) throw new Error('当前或目标运行代码仍引用待删除列：' + column);
        const source = execFileSync('git', ['-C', repo, 'show', sha + ':' + file], { stdio: 'pipe' });
        if (crypto.createHash('sha256').update(source).digest('hex') !== evidence.sha256) {
          throw new Error('同名列引用源码变化，必须重新审计：' + file);
        }
      }
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
  // 仅显式列出的、完全由退役列组成的非主键索引可先在线移除；不猜测或扩大删除范围。
  const [indexRows] = await connection.execute(
    'SELECT INDEX_NAME,COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [retirement.table]);
  const indexes = retirement.indexes || [];
  for (const index of indexes) {
    const parts = indexRows.filter(row => row.INDEX_NAME === index);
    if (!parts.length) continue;
    if (parts.some(row => !retirement.columns.includes(row.COLUMN_NAME))) throw new Error('索引包含仍在使用的列，拒绝删除');
  }
  const existingIndexes = indexes.filter(index => indexRows.some(row => row.INDEX_NAME === index));
  if (existingIndexes.length) {
    await connection.query('ALTER TABLE `' + retirement.table + '` '
      + existingIndexes.map(index => 'DROP INDEX `' + index + '`').join(', ') + ', ALGORITHM=INPLACE, LOCK=NONE');
  }
  if (!pending.length) return;
  await connection.query('ALTER TABLE `' + retirement.table + '` '
    + pending.map(column => 'DROP COLUMN `' + column + '`').join(', ') + ', ALGORITHM=INSTANT');
}

module.exports = { parseRetirement, verifyRelease, retireColumns };
