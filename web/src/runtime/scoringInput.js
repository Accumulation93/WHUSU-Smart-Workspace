export function quickScores(question) {
  const min = Number(question.minValue);
  const max = Number(question.maxValue);
  const start = Number(question.startValue);
  const step = Number(question.stepValue);
  if (![min, max, start, step].every(Number.isFinite) || step <= 0 || start > max) return [];
  const all = [];
  const first = Math.max(0, Math.ceil((min - start) / step - 1e-8));
  for (let offset = 0; offset < 500; offset++) {
    const index = first + offset;
    const value = Math.round((start + index * step) * 1000) / 1000;
    if (value > max + 1e-8) break;
    if (value >= min && !all.includes(value)) all.push(value);
  }
  if (all.length <= 25) return all.map(String);
  const integers = all.filter(value => Math.abs(value - Math.round(value)) < 1e-8);
  const decimals = all.filter(value => Math.abs(value - Math.round(value)) >= 1e-8);
  const values = integers.slice(0, 25);
  const remaining = 25 - values.length;
  if (decimals.length <= remaining) values.push(...decimals);
  else for (let i = 0; i < remaining; i++) values.push(decimals[remaining === 1 ? 0 : Math.round(i / (remaining - 1) * (decimals.length - 1))]);
  return [...new Set(values)].sort((a, b) => a - b).map(String);
}

export function scoreKey(value, key) {
  const current = String(value ?? '').trim();
  if (key === 'backspace') return current.slice(0, -1);
  if (key === '.') return current === '' || current === '-' ? '0.' : current.includes('.') ? current : current + '.';
  if (key === '-') return current.startsWith('-') ? current.slice(1) : '-' + current;
  if (!/^\d$/.test(key)) return current;
  return current === '0' ? key : current + key;
}
