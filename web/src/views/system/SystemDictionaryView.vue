<template>
  <div class="page stack">
    <WorkspaceHero
      tone="admin"
      :page-name="copy.system.dictionaryTitle"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />

    <section class="card stack">
      <div class="panel-head">
        <span class="section-title">{{ copy.system.dictionaryTitle }}</span>
        <button type="button" class="btn-quiet" @click="load">{{ copy.audit.actionRefresh }}</button>
      </div>
      <p class="notice-line">{{ copy.system.dictionaryNote }}</p>
      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>

      <div v-for="group in groups" :key="group.key" class="stack-tight">
        <span class="field-label">{{ group.label }}</span>
        <div v-if="!group.items.length" class="empty-state">{{ copy.common.empty }}</div>
        <div v-else class="row row-wrap">
          <span v-for="item in group.items" :key="item.id || item.name" class="chip chip-sky break-all">
            {{ item.name }}
          </span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import copy from '@/locales/zh-CN/index.js';
import { callApi, errorText } from '@/runtime/api.js';
import { roleLabelOf, session } from '@/runtime/session.js';

const router = useRouter();
const loading = ref(true);
const loadNotice = ref('');
const departments = ref([]);
const identities = ref([]);
const workGroups = ref([]);

const displayName = computed(() => {
  const context = session.context || {};
  return context.name || (session.user && session.user.name) || '';
});
const orgName = computed(() => (session.context && session.context.organizationName) || '');
const roleLine = computed(() => {
  const context = session.context;
  if (!context) return '';
  return context.assignmentLabel || context.identityName || roleLabelOf(context);
});

const groups = computed(() => [
  { key: 'department', label: copy.system.departmentTitle, items: departments.value },
  { key: 'identity', label: copy.system.identityTitle, items: identities.value },
  { key: 'workGroup', label: copy.system.workGroupTitle, items: workGroups.value }
]);

function goWorkRole() {
  router.push({ name: 'workRole' });
}

function pickList(result, key) {
  if (!result) return [];
  if (Array.isArray(result[key])) return result[key];
  if (Array.isArray(result.items)) return result.items;
  if (Array.isArray(result.list)) return result.list;
  return [];
}

async function load() {
  loading.value = true;
  loadNotice.value = '';
  try {
    const [deptResult, identityResult, groupResult] = await Promise.all([
      callApi('listDepartments', {}),
      callApi('listIdentities', {}),
      callApi('listWorkGroups', {})
    ]);
    departments.value = pickList(deptResult, 'departments');
    identities.value = pickList(identityResult, 'identities');
    workGroups.value = pickList(groupResult, 'workGroups');
  } catch (error) {
    loadNotice.value = errorText(error, copy.errors.requestFailed);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
