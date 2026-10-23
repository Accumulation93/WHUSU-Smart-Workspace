const { callFunction } = require('../../../../utils/api');
const session = require('../../../../utils/orgSession');
const { navigateToTrustedRoute } = require('../../../../utils/trustedNavigation');
let queued = [], scheduled = false;
function resolve(reference) {
  return new Promise(resolveResult => {
    queued.push({ reference, scope: session.getSnapshot(), resolveResult });
    if (!scheduled) { scheduled = true; Promise.resolve().then(flush); }
  });
}
async function flush() {
  while (queued.length) {
  const batch = queued.splice(0, 100);
  const current = batch.filter(item => session.isCurrent(item.scope));
  const references = [...new Map(current.map(item => [item.reference.kind + ':' + item.reference.id, item.reference])).values()];
  let links = [];
  try {
    if (references.length) {
      const result = await callFunction({ name: 'resolvePersonLinks', data: { references } });
      if (result.status === 'success' && Array.isArray(result.links)) links = result.links;
    }
  } catch (_) {}
  const targets = new Map(links.map(link => [link.ref, link.target]));
  batch.forEach(item => item.resolveResult(session.isCurrent(item.scope) ? targets.get(item.reference.kind + ':' + item.reference.id) || null : null));
  }
  scheduled = false;
}
function open(target) {
  if (target.kind === 'contact') return navigateToTrustedRoute('/subpackages/workspace/pages/home/home?subApp=hr&tab=directory&contactKey=' + encodeURIComponent(target.key));
  if (target.kind === 'hr') return navigateToTrustedRoute('/subpackages/scoring/pages/admin/admin?subApp=hr&tab=hrInfo&hrId=' + encodeURIComponent(target.hrId));
}
module.exports = { resolve, open };
