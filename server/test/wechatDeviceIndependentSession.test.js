const assert = require('assert');
const fs = require('fs');
const path = require('path');

const routeSource = fs.readFileSync(
  path.join(__dirname, '../src/core/routes/unifiedAuth.js'),
  'utf8'
);
const modelSource = fs.readFileSync(
  path.join(__dirname, '../src/core/models/unifiedIdentity.js'),
  'utf8'
);
const miniLoginSource = fs.readFileSync(
  path.join(__dirname, '../../miniprogram/subpackages/main/pages/login/login.js'),
  'utf8'
);
const miniApiSource = fs.readFileSync(
  path.join(__dirname, '../../miniprogram/utils/api.js'),
  'utf8'
);

const metadataBlock = routeSource.slice(
  routeSource.indexOf('function metadata(req)'),
  routeSource.indexOf('function sendError')
);
const createSessionBlock = modelSource.slice(
  modelSource.indexOf('async function createSession('),
  modelSource.indexOf('async function loadSession(')
);

assert(!/device(Id|Platform|Model)/.test(metadataBlock),
  '认证路由不得从请求读取设备标识或型号');
assert(!/device_key_hash\s*=\s*\?/.test(createSessionBlock),
  '创建新会话不得按设备摘要撤销旧会话');
assert(!/device_key_hash|device_platform|device_model/.test(createSessionBlock),
  '登录创建会话不得写入设备字段');
assert(!/getDeviceIdentity|deviceId|devicePlatform|deviceModel/.test(miniLoginSource),
  '小程序登录临界路径不得采集或提交设备信息');
assert(!/getDeviceIdentity|deviceId|devicePlatform|deviceModel/.test(miniApiSource),
  '会话自动续期不得采集或提交设备信息');

console.log('微信登录与多设备会话解耦测试通过');
