const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const homeWxml = fs.readFileSync(path.join(root, 'miniprogram/pages/home/home.wxml'), 'utf8');
const homeWxss = fs.readFileSync(path.join(root, 'miniprogram/pages/home/home.wxss'), 'utf8');
const adminWxml = fs.readFileSync(path.join(root, 'miniprogram/subpackages/scoring/pages/admin/admin.wxml'), 'utf8');
const adminWxss = fs.readFileSync(path.join(root, 'miniprogram/subpackages/scoring/pages/admin/admin.wxss'), 'utf8');

assert(
  /\.field-grid\s*\{[\s\S]*?display:\s*grid;[\s\S]*?repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(homeWxss),
  '普通用户人事信息必须在所有设备使用稳定的两列网格'
);
assert(
  /class="info-block info-block-wide" wx:if="\{\{user\.workGroup\}\}"/.test(homeWxml),
  '未设置工作分工时必须隐藏整行'
);
assert(!/user\.workGroup\s*\|\|\s*['"]未设置['"]/.test(homeWxml), '不得恢复工作分工占位卡');
assert(
  (homeWxml.match(/工作分工（职能组）/g) || []).length >= 1,
  '普通用户人事信息必须显示完整字段名称'
);
assert(/class="hr-member-person"/.test(adminWxml), '成员姓名和学号必须使用稳定的个人信息区');
assert(
  /hr-member-fact-label">所属部门[\s\S]*?hr-member-fact-label">身份[\s\S]*?wx:if="\{\{item\.workGroup\}\}"[\s\S]*?工作分工（职能组）/.test(adminWxml),
  '管理端成员卡必须按部门、身份、工作分工分行并隐藏空工作分工'
);
assert(
  /\.hr-member-facts\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(adminWxss),
  '管理端成员事实区必须保持单列，不得随文字长度挤压'
);

console.log('hr profile layout tests passed');
