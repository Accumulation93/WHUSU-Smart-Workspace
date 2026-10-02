'use strict';
// 文本扫描只生成复核线索，不把链式线性遍历或所有嵌套循环判为性能缺陷。
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const files = [];
function visit(relative) {
  const absolute = path.join(root, relative);
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (['node_modules', 'locales', '.git'].includes(entry.name)) continue;
    const next = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) visit(next);
    else if (entry.name.endsWith('.js')) files.push(next);
  }
}
visit('server/src'); visit('miniprogram');
files.push('server/notificationWorker.js', 'server/backup.js');
const patterns = {
  fullRowProjection: /SELECT\s+\*/i,
  linearSearch: /\.(find|filter|some|includes)\s*\(/,
  sort: /\.sort\s*\(/,
  synchronousIo: /\b(?:readFileSync|writeFileSync|setStorageSync|getStorageSync)\s*\(/,
  loop: /\b(?:for|while)\s*\(/
};
const inventory = files.sort().map(file => {
  const lines = fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/);
  const candidates = {};
  for (const [name, pattern] of Object.entries(patterns)) {
    candidates[name] = lines.flatMap((line,index) => pattern.test(line) ? [index+1] : []);
  }
  return { file, lines: lines.length, candidates };
});
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const failures = [];
function requireContract(name, condition) { if (!condition) failures.push(name); }
const records = read('server/src/modules/scoring/models/scoreRecord.js');
const completion = records.slice(records.indexOf('async function getCompletionTargets('), records.indexOf('async function getByParticipantPair('));
requireContract('待办评分查询禁止完整行投影', completion.includes('target_assignment_id, target_subject_key') && !/SELECT\s+\*/i.test(completion));
const results = read('server/src/modules/scoring/routes/results.js');
const answers = results.slice(results.indexOf('function getRecordTemplateScores('), results.indexOf('function addSnapshotDiagnostic('));
requireContract('评分答案禁止每模板重复筛选', !/answers\.filter\s*\(/.test(answers) && answers.includes('totalsByTemplate'));
requireContract('人员选择禁止视图保存第二份完整候选', !read('miniprogram/components/personnel-picker/personnel-picker.js').includes('normalizedOptions:'));
for (const file of ['miniprogram/subpackages/main/pages/portal/portal.js', 'miniprogram/subpackages/message/pages/messageCenter/messageCenter.js']) {
  const source = read(file);
  requireContract(file + '必须独立加载消息', source.includes("'listNotifications' : 'listTodos'") && !/name:\s*'getMessageOverview'/.test(source));
}
requireContract('日期计数禁止从历史起点逐日重放', read('server/src/modules/venue/services/venueActivitySchedule.js').includes('countOccurrences('));
const report = { files:inventory.length, lines:inventory.reduce((sum,item)=>sum+item.lines,0),
  note:'候选行号用于人工复核，不代表复杂度结论或线上热点证明', failures, inventory };
if (process.argv.includes('--json')) console.log(JSON.stringify(report));
else console.log(JSON.stringify({ files:report.files, lines:report.lines, note:report.note, failures }));
if (process.argv.includes('--strict') && failures.length) process.exitCode=1;
