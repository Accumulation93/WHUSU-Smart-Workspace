'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '../../miniprogram');
const signingRoute = 'subpackages/audit/pages/signing/signing';
const portraitLandings = [
  'subpackages/main/pages/portal/portal',
  'subpackages/audit/pages/submissionDetail/submissionDetail',
  'subpackages/audit/pages/signatureManager/signatureManager'
];
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const routes = app.pages.concat(app.subPackages.flatMap(pkg => pkg.pages.map(page => pkg.root + '/' + page)));

test('普通页面默认竖屏，只有签署工作区声明方向例外', () => {
  assert.equal(app.window.pageOrientation, 'portrait');
  assert(routes.includes(signingRoute));
  for (const route of routes) {
    const config = JSON.parse(fs.readFileSync(path.join(root, route + '.json'), 'utf8'));
    const markup = fs.readFileSync(path.join(root, route + '.wxml'), 'utf8');
    if (route === signingRoute) {
      assert.equal(config.pageOrientation, 'auto');
      assert.match(markup, /<page-meta page-orientation="{{workspaceOrientation}}"/);
    } else {
      assert.equal(config.pageOrientation ?? app.window.pageOrientation, 'portrait', route);
      const declaredOrientations = [...markup.matchAll(/\bpage-orientation\s*=\s*"([^"]+)"/g)];
      for (const [, orientation] of declaredOrientations) assert.equal(orientation, 'portrait', route);
      if (portraitLandings.includes(route)) {
        assert.equal(config.pageOrientation, 'portrait', route);
        assert.match(markup, /^<page-meta page-orientation="portrait"/, route);
      }
    }
  }
});

test('签署退出恢复竖屏，审核详情不再切换方向或启动方向计时器', () => {
  const signing = fs.readFileSync(path.join(root, signingRoute + '.js'), 'utf8');
  const detail = fs.readFileSync(path.join(root, 'subpackages/audit/pages/submissionDetail/submissionDetail.js'), 'utf8');
  assert.match(signing, /workspaceOrientation: this\._handoff\.pad === true \? 'landscape' : 'auto'/);
  assert.match(signing, /setData\(\{ workspaceOrientation: 'portrait' \}, back\)/);
  for (const source of [signing, detail]) {
    assert.doesNotMatch(source, /\b(?:entryOrientation|detailOrientation|restoreSigningOrientation|restoreEntryOrientation|_orientationRestoreTimer)\b/);
  }
});
