'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

async function main() {
  const source = path.resolve(__dirname, '../../miniprogram/subpackages/audit/pages/submissionDetail/submissionDetail.js');
  const ownRequire = createRequire(source);
  let definition, handoff, navigated = false, devicePortrait = true;
  const runtimeWx = {
    getWindowInfo() {
      return devicePortrait
        ? { screenWidth: 390, screenHeight: 844, windowWidth: 390, windowHeight: 844 }
        : { screenWidth: 844, screenHeight: 390, windowWidth: 844, windowHeight: 390 };
    },
    nextTick(callback) { callback(); }
  };
  vm.runInNewContext(fs.readFileSync(source, 'utf8'), {
    Page(value) { definition = value; },
    console,
    setTimeout,
    clearTimeout,
    wx: runtimeWx,
    require(name) {
      if (name.endsWith('/orgSession')) return { getSnapshot: () => ({ orgId: 'org-a', contextId: 'context-a', role: 'user' }), isCurrent: () => true, consume: () => ({ changed: false }) };
      if (name.endsWith('/auditSigningDrafts')) return { setHandoff(value) { handoff = value; } };
      if (name.endsWith('/trustedNavigation')) return { navigateToTrustedRoute() { navigated = true; } };
      if (name.endsWith('/dialogKeyboard')) return { dialogKeyboardBehavior: {} };
      return ownRequire(name);
    }
  }, { filename: source });

  const page = {
    ...definition,
    data: {
      ...definition.data,
      activeApprovalStep: { id: 'step-a', round: 1 },
      files: [{ id: 'file-a', fileHash: 'hash-a' }]
    },
    _pageActive: true,
    setData(values, callback) {
      Object.assign(this.data, values);
      if (callback) callback();
    },
    ensureSigningDraft() { return { files: {}, materials: [], locked: false }; }
  };

  page._showSignaturePad('file-a', true);
  assert.equal(page._signingEntryOrientation, 'portrait');
  assert.equal(handoff.pad, true);
  assert.equal(handoff.entryOrientation, 'portrait');
  assert.equal(navigated, true);
  assert.equal(page.data.detailOrientation, 'auto');

  page.restoreSigningOrientation();
  assert.equal(page.data.detailOrientation, 'portrait', '回到审核详情时先恢复进入签名板前的方向');
  await new Promise(resolve => setTimeout(resolve, 360));
  assert.equal(page.data.detailOrientation, 'auto', '方向恢复后继续跟随设备旋转');

  handoff = null;
  navigated = false;
  page._signingEntryOrientation = '';
  page._preparedSigningPreview = null;
  page.prepareSigningPreview = () => null;
  page.openSigningWorkspace('file-a', 'pen');
  assert.equal(page._signingEntryOrientation, 'portrait', '文件直接书写和位置调整入口也必须记录进入前方向');
  assert.equal(handoff.pad, undefined);
  assert.equal(handoff.entryOrientation, 'portrait');
  assert.equal(navigated, true);

  const markup = fs.readFileSync(source.replace('.js', '.wxml'), 'utf8');
  const configuration = JSON.parse(fs.readFileSync(source.replace('.js', '.json'), 'utf8'));
  assert(markup.startsWith('<page-meta page-orientation="{{detailOrientation}}"'));
  assert.equal(configuration.pageOrientation, 'auto');
  console.log('PASS 空白签名板返回审核详情后恢复进入前方向，并继续跟随设备旋转');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
