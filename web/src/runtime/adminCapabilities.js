import { computed, inject, provide, unref } from 'vue';
import { hasCapability } from '@/shared/authorizationAccessView.js';

const profileKey = Symbol('admin-capabilities');
export function provideAdminCapabilities(profile) { provide(profileKey, profile); }
export function useAdminAuthorizationAccess() {
  const profile = inject(profileKey, null);
  return computed(() => unref(profile)?.authorizationAccess || null);
}
export function hasAdminCapability(profile, permission, capability) {
  if (!profile) return false;
  if (profile.authorizationAccess?.mode === 'enforced') return hasCapability(profile.authorizationAccess, capability, true);
  return profile.adminLevel === 'super_admin' || profile.permissions?.[permission] === true;
}
export function useAdminCapability(permission, capability) {
  const profile = inject(profileKey, null);
  return computed(() => {
    const current = unref(profile);
    const key = typeof permission === 'function' ? permission() : permission;
    const action = typeof capability === 'function' ? capability() : capability;
    return hasAdminCapability(current, key, action);
  });
}
