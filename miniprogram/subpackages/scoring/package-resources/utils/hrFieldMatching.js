// 字段标题匹配唯一源；副本由 scripts/sync-hr-field-matching.js 生成。
// 只供导入与模板处理建议，严禁用于自然人唯一键、岗位或权限匹配。
//
// 四层判定，从强到弱：
//   1. 完全同名（1.0，可默认）
//   2. 同义组命中（0.95，可默认）——同一类资料的登记写法
//   3. 去掉括号注释后同名（0.5）/ 互相包含（0.75）——只提示
//   4. 共享语义中心语（0.72）/ 字符与二元组相似度（≥0.4）——只提示
// 第 3、4 层永远不默认：紧急联系人手机号、家庭住址、固定电话都要用户确认。
const GROUPS = [
  ['手机号', '手机号码', '移动电话', '手机', '电话', '电话号码', '联系电话',
    '联系电话号码', '移动电话号码', 'phone', 'mobile', 'mobile phone', 'phone number',
    'tel', 'telephone', 'telephone number', 'cell', 'cell phone', 'cell phone number',
    'mobile number', 'contact phone', 'contact number'],
  ['邮箱', '电子邮箱', '电子邮件', '邮箱地址', '电子邮箱地址', 'email', 'e-mail', 'email address'],
  ['身份', '职位', '身份类别', 'identity', 'position', 'job']
];

// 语义中心语：中英文归入同一类资料，用于识别「不同名但同类」的字段。
// 命中只给出可修改建议，不能自动套用：移动电话与固定电话、家庭住址与工作住址仍需人工确认。
const HEAD_TERMS = [
  { id: 'phone', terms: ['电话号码', '移动电话', '固定电话', '联系电话', '手机号码', '手机号', '手机', '电话',
    'phonenumber', 'telephone', 'mobilephone', 'cellphone', 'phone', 'mobile', 'cell'] },
  { id: 'email', terms: ['电子邮箱', '电子邮件', '联系邮箱', '邮箱', '邮件', 'email', 'mail'] },
  { id: 'address', terms: ['通讯地址', '联系地址', '家庭住址', '户籍地址', '住址', '地址', 'address'] },
  { id: 'name', terms: ['姓名', '名字', 'name'] },
  { id: 'studentId', terms: ['学籍号', '学号', 'studentid', 'studentcode'] },
  { id: 'idCard', terms: ['身份证号码', '身份证号', '证件号码', 'idcard'] },
  { id: 'department', terms: ['部门', '院系', '学院', '单位', 'department', 'faculty'] },
  { id: 'identity', terms: ['身份类别', '身份', '职位', '职务', '职称', 'identity', 'position', 'title'] },
  { id: 'workGroup', terms: ['职能组', '工作组', 'workgroup'] },
  { id: 'birthday', terms: ['出生日期', '出生年月', '生日', 'birthday'] },
  { id: 'gender', terms: ['性别', 'gender'] },
  { id: 'nation', terms: ['民族', 'nation'] },
  { id: 'politics', terms: ['政治面貌', 'politicalstatus'] },
  { id: 'major', terms: ['专业', 'major'] },
  { id: 'class', terms: ['班级', 'class'] },
  { id: 'grade', terms: ['年级', 'grade'] },
  { id: 'remark', terms: ['备注', '说明', 'remark', 'note'] },
  { id: 'date', terms: ['日期', 'date'] },
  { id: 'time', terms: ['时间', 'time'] },
  { id: 'number', terms: ['编号', '序号', 'number'] },
  { id: 'account', terms: ['账号', '账户', 'account'] },
  { id: 'status', terms: ['状态', 'status'] }
];

// 英文词条太短会在长单词里误命中（如 hotel 里的 tel），因此只认 4 个字母以上。
const ASCII_TERM_MIN_LENGTH = 4;
const CJK_RANGE = '\u4e00-\u9fff';

