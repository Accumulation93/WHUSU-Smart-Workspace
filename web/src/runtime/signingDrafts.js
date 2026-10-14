import { createDraftStore, clone } from '@/shared/auditInk.js';
export const signingDrafts = createDraftStore();
let handoff = null;
export function setSigningHandoff(value) { handoff = value; }
export function getSigningHandoff() { return handoff; }
export function resetSigningDrafts() { handoff = null; signingDrafts.reset(); }
export function stepDraft(submission, step, files) {
  const key = [submission.id, step.id, step.round || 1, ...files.map(file => file.id + ':' + file.fileHash)].join('|');
  return signingDrafts.open(key);
}
export function restoreDraft(draft, saved) {
  const locked = draft.locked, pendingRead = draft.pendingRead;
  Object.keys(draft).forEach(key => { delete draft[key]; });
  Object.assign(draft, clone(saved));
  if (locked) { draft.locked = true; draft.pendingRead = pendingRead; }
}
