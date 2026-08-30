'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../../..');
const homeJs = fs.readFileSync(path.join(__dirname, 'home.js'), 'utf8');
const homeWxml = fs.readFileSync(path.join(__dirname, 'home.wxml'), 'utf8');
const homeLocale = fs.readFileSync(path.join(root, 'locales/zh-CN/home.js'), 'utf8');
const trustedNavigation = fs.readFileSync(path.join(root, 'utils/trustedNavigation.js'), 'utf8');
const adminWxml = fs.readFileSync(
  path.join(root, 'subpackages/scoring/pages/admin/admin.wxml'),
  'utf8'
);

assert(homeJs.includes("name: 'getAuditVerificationAccess'"),
  '普通用户审核中心必须从服务端读取当前组织验签权限');
assert(homeJs.includes("navigateToTrustedRoute('/subpackages/audit/pages/verification/verification')"),
  '普通用户验签入口必须进入已注册的可信路由');
assert(homeWxml.includes('wx:if="{{auditCanVerify}}"'),
  '普通用户验签入口必须仅对当前组织已授权成员显示');
assert(homeWxml.includes('{{copy.auditVerification}}'));
assert(homeWxml.includes('{{copy.auditVerificationDescription}}'));
assert(homeLocale.includes("auditVerification: '文件验签'"));
assert(homeLocale.includes("auditVerificationDescription: '核对审核文件与签名'"));
assert(trustedNavigation.includes("'/subpackages/audit/pages/verification/verification'"));

assert(adminWxml.includes("activeTab === 'auditVerification'"),
  '管理端必须保留真实可见的验签管理页签');
assert(adminWxml.includes('bindtap="verifySubmissionChain"'),
  '管理端验签页签必须提供真实的验签操作，不得只是静态入口');

console.log('审核管理端与普通用户验签入口契约测试通过');
