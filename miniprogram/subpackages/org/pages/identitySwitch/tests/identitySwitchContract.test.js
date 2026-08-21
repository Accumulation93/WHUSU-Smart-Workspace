const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'identitySwitch.js'), 'utf8');

test('工作上下文只挂在自身组织下', () => {
  assert.doesNotMatch(source, /item\.scope === 'global' \|\|/);
  assert.match(source, /normalizeText\(item\.organizationId\) === normalizeText\(draftOrganizationId\)/);
});

test('激活工作上下文前校验其组织与当前草稿组织一致', () => {
  const handlerStart = source.indexOf('async onContextTap(e)');
  const activateStart = source.indexOf('authContext.activateContext(contextId)', handlerStart);
  const handler = source.slice(handlerStart, activateStart);
  assert.ok(handlerStart >= 0 && activateStart > handlerStart);
  assert.match(handler, /targetContext/);
  assert.match(handler, /targetContext\.organizationId/);
  assert.match(handler, /this\.data\.draftOrganizationId/);
  assert.match(handler, /return;/);
});
