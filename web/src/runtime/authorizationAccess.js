import { callApi, requireSuccess } from './api.js';
import { session } from './session.js';
import { bindAccess } from '@/shared/authorizationAccessView.js';
import copy from '@/locales/zh-CN/index.js';

export async function readCurrentAuthorizationAccess() {
  const context = session.context;
  const user = session.user;
  const result = requireSuccess(await callApi('getCurrentAuthorizationAccess', {}));
  if (session.status !== 'authenticated' || session.context !== context || session.user !== user) return null;
  const access = bindAccess(result, context);
  if (!access) throw new Error(copy.errors.permissionDenied);
  return access;
}
