import { callApi } from './api.js';
import { session } from './session.js';
export const personLinkScope = () => JSON.stringify([session.status, session.user?.personId || session.user?.id, session.context]);
let queue = [], running = false;
export function resolvePersonLink(reference) {
  return new Promise(resolve => { queue.push({ reference, scope: personLinkScope(), resolve }); if (!running) { running = true; queueMicrotask(flush); } });
}
async function flush() {
  while (queue.length) {
    const batch = queue.splice(0, 100), scope = personLinkScope();
    const references = [...new Map(batch.filter(item => item.scope === scope).map(item => [item.reference.kind + ':' + item.reference.id, item.reference])).values()];
    let links = [];
    try { if (references.length) { const result = await callApi('resolvePersonLinks', { references }); if (result.status === 'success') links = result.links || []; } } catch {}
    const targets = new Map(links.map(link => [link.ref, link.target]));
    for (const item of batch) item.resolve(item.scope === personLinkScope() ? targets.get(item.reference.kind + ':' + item.reference.id) || null : null);
  }
  running = false;
}
export function personLinkRoute(target) {
  if (target.kind === 'contact') return { name: 'hrProfile', query: { tab: 'directory', contactKey: target.key } };
  if (target.kind === 'hr') return { name: 'adminConsole', query: { subApp: 'hr', tab: 'hrInfo', hrId: target.hrId } };
  return null;
}
