/**
 * Lightweight event bus for cross-page communication.
 * Used to notify portal page of approval actions from detail/list pages
 * so the notification badge updates without a full page reload.
 */
var events = {};

function on(event, callback) {
  if (!events[event]) events[event] = [];
  events[event].push(callback);
}

function off(event, callback) {
  if (!events[event]) return;
  events[event] = events[event].filter(function(cb) { return cb !== callback; });
}

function emit(event, data) {
  if (!events[event]) return;
  events[event].forEach(function(cb) {
    try { cb(data); } catch (e) { console.error('[eventBus]', event, e); }
  });
}

module.exports = { on: on, off: off, emit: emit };
