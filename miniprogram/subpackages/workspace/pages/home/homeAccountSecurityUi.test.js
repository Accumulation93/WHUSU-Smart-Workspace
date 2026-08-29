'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const pageRoot = __dirname;
const wxml = fs.readFileSync(path.join(pageRoot, 'home.wxml'), 'utf8');
const wxss = fs.readFileSync(path.join(pageRoot, 'home.wxss'), 'utf8');
const loginJs = fs.readFileSync(path.resolve(pageRoot, '../../../main/pages/login/login.js'), 'utf8');

test('普通用户保存口令与保存人事信息复用同一标准主按钮规格', () => {
  const passphraseStart = wxml.indexOf('class="profile-passphrase-form"');
  const passphraseEnd = wxml.indexOf('</view>', passphraseStart);
  const passphraseForm = wxml.slice(passphraseStart, passphraseEnd);
  assert.match(passphraseForm, /profile-submit-btn profile-passphrase-submit/);
  assert.doesNotMatch(passphraseForm, /profile-account-action/);
  assert.match(wxss, /\.profile-passphrase-form\s*\{[\s\S]*flex-direction:\s*column/);
  assert.match(wxss, /\.profile-passphrase-submit\s*\{[\s\S]*flex:\s*none;[\s\S]*min-width:\s*100%;[\s\S]*max-width:\s*100%/);
});

test('口令登录获取微信 code 并随验证请求提交', () => {
  assert.match(loginJs, /function requestWechatLoginCode\(\)/);
  assert.match(loginJs, /const code = await requestWechatLoginCode\(\);/);
  const loginStart = loginJs.indexOf("name: 'auth/password/session'");
  const loginEnd = loginJs.indexOf('});', loginStart);
  assert.match(loginJs.slice(loginStart, loginEnd), /passphrase:\s*this\.data\.password,[\s\S]*code,/);
});
