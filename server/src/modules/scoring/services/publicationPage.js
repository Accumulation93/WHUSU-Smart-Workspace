'use strict';

const { createHash } = require('node:crypto');

const FIRST_BATCH = 32;
const FOLLOWING_BATCH = 64;

function presentMembers(members, displayMode) {
  if (displayMode !== 'grade') return members.sort((a, b) => b.sortScore - a.sortScore);
  return members.map(({ finalScore, sortScore, ...member }) => member)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN')
      || String(a.assignmentId || '').localeCompare(String(b.assignmentId || '')));
}

function rowsBeforeRank(groups, rank) {
  return groups.reduce((sum, group) => sum + Math.min(rank, group.members.length), 0);
}

function pageOf(groups, cursor) {
  const revision = createHash('sha256').update(JSON.stringify(groups)).digest('hex');
  let total = 0;
  let longest = 0;
  for (const group of groups) {
    total += group.members.length;
    longest = Math.max(longest, group.members.length);
  }
  const offset = cursor?.revision === revision && Number.isSafeInteger(cursor.offset) && cursor.offset > 0 && cursor.offset < total
    ? cursor.offset : 0;
  const end = Math.min(total, offset + (offset ? FOLLOWING_BATCH : FIRST_BATCH));
  const window = groups.map(group => ({ ...group, members: [] }));
  // 各组按排名交错传输，首批可以点开不同组。组内顺序保持不变。
  let rank = 0;
  // 通过名次前累计行数定位续页起点，避免每次从第一条重新遍历前缀。
  if (offset) {
    let upper = longest;
    while (rank + 1 < upper) {
      const middle = Math.floor((rank + upper) / 2);
      if (rowsBeforeRank(groups, middle) <= offset) rank = middle;
      else upper = middle;
    }
  }
  let position = offset ? rowsBeforeRank(groups, rank) : 0;
  let active = groups.map((group, index) => ({ group, index })).filter(({ group }) => group.members.length > rank);
  while (position < end && active.length) {
    active = active.filter(({ group, index }) => {
      if (position >= end) return false;
      if (position++ >= offset) window[index].members.push(group.members[rank]);
      return group.members.length > rank + 1;
    });
    rank++;
  }
  const page = { offset, total, next: end < total ? { revision, offset: end } : null };
  if (!offset) {
    let sum = 0;
    let max = -Infinity;
    const hasGrades = groups.some(group => group.displayMode === 'grade'
      || group.members.some(member => member.displayFacts?.gradeName));
    for (const group of groups) {
      if (hasGrades) break;
      for (const member of group.members) {
        const score = Number(member.finalScore);
        sum += score;
        max = Math.max(max, score);
      }
    }
    page.stats = {
      count: total,
      maxScore: total && !hasGrades ? max.toFixed(1) : '--',
      avgScore: total && !hasGrades ? (sum / total).toFixed(1) : '--'
    };
  }
  return { groups: window, page };
}

module.exports = { pageOf, presentMembers };
