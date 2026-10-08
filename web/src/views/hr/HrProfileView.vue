<template>
  <div class="page stack">
    <WorkspaceHero
      :page-name="copy.hr.profileTitle"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />

    <section class="card stack">
      <div class="panel-head">
        <span class="section-title">{{ copy.hr.profileTitle }}</span>
        <button type="button" class="btn-quiet" @click="load">{{ copy.audit.actionRefresh }}</button>
      </div>
      <p class="notice-line">{{ copy.hr.profileReadOnlyNote }}</p>
      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>

      <div v-if="loading" class="empty-state">{{ copy.common.loading }}</div>
      <div v-else class="list">
        <div v-for="field in fields" :key="field.key" class="list-row">
          <div class="list-row-main stack-tight">
            <span class="soft">{{ field.label }}</span>
            <span class="list-row-title break-all">{{ field.value || copy.common.empty }}</span>
          </div>
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
const fields = ref([]);

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
    const result = await callApi('getUserHrProfile', {});
    if (result.status !== 'success') {
      loadNotice.value = result.message || copy.errors.requestFailed;
      return;
    }
    const profile = result.profile || result.user || {};
    const context = session.context || {};
    fields.value = [
      { key: 'name', label: copy.hr.nameLabel, value: profile.name || displayName.value },
      { key: 'department', label: copy.hr.departmentLabel, value: profile.department || context.department || '' },
      { key: 'identity', label: copy.hr.identityLabel, value: profile.identityName || context.identityCategoryName || context.identityName || '' },
      { key: 'workGroup', label: copy.hr.workGroupLabel, value: profile.workGroup || context.workGroup || '' },
      { key: 'assignment', label: copy.hr.assignmentLabel, value: profile.assignmentLabel || context.assignmentLabel || '' }
    ];
  } catch (error) {
    loadNotice.value = errorText(error, copy.errors.requestFailed);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
