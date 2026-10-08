<template>
  <div class="page stack">
    <section class="card stack">
      <div class="card-title">{{ copy.workRole.organizationLabel }}</div>
      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>
      <label v-if="organizations.length > 4" class="field">
        <span class="field-label">{{ copy.common.search }}</span>
        <input
          v-model="keyword"
          class="field-input"
          type="search"
          :placeholder="copy.workRole.searchPlaceholder"
        />
      </label>
      <div v-if="!organizations.length" class="empty-state">{{ copy.workRole.emptyOrg }}</div>
      <div v-else class="row row-wrap">
        <button
          v-for="organization in filteredOrganizations"
          :key="organization.id"
          type="button"
          class="btn-quiet"
          :class="{ 'tab-active': organization.id === draftOrganizationId }"
          @click="draftOrganizationId = organization.id"
        >
          {{ organization.name }}
          <span v-if="organization.id === currentOrganizationId" class="soft">· {{ copy.workRole.currentBadge }}</span>
        </button>
      </div>
    </section>

    <section class="card stack">
      <div class="card-title">{{ copy.workRole.assignmentTitle }}</div>
      <div v-if="!assignments.length" class="empty-state">{{ copy.workRole.emptyAssignment }}</div>
      <div v-else class="list">
        <button
          v-for="item in assignments"
          :key="item.contextId"
          type="button"
          class="role-row"
          :class="{ 'role-row-current': item.isCurrent }"
          :disabled="applying"
          @click="apply(item)"
        >
          <span class="grow stack-tight">
            <span class="list-row-title">{{ item.label }}</span>
            <span class="soft">{{ item.organizationName }}</span>
          </span>
          <span v-if="item.isCurrent" class="chip chip-blue">{{ copy.workRole.currentBadge }}</span>
          <span v-else class="chip chip-sky">{{ applying ? copy.workRole.applying : copy.workRole.apply }}</span>
        </button>
      </div>
      <p class="soft">{{ copy.workRole.noAssignmentHint }}</p>
    </section>

    <section v-if="admins.length" class="card stack">
      <div class="card-title">{{ copy.workRole.adminTitle }}</div>
      <div class="list">
        <button
          v-for="item in admins"
          :key="item.contextId"
          type="button"
          class="role-row"
          :class="{ 'role-row-current': item.isCurrent }"
          :disabled="applying"
          @click="apply(item)"
        >
          <span class="grow stack-tight">
            <span class="list-row-title">{{ item.label }}</span>
            <span class="soft">{{ item.organizationName }}</span>
          </span>
          <span v-if="item.isCurrent" class="chip chip-blue">{{ copy.workRole.currentBadge }}</span>
          <span v-else class="chip chip-sky">{{ applying ? copy.workRole.applying : copy.workRole.apply }}</span>
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import copy from '@/locales/zh-CN/index.js';
import { errorText } from '@/runtime/api.js';
import { showToast } from '@/runtime/notify.js';
import { activateContext, reloadSession, session } from '@/runtime/session.js';

const router = useRouter();
const keyword = ref('');
const draftOrganizationId = ref('');
const applying = ref(false);
const loadNotice = ref('');
const loaded = ref(false);

const organizations = computed(() => session.organizations || []);
const currentOrganizationId = computed(() => (session.context && session.context.organizationId) || '');

const filteredOrganizations = computed(() => {
  const query = keyword.value.trim().toLowerCase();
  if (!query) return organizations.value;
  return organizations.value.filter((item) => String(item.name || '').toLowerCase().includes(query));
});

const draftContexts = computed(() => (session.workContexts || [])
  .filter((item) => item.organizationId === draftOrganizationId.value));

const assignments = computed(() => draftContexts.value.filter((item) => item.role !== 'admin'));
const admins = computed(() => draftContexts.value.filter((item) => item.role === 'admin'));

async function ensureLoaded() {
  // 直接打开这个地址时，会话资料可能还没取到，需要自己补一次。
  loaded.value = true;
  if (session.status !== 'authenticated') {
    await reloadSession();
  }
  draftOrganizationId.value = currentOrganizationId.value
    || (organizations.value[0] && organizations.value[0].id)
    || '';
}

async function apply(item) {
  if (applying.value || item.isCurrent) return;
  applying.value = true;
  loadNotice.value = '';
  try {
    await activateContext(item.contextId);
    showToast(copy.workRole.switched);
    // 与小程序一致：切换后回到门户，所有子应用按新角色重新初始化。
    router.replace({ name: 'portal' });
  } catch (error) {
    loadNotice.value = errorText(error, copy.workRole.switchFailed);
  } finally {
    applying.value = false;
  }
}

onMounted(ensureLoaded);
</script>

<style scoped>
.role-row {
  display: flex;
  align-items: center;
  gap: var(--ui-inline-gap);
  width: 100%;
  padding: var(--ui-list-padding-y) var(--ui-list-padding-x);
  border: 1px solid rgba(226, 237, 247, 0.9);
  border-radius: var(--ui-list-radius);
  background: var(--ui-surface-soft);
  color: var(--ui-text);
  font-family: inherit;
  font-size: var(--ui-type-body);
  text-align: left;
  cursor: pointer;
}

.role-row-current {
  border-color: var(--ui-line-blue);
  background: linear-gradient(135deg, rgba(219, 234, 254, 0.7) 0%, rgba(239, 246, 255, 0.6) 100%);
}

.role-row:disabled {
  cursor: default;
  opacity: 0.7;
}

.tab-active {
  background: var(--ui-chip-blue-bg);
  color: var(--ui-chip-blue-text);
  font-weight: 600;
}
</style>
