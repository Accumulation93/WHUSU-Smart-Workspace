import ui from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/adminUtils.js';

export const questionFields = [
  { key: 'question', label: ui.copy_1af596e2ba, aliases: [ui.copy_12fc5f1a33, ui.copy_1af596e2ba, ui.copy_b66cf0dd1d, 'question'] },
  { key: 'scoreLabel', label: ui.copy_fd0da10351, aliases: [ui.copy_fd0da10351, ui.copy_28d0daa28f, 'scoreLabel', ui.copy_1702a69e64, ui.copy_10b1158748] },
  { key: 'minValue', label: ui.copy_e24b33ba5f, aliases: [ui.copy_e24b33ba5f, ui.copy_c741409c82, 'minValue', 'min', ui.copy_9a2cca25f2] },
  { key: 'startValue', label: ui.copy_4366ed3bb6, aliases: [ui.copy_4366ed3bb6, ui.copy_ce2a519308, 'startValue', 'start', ui.copy_62f0d4f3c1] },
  { key: 'maxValue', label: ui.copy_8ca6566932, aliases: [ui.copy_8ca6566932, ui.copy_fb031f3568, 'maxValue', 'max', ui.copy_103f952a56] },
  { key: 'stepValue', label: ui.copy_4b62966880, aliases: [ui.copy_4b62966880, ui.copy_8c44208d45, 'stepValue', 'step', ui.copy_13d5166c86] }
];
let seed = 0;
export function questionForForm(value) {
  const source = value || {};
  return { key: ++seed, question: source.question || '', scoreLabel: source.scoreLabel || '',
    minValue: String(source.minValue ?? 0), startValue: String(source.startValue ?? 0), maxValue: String(source.maxValue ?? (value === undefined ? 10 : 0)), stepValue: String(source.stepValue ?? (value === undefined ? 1 : 0.5)) };
}
export function emptyTemplateForm() { return { id: '', name: '', description: '', questions: [] }; }
export function questionPayload(question) { return Object.fromEntries(questionFields.map(({ key }) => [key, key === 'scoreLabel' ? String(question[key] ?? '') : String(question[key] ?? '').trim()])); }
export function mapQuestionColumns(headers) {
  const mapping = {}, used = new Set();
  const lower = value => String(value).trim().toLowerCase();
  function similarity(a, b) {
    const left = new Set(a), right = new Set(b), union = new Set([...left, ...right]);
    return union.size ? [...left].filter(item => right.has(item)).length / union.size : 0;
  }
  for (let index = 0; index < headers.length; index++) {
    const header = lower(headers[index]);
    if (!header) continue;
    let match = questionFields.find(field => !used.has(field.key) && field.aliases.some(alias => header === lower(alias)));
    match ||= questionFields.find(field => !used.has(field.key) && field.aliases.some(alias => header.includes(lower(alias))));
    if (match) { mapping[index] = match.key; used.add(match.key); }
  }
  for (let index = 0; index < headers.length; index++) {
    if (mapping[index] || !lower(headers[index])) continue;
    let best = null, score = 0;
    for (const field of questionFields.filter(field => !used.has(field.key))) for (const alias of field.aliases) {
      const value = similarity(lower(headers[index]), lower(alias));
      if (value >= 0.3 && value > score) { best = field; score = value; }
    }
    if (best) { mapping[index] = best.key; used.add(best.key); }
  }
  return mapping;
}
export function questionsFromTable(rows, mapping) {
  const columns = Object.fromEntries(Object.entries(mapping).filter(([, value]) => value).map(([key, value]) => [value, Number(key)]));
  if (columns.question == null) return null;
  return rows.filter(row => String(row[columns.question] || '').trim()).map(row => {
    const question = questionForForm();
    for (const { key } of questionFields) {
      const value = columns[key] == null ? '' : String(row[columns[key]] ?? '').trim();
      if (value) question[key] = value;
    }
    return question;
  });
}
