// 字段标题匹配唯一源；副本由 scripts/sync-hr-field-matching.js 生成。
// 只供导入与模板处理建议，严禁用于自然人唯一键、岗位或权限匹配。
const GROUPS = [
  ['手机号', '手机号码', '移动电话', '手机', '电话', '电话号码', '联系电话',
    'phone', 'mobile', 'mobile phone', 'tel', 'telephone', 'cell', 'cell phone'],
  ['邮箱', '电子邮箱', '电子邮件', 'email', 'e-mail'],
  ['身份', '职位', '身份类别', 'identity', 'position', 'job']
];
// 中文复合字段名多为「限定语 + 中心语」，中心语相同即同一类资料（如移动电话 / 联系电话）。
// 只作为需要用户确认的建议，不能自动套用：家庭地址与工作地址同样共享中心语。
const CJK_TERM = /^[\u4e00-\u9fff]{2,}$/;
function normalizeLabel(value) { return String(value || '').trim().toLowerCase(); }
function aliasesForLabel(value) {
  const key = normalizeLabel(value);
  const group = GROUPS.find((items) => items.indexOf(key) >= 0);
  return group ? group.slice() : [key];
}
function baseLabel(value) {
  let current = normalizeLabel(value);
  let changed = true;
  while (changed) {
    changed = false;
    const next = current.replace(/[（(][^（()）]*[)）]\s*$/g, '').trim();
    if (next && next !== current) {
      current = next;
      changed = true;
    }
  }
  return current;
}
function sharedHeadTerm(a, b) {
  if (a.length < 2 || b.length < 2 || a === b) return '';
  const term = a.slice(-2);
  if (term !== b.slice(-2) || !CJK_TERM.test(term)) return '';
  return term;
}
function jaccardCharSimilarity(a, b) {
  const left = new Set(normalizeLabel(a).split(''));
  const right = new Set(normalizeLabel(b).split(''));
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  left.forEach((value) => { if (right.has(value)) intersection += 1; });
  return intersection / (left.size + right.size - intersection);
}
function scoreFieldLabels(a, b) {
  const left = normalizeLabel(a);
  const right = normalizeLabel(b);
  if (!left || !right) return { score: 0, confident: false };
  if (left === right) return { score: 1, confident: true };
  if (aliasesForLabel(left).indexOf(right) >= 0) return { score: 0.95, confident: true };
  if (baseLabel(left) === baseLabel(right)) return { score: 0.5, confident: false };
  if (left.indexOf(right) >= 0 || right.indexOf(left) >= 0) return { score: 0.75, confident: false };
  if (sharedHeadTerm(left, right)) return { score: 0.7, confident: false };
  return { score: jaccardCharSimilarity(left, right), confident: false };
}
module.exports = { aliasesForLabel, jaccardCharSimilarity, scoreFieldLabels };
