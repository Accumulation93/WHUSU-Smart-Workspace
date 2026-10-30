'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createRequire } = require('module');
const root = path.resolve(__dirname, '..');
const filename = path.join(root, 'miniprogram/subpackages/venue/components/pendingApprovals/pendingApprovals.js');
const nativeRequire = createRequire(filename);
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

function harness() {
  let definition;
  const calls = [], timers = new Set(), listeners = new Set(), events = [], replies = [];
  let scope = 1;
  const session = {
    consume() { return { changed: false }; },
    beginRequest(host, channel) {
      host.sequence = host.sequence || {};
      host.sequence[channel] = (host.sequence[channel] || 0) + 1;
      return { scope, channel, sequence: host.sequence[channel], generation: host.generation || 0 };
    },
    isRequestCurrent(host, request) {
      return request.scope === scope && request.generation === (host.generation || 0)
        && request.sequence === host.sequence[request.channel];
    },
    invalidateRequests(host) { host.generation = (host.generation || 0) + 1; }
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    Component(value) { definition = value; },
    setInterval(fn) { timers.add(fn); return fn; }, clearInterval(fn) { timers.delete(fn); },
    setTimeout, clearTimeout,
    require(request) {
      if (request.endsWith('/utils/api')) return {
        callFunction(options) { calls.push(options); return replies.length ? replies.shift() : Promise.resolve({ status: 'success', pending: [] }); },
        getErrorText(error) { return error.message; }, showShortToast() {}
      };
      if (request.endsWith('/utils/orgSession')) return session;
      if (request.endsWith('/utils/eventBus')) return {
        on(name, callback) { listeners.add(callback); }, off(name, callback) { listeners.delete(callback); },
        emit(name) { events.push(name); }
      };
      if (request.endsWith('/utils/dateTime')) return { formatSystemClock() { return '12:00'; } };
      if (request.endsWith('/utils/workContextPresentation')) return {
        decoratePendingBooking(value) { return value; }, decorateApproverCandidates(value) { return value; }, showWorkContextModal() {}
      };
      if (request.endsWith('/utils/trustedNavigation')) return { navigateToTrustedRoute() {} };
      return nativeRequire(request);
    }
  }, { filename });
  const host = Object.assign({}, definition.methods, {
    data: Object.assign(JSON.parse(JSON.stringify(definition.data)), { active: true }),
    triggerEvent(name, detail) { events.push({ name, detail }); },
    setData(patch) {
      Object.assign(this.data, patch);
      if ('approvalVisible' in patch || 'nextApproverPickerVisible' in patch) {
        definition.observers['approvalVisible,nextApproverPickerVisible'].call(this, this.data.approvalVisible, this.data.nextApproverPickerVisible);
      }
    }
  });
  return { host, definition, calls, timers, listeners, events, replies, changeScope() { scope++; } };
}

async function run() {
  const h = harness();
  const delayed = deferred();
  h.replies.push(delayed.promise);
  h.definition.lifetimes.attached.call(h.host);
  h.definition.pageLifetimes.show.call(h.host);
  assert.equal(h.calls.length, 1, '首次挂载及页面显示不得重复加载');
  assert.equal(h.timers.size, 1);
  h.definition.pageLifetimes.hide.call(h.host);
  delayed.resolve({ status: 'success', pending: [{ id: 'late' }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.host.data.pending.length, 0, '隐藏后迟到列表不得回填');
  assert.equal(h.timers.size, 0);
  assert.equal(h.listeners.size, 0);
  h.definition.pageLifetimes.show.call(h.host);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.length, 2, '返回时读取权威目录');
  const candidate = deferred();
  h.replies.push(candidate.promise);
  h.host.setData({ approvalVisible: true, approvalTarget: { id: 'b1', currentFlowId: 'f1' }, approvalAction: 'approve', canDesignateNext: true });
  const opening = h.host.openNextApproverPicker();
  h.host.closeApproval();
  candidate.resolve({ status: 'success', candidates: [{ assignmentId: 'a1' }] });
  await opening;
  assert.equal(h.host.data.nextApproverPickerVisible, false, '关闭详情后候选请求不能重新打开弹窗');
  assert.equal(h.events.filter(e => e.name === 'dialogchange').at(-1).detail.visible, false);

  const write = deferred();
  h.replies.push(write.promise);
  h.host.setData({ approvalVisible: true, approvalTarget: { id: 'b1', canProcessInCurrentContext: true,
    approvalFlowId: 'f1', approvalCurrentStep: 0, currentFlowId: 'f1' }, approvalAction: 'approve', approvalComment: '同意' });
  const submitting = h.host.submitApproval();
  await h.host.submitApproval();
  h.host.closeApproval();
  assert.equal(h.calls.filter(c => c.name === 'approveVenueBookingStep').length, 1, '双击只能提交一次');
  assert.equal(h.host.data.approvalVisible, true, '写入期间不能关闭确认窗口');
  h.definition.pageLifetimes.hide.call(h.host);
  write.resolve({ status: 'success' });
  await submitting;
  assert.equal(h.host.data.approvalVisible, false);
  assert.equal(h.host.data.pending.length, 0);
  assert.equal(h.events.includes('approval:done'), false, '隐藏后的写响应不得操作已离开的界面');
  h.definition.lifetimes.detached.call(h.host);
  assert.equal(h.timers.size, 0);
  assert.equal(h.listeners.size, 0);

  const manageSource = fs.readFileSync(path.join(root, 'miniprogram/subpackages/venue/pages/venueManage/venueManage.js'), 'utf8');
  let page;
  vm.runInNewContext(manageSource, { Page(value) { page = value; }, require(request) {
    if (request.endsWith('/dialogKeyboard')) return { dialogKeyboardBehavior: {} };
    return {};
  } });
  const context = { data: { visibleTabs: [{ key: 'pending' }] }, setData(patch) { Object.assign(this.data, patch); } };
  page.switchTab.call(context, { currentTarget: { dataset: { tab: 'pending' } } });
  assert.equal(context.data.activeTab, 'pending', '管理端待办必须留在当前页签');
  page.switchTab.call(context, { currentTarget: { dataset: { tab: 'purposes' } } });
  assert.equal(context.data.activeTab, 'pending', '无授权页签不能进入');
  console.log('场地待办组件验证通过：页内切换、授权入口、单次加载、隐藏清理、迟到列表与候选、重复提交、写入中关闭和迟到写响应。');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
