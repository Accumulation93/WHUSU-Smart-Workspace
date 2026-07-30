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
  !/hr-member-fact-label/.test(adminWxml),
  '管理端成员卡不得展示属于岗位的部门、身份或工作分工'
);
assert(
  /class="assignment-fact"[\s\S]*?所属部门[\s\S]*?class="assignment-fact"[\s\S]*?身份[\s\S]*?工作分工（职能组）/.test(adminWxml),
  '部门、身份和工作分工必须在岗位详情中分别展示'
);
assert(
  /class="modal-body detail-body ui-dialog-body ui-dialog-scroll--pane"[\s\S]*?scroll-into-view="\{\{detailScrollTarget\}\}"/.test(adminWxml),
  '岗位和补充资料编辑必须位于可滚动详情视口中'
);
assert(
  !/主要岗位|设为主要岗位|isPrimary/.test(adminWxml),
  '人事界面不得保留主要岗位概念'
);
const createMemberForm = adminWxml.match(/<view class="edit-box" wx:if="\{\{activeTab === 'hrInfo'[\s\S]*?<\/view>\s*<view class="edit-box hr-template-editor"/);
assert(createMemberForm, '应保留新增成员表单');
assert(!/所属部门|工作分工（职能组）/.test(createMemberForm[0]), '新增成员表单只能填写人员基础信息');
assert(/保存并完善资料/.test(createMemberForm[0]), '新增成员后应继续进入详情完善岗位和补充资料');

console.log('hr profile layout tests passed');
