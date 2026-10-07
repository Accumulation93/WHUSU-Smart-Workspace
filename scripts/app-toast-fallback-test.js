'use strict';

/*
 * 统一状态提示标准件：渲染失败的实例不得被注销。
 *
 * 历史问题：某个页面的 app-toast 实例一旦渲染异常，控制器会把它从实例栈里摘掉，
 * 于是这次提示回退成微信原生弹框，之后该页面的提示也全部是原生的——
 * 表现为“HR 信息保存后的已更新还是微信原生件”。
 * 这里锁住修复后的行为：逐个尝试、成功后正常承接、失败不销毁实例。
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const moduleFile = path.join(root, 'miniprogram/utils/appToast.js');

function loadAppToast() {
  const nativeCalls = [];
  const sandbox = {
    console,
    module: { exports: {} },
    setTimeout,
    clearTimeout,
    wx: {
      showToast: (options) => nativeCalls.push(options),
      showLoading: (options) => nativeCalls.push(options),
      hideToast: () => {},
      hideLoading: () => {}
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(moduleFile, 'utf8'), sandbox, { filename: moduleFile });
  return { appToast: sandbox.module.exports, wx: sandbox.wx, nativeCalls };
}

const { appToast, wx, nativeCalls } = loadAppToast();
appToast.installAppToast();

const rendered = [];
const broken = { render() { throw new Error('render failed'); } };
const good = { render(payload) { rendered.push(payload); } };
appToast.registerInstance(broken);
appToast.registerInstance(good);

wx.showToast({ title: '已更新', icon: 'success' });
assert.strictEqual(rendered.length, 1, '有可用实例时必须由自绘标准件承接提示');
assert.strictEqual(rendered[0].text, '已更新');
assert.strictEqual(rendered[0].state, 'success');
assert.deepStrictEqual(nativeCalls, [], '标准件承接时不得回退微信原生提示');

// 渲染失败的实例仍在栈里（旧实现会在这里被摘掉），继续可用
wx.showToast({ title: '第二次', icon: 'none' });
assert.strictEqual(rendered.length, 2, '渲染失败不得注销实例，后续提示仍走标准件');
assert.deepStrictEqual(nativeCalls, []);

// 只有坏实例时才回退原生实现，且不抛异常
const onlyBroken = loadAppToast();
onlyBroken.appToast.installAppToast();
onlyBroken.appToast.registerInstance({ render() { throw new Error('boom'); } });
onlyBroken.wx.showToast({ title: '回退提示', icon: 'none' });
assert.strictEqual(onlyBroken.nativeCalls.length, 1, '没有可用实例时必须回退微信原生提示');

console.log('统一状态提示标准件回归通过：渲染失败不注销实例、无实例才回退原生。');
