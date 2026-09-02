'use strict';

// 该文件必须在 app.js 的其他业务依赖之前加载。这里只补齐旧版鸿蒙微信
// 运行时可能缺失的基础能力，不改变业务结果，也不引入编译器 runtime。
function installLanguageFallbacks() {
  if (typeof Number.isFinite !== 'function') {
    Number.isFinite = function(value) {
      return typeof value === 'number' && isFinite(value);
    };
  }
  if (typeof String.prototype.includes !== 'function') {
    String.prototype.includes = function(search, start) {
      return this.indexOf(search, start || 0) >= 0;
    };
  }
  if (typeof String.prototype.padStart !== 'function') {
    String.prototype.padStart = function(length, fill) {
      const source = String(this);
      const target = Number(length) || 0;
      let padding = fill === undefined ? ' ' : String(fill);
      if (!padding) padding = ' ';
      let prefix = '';
      while (prefix.length < target - source.length) prefix += padding;
      return prefix.slice(0, Math.max(0, target - source.length)) + source;
    };
  }
  if (typeof String.prototype.padEnd !== 'function') {
    String.prototype.padEnd = function(length, fill) {
      const source = String(this);
      const target = Number(length) || 0;
      let padding = fill === undefined ? ' ' : String(fill);
      if (!padding) padding = ' ';
      let suffix = '';
      while (suffix.length < target - source.length) suffix += padding;
      return source + suffix.slice(0, Math.max(0, target - source.length));
    };
  }
  if (typeof Array.prototype.includes !== 'function') {
    Array.prototype.includes = function(value, start) {
      return this.indexOf(value, start || 0) >= 0;
    };
  }
  if (typeof Array.prototype.find !== 'function') {
    Array.prototype.find = function(predicate, thisArg) {
      for (let index = 0; index < this.length; index += 1) {
        if (predicate.call(thisArg, this[index], index, this)) return this[index];
      }
      return undefined;
    };
  }
  if (typeof Promise !== 'undefined' && typeof Promise.prototype.finally !== 'function') {
    Promise.prototype.finally = function(callback) {
      const constructor = this.constructor || Promise;
      return this.then(
        function(value) {
          return constructor.resolve(callback()).then(function() { return value; });
        },
        function(error) {
          return constructor.resolve(callback()).then(function() { throw error; });
        }
      );
    };
  }
}

function installWechatFallbacks() {
  if (typeof wx === 'undefined') return;
  if (typeof wx.nextTick !== 'function') {
    wx.nextTick = function(callback) { setTimeout(callback, 0); };
  }
  if (typeof wx.getDeviceInfo !== 'function' && typeof wx.getSystemInfoSync === 'function') {
    wx.getDeviceInfo = function() {
      try { return wx.getSystemInfoSync() || {}; } catch (_) { return {}; }
    };
  }
  if (typeof wx.getWindowInfo !== 'function' && typeof wx.getSystemInfoSync === 'function') {
    wx.getWindowInfo = function() {
      try { return wx.getSystemInfoSync() || {}; } catch (_) { return {}; }
    };
  }
}

installLanguageFallbacks();
installWechatFallbacks();

module.exports = {
  installLanguageFallbacks: installLanguageFallbacks,
  installWechatFallbacks: installWechatFallbacks
};
