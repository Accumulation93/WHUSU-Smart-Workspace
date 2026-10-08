<template>
  <div class="page stack">
    <WorkspaceHero
      tone="admin"
      :page-name="copy.system.permissionsTitle"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />

    <section class="card stack">
      <div class="panel-head">
        <span class="section-title">{{ copy.system.permissionsTitle }}</span>
        <button type="button" class="btn-quiet" @click="load">{{ copy.audit.actionRefresh }}</button>
      </div>
      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>
      <div v-if="loading" class="empty-state">{{ copy.common.loading }}</div>
      <template v-else>
        <div class="list-row">
          <div class="list-row-main stack-tight">
            <span class="soft">{{ copy.system.adminLevelLabel }}</span>
            <span class="list-row-title">{{ adminLevel }}</span>
          </div>
        </div>
        <div class="stack-tight">
          <span class="field-label">{{ copy.system.permissionListTitle }}</span>
          <div v-if="!permissions.length" class="empty-state">{{ copy.system.noPermission }}</div>
          <div v-else class="row row-wrap">
            <span v-for="key in permissions" :key="key" class="chip chip-sky break-all">{{ key }}</span>
          </div>
        </div>
      </template>
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
const adminLevel = ref('');
const permissions = ref([]);

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

function goWorkRole() {
  router.push({ name: 'workRole' });
}

async function load() {
  loading.value = true;
  loadNotice.value = '';
  try {
    const result = await callApi('getMyAdminPermissions', {});
    if (result.status !== 'success') {
      loadNotice.value = result.message || copy.errors.permissionDenied;
      return;
    }
    adminLevel.value = String(result.adminLevel || '');
    permissions.value = Array.isArray(result.permissionKeys) ? result.permissionKeys : [];
  } catch (error) {
    loadNotice.value = errorText(error, copy.errors.permissionDenied);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
