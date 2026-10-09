import copy from '@/locales/zh-CN/index.js';
import { requireSuccess } from './api.js';
import { activateContext, session } from './session.js';
import { confirmAction } from './notify.js';
import { notifyModuleBuilding } from './porting.js';
import { armMessageReceipt, cancelMessageReceipt } from './messageReceipt.js';

const targets = {
  '/subpackages/audit/pages/pendingApprovals/pendingApprovals': 'auditPending',
  '/subpackages/audit/pages/mySubmissions/mySubmissions': 'auditMySubmissions',
  '/subpackages/audit/pages/myApprovalHistory/myApprovalHistory': 'auditHistory',
  '/subpackages/venue/pages/pendingVenueApprovals/pendingVenueApprovals': 'venuePending',
  '/subpackages/venue/pages/myVenueBookings/myVenueBookings': 'venueMyBookings',
  '/subpackages/venue/pages/venueBooking/venueBooking': 'venueBookings',
  '/subpackages/scoring/pages/scorerTasks/scorerTasks': 'scoringTasks'
};

export function messageRoute(item) {
  const target = String(item?.targetUrl || '');
  const [path, query = ''] = target.split('?');
  if (path === '/subpackages/audit/pages/submissionDetail/submissionDetail') {
    const id = new URLSearchParams(query).get('id');
    return id ? { name: 'auditSubmission', params: { id } } : null;
  }
  return targets[path] ? { name: targets[path] } : null;
}

let opening = false;
export async function openMessageTarget(router, item, notification = false) {
  if (opening) return false;
  const destination = messageRoute(item);
  if (!destination) { notifyModuleBuilding(); return false; }
  opening = true;
  let receipt;
  try {
    const initialContext = session.context?.contextId;
    const differentOrg = item.organizationId && item.organizationId !== session.context?.organizationId;
    const differentContext = item.contextId && item.contextId !== initialContext;
    if (differentOrg || differentContext) {
      const target = session.workContexts.find(context => context.contextId === item.contextId
        && (!item.organizationId || context.organizationId === item.organizationId));
      if (!target) throw new Error(copy.messages.selectOrganizationOrWorkContext);
      const accepted = await confirmAction({
        title: copy.messages.switchWorkContext,
        body: [item.organizationName, target.label || target.assignmentLabel].filter(Boolean).join(' · '),
        confirmText: copy.messages.switchAndView, cancelText: copy.common.cancel
      });
      if (!accepted || initialContext !== session.context?.contextId) return false;
      requireSuccess(await activateContext(target.contextId));
      await router.replace({ name: 'portal' });
    }
    const activeContext = session.context?.contextId;
    cancelMessageReceipt();
    if (notification && item.isRead === false) receipt = armMessageReceipt(item, destination);
    const failure = await router.push(destination);
    if (failure || router.currentRoute.value.name !== destination.name
      || session.status !== 'authenticated' || activeContext !== session.context?.contextId) {
      cancelMessageReceipt(receipt);
      return false;
    }
    return true;
  } catch (error) {
    cancelMessageReceipt(receipt);
    throw error;
  } finally { opening = false; }
}
