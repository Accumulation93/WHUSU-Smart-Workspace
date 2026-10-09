import { callApi, errorText, requireSuccess } from './api.js';
import { session } from './session.js';
import { showToast } from './notify.js';

let pending = null;

export function armMessageReceipt(item, destination) {
  pending = {
    id: item.id, organizationId: item.organizationId, destination,
    contextId: session.context?.contextId, expires: Date.now() + 30000
  };
  return pending;
}

export function cancelMessageReceipt(receipt) {
  if (!receipt || pending === receipt) pending = null;
}

export async function completeMessageReceipt(route) {
  const receipt = pending;
  if (!receipt) return;
  if (Date.now() > receipt.expires || receipt.contextId !== session.context?.contextId
    || session.status !== 'authenticated') { pending = null; return; }
  if (route.name !== receipt.destination.name
    || Object.entries(receipt.destination.params || {}).some(([key, value]) => String(route.params[key]) !== String(value))) return;
  pending = null;
  try {
    requireSuccess(await callApi('markNotificationRead', { id: receipt.id, organizationId: receipt.organizationId }));
  } catch (error) { showToast(errorText(error)); }
}
