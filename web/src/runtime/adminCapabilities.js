import { computed, inject, provide, unref } from 'vue';

const profileKey = Symbol('admin-capabilities');
export function provideAdminCapabilities(profile) { provide(profileKey, profile); }
export function useAdminCapability(permission) {
  const profile = inject(profileKey, null);
  return computed(() => {
    const current = unref(profile);
    const key = typeof permission === 'function' ? permission() : permission;
    return current?.adminLevel === 'super_admin' || current?.permissions?.[key] === true;
  });
}
