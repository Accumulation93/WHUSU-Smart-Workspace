const { createDraftStore, clone } = require('./auditInk');
const store = createDraftStore();
let handoff = null;
function setHandoff(value) { handoff = value; }
function getHandoff() { return handoff; }
function reset() { handoff = null; store.reset(); }
function restore(draft, saved) {
  const locked = draft.locked, pendingRead = draft.pendingRead;
  Object.keys(draft).forEach(key => { delete draft[key]; });
  Object.assign(draft, clone(saved));
  if (locked) { draft.locked = true; draft.pendingRead = pendingRead; }
}
module.exports = { store, setHandoff, getHandoff, reset, restore };
