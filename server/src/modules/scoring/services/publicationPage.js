'use strict';

const { createHash } = require('node:crypto');

const FIRST_BATCH = 32;
const FOLLOWING_BATCH = 64;

function pageOf(groups, cursor) {
  const revision = createHash('sha256').update(JSON.stringify(groups)).digest('hex');
  const total = groups.reduce((sum, group) => sum + group.members.length, 0);
  const offset = cursor?.revision === revision && Number.isSafeInteger(cursor.offset) && cursor.offset > 0 && cursor.offset < total
    ? cursor.offset : 0;
  const end = Math.min(total, offset + (offset ? FOLLOWING_BATCH : FIRST_BATCH));
  const window = groups.map(group => ({ ...group, members: [] }));
  // 各组按排名交错传输，首批可以点开不同组。组内顺序保持不变。
  let position = 0;
  let rank = 0;
  let active = groups.map((group, index) => ({ group, index }));
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
    let hasGrades = false;
    for (const group of groups) {
      for (const member of group.members) {
        const score = Number(member.finalScore);
        sum += score;
        max = Math.max(max, score);
        if (member.displayFacts.gradeName) hasGrades = true;
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

module.exports = { pageOf };
