import { callApi } from './api.js';
import copy from '@/locales/zh-CN/index.js';

export function auditRequests() {
  const pending = new Set();
  let disposed = false;
  async function call(name, data) {
    if (disposed) throw new Error('closed');
    const controller = new AbortController();
    const entry = { controller, timer: null, timedOut: false };
    entry.timer = setTimeout(() => { entry.timedOut = true; controller.abort(); }, 15000);
    pending.add(entry);
    try { return await callApi(name, data, { signal: controller.signal }); }
    catch (error) { if (entry.timedOut) throw new Error(copy.errors.requestFailed); throw error; }
    finally { clearTimeout(entry.timer); pending.delete(entry); }
  }
  function dispose() {
    disposed = true;
    pending.forEach(entry => { clearTimeout(entry.timer); entry.controller.abort(); });
    pending.clear();
  }
  return { call, dispose };
}