function toHalfWidth(value) {
  return String(value == null ? '' : value)
    .replace(/[\uff01-\uff5e]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ');
}

function normalizeLabel(value) {
  return toHalfWidth(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

// 去掉空格、分隔符、括号等排版符号，只保留可比较的字面内容。
function flatLabel(value) {
  return normalizeLabel(value).replace(new RegExp('[^0-9a-z' + CJK_RANGE + ']+', 'g'), '');
}

function aliasesForLabel(value) {
  const key = flatLabel(value);
  const group = GROUPS.find((items) => items.some((item) => flatLabel(item) === key));
  return group ? group.slice() : [normalizeLabel(value)];
}

// 按分隔符切出整体词条，只有「每个词条都是同义组登记写法」才算命中：
// 手机号 / Mobile、mobile phone 命中电话组；phone-contact、紧急联系人手机号这类带修饰的写法不命中。
function aliasGroupIds(value) {
  const ids = new Set();
  const flat = flatLabel(value);
  if (!flat) return ids;
  const tokens = toHalfWidth(value).toLowerCase().split(new RegExp('[^0-9a-z' + CJK_RANGE + ']+')).filter(Boolean);
  for (let index = 0; index < GROUPS.length; index += 1) {
    const members = new Set(GROUPS[index].map((item) => flatLabel(item)));
    // 整段等于登记写法（phone number / 联系电话号码），或由若干登记写法用分隔符拼成（手机号 / Mobile）。
    if (members.has(flat) || (tokens.length && tokens.every((token) => members.has(token)))) ids.add(index);
  }
  return ids;
}

function inSameAliasGroup(a, b) {
  const left = aliasGroupIds(a);
  const right = aliasGroupIds(b);
  if (!left.size || !right.size) return false;
  for (const id of left) { if (right.has(id)) return true; }
  return false;
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

function containsLabel(a, b) {
  const left = normalizeLabel(a);
  const right = normalizeLabel(b);
  if (left && right && (left.indexOf(right) >= 0 || right.indexOf(left) >= 0)) return true;
  const flatLeft = flatLabel(a);
  const flatRight = flatLabel(b);
  return Boolean(flatLeft && flatRight && (flatLeft.indexOf(flatRight) >= 0 || flatRight.indexOf(flatLeft) >= 0));
}

function sharedHeadTerm(a, b) {
  const left = flatLabel(a);
  const right = flatLabel(b);
  if (!left || !right || left === right) return '';
  for (const group of HEAD_TERMS) {
    const matchedIn = (text) => group.terms.some((term) => {
      const key = flatLabel(term);
      if (key.length < 2) return false;
      if (key.length < ASCII_TERM_MIN_LENGTH && /^[0-9a-z]+$/.test(key)) return false;
      return text.indexOf(key) >= 0;
    });
    // 两侧各自命中同一类中心语即可（如 Student ID 与 学号），不要求同一词条字面相同。
    if (matchedIn(left) && matchedIn(right)) return group.id;
  }
  return '';
}

function jaccardCharSimilarity(a, b) {
  const left = new Set(flatLabel(a).split(''));
  const right = new Set(flatLabel(b).split(''));
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  left.forEach((value) => { if (right.has(value)) intersection += 1; });
  return intersection / (left.size + right.size - intersection);
}

// 二元组 Dice：中文里「移动电话 / 联系电话」这类词序不同、共享词根的写法比单字 Jaccard 更有辨识度。
function bigramDiceSimilarity(a, b) {
  const leftText = flatLabel(a);
  const rightText = flatLabel(b);
  if (leftText.length < 2 || rightText.length < 2) return 0;
  const left = new Set();
  const right = new Set();
  for (let index = 0; index < leftText.length - 1; index += 1) left.add(leftText.slice(index, index + 2));
  for (let index = 0; index < rightText.length - 1; index += 1) right.add(rightText.slice(index, index + 2));
  let intersection = 0;
  left.forEach((value) => { if (right.has(value)) intersection += 1; });
  return (2 * intersection) / (left.size + right.size);
}

function scoreFieldLabels(a, b) {
  const left = normalizeLabel(a);
  const right = normalizeLabel(b);
  if (!left || !right) return { score: 0, confident: false };
  if (left === right) return { score: 1, confident: true };
  if (inSameAliasGroup(left, right)) return { score: 0.95, confident: true };
  if (baseLabel(left) === baseLabel(right)) return { score: 0.5, confident: false };
  // 括号注释或中英混写只要仍属于同一同义组，依旧视为同一类资料（如 手机号（本人） / 联系电话）。
  if (inSameAliasGroup(baseLabel(left), baseLabel(right))) return { score: 0.95, confident: true };
  if (containsLabel(left, right)) return { score: 0.75, confident: false };
  if (sharedHeadTerm(left, right)) return { score: 0.72, confident: false };
  return {
    score: Math.max(jaccardCharSimilarity(left, right), bigramDiceSimilarity(left, right)),
    confident: false
  };
}

module.exports = {
  aliasesForLabel,
  jaccardCharSimilarity,
  bigramDiceSimilarity,
  scoreFieldLabels
};
