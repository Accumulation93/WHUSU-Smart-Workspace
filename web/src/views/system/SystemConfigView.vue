<template>
  <div class="page stack">
    <WorkspaceHero
      tone="admin"
      :page-name="copy.system.configTitle"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />

    <section class="card stack">
      <div class="panel-head">
        <span class="section-title">{{ copy.system.configTitle }}</span>
        <button type="button" class="btn-quiet" @click="load">{{ copy.audit.actionRefresh }}</button>
      </div>
      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>
      <div v-if="loading" class="empty-state">{{ copy.common.loading }}</div>
      <div v-else class="list">
        <div class="list-row">
          <div class="list-row-main stack-tight">
            <span class="soft">{{ copy.system.timezoneLabel }}</span>
            <span class="list-row-title">{{ config.timezoneText }}</span>
          </div>
        </div>
        <div class="list-row">
          <div class="list-row-main stack-tight">
            <span class="soft">{{ copy.system.configVersionLabel }}</span>
            <span class="list-row-title">{{ config.version }}</span>
          </div>
        </div>
        <div class="list-row">
          <div class="list-row-main stack-tight">
            <span class="soft">{{ copy.system.currentOrganizationLabel }}</span>
            <span class="list-row-title break-all">{{ config.organization }}</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import copy from '@/locales/zh-CN/index.js';
import { callApi, errorText } from '@/runtime/api.js';
import { roleLabelOf, session } from '@/runtime/session.js';

const router = useRouter();
const loading = ref(true);
const loadNotice = ref('');
const config = reactive({ timezoneText: '', version: '', organization: '' });

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
    const result = await callApi('getSystemConfig', {});
    const offset = Number(result.systemTimezoneOffset);
    config.timezoneText = Number.isFinite(offset)
      ? 'UTC' + (offset >= 0 ? '+' : '') + offset
      : '';
    config.version = String(result.timezoneConfigVersion || '');
    const current = result.config && result.config.currentOrganization;
    config.organization = typeof current === 'string' ? current : (current && current.name) || '';
  } catch (error) {
    loadNotice.value = errorText(error, copy.errors.requestFailed);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
