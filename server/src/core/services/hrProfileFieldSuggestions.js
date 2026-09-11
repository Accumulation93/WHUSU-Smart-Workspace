// 仅生成应用模板的可调整建议；不能用于全局资料唯一键或自动合并数据。
const { scoreFieldLabels } = require('./hrFieldMatching');

function suggestFields(sources, targets) {
  const proposed = sources.map((source) => {
    let best = { id: '', score: 0, confident: false };
    let tied = false;
    targets.forEach((target) => {
      if (source.type !== target.type) return;
      const match = scoreFieldLabels(source.label, target.label);
      if (match.score < 0.4) return;
      if (match.score > best.score) { best = Object.assign({ id: target.id }, match); tied = false; }
      else if (match.score === best.score) tied = true;
    });
    return tied ? { id: '', confident: false } : best;
  });
  const claims = new Map();
  proposed.forEach((item) => { if (item.id) claims.set(item.id, (claims.get(item.id) || 0) + 1); });
  // 多个历史字段争用同一目标时不按先后顺序猜测，应由用户明确选择。
  return proposed.map((item) => ({ id: item.id, confident: Boolean(item.id && item.confident && claims.get(item.id) === 1) }));
}

function suggestFieldTargets(sources, targets) {
  return suggestFields(sources, targets).map((item) => item.confident ? item.id : '');
}
module.exports = { suggestFields, suggestFieldTargets };
