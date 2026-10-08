<template>
  <div class="page stack">
    <WorkspaceHero
      tone="admin"
      :page-name="copy.system.auditTemplateTitle"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />

    <section class="card stack">
      <div class="panel-head">
        <span class="section-title">{{ copy.system.auditTemplateTitle }}</span>
        <button type="button" class="btn-quiet" @click="load">{{ copy.audit.actionRefresh }}</button>
      </div>
      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>
      <div v-if="loading" class="empty-state">{{ copy.common.loading }}</div>
      <div v-else-if="!templates.length" class="empty-state">{{ copy.system.emptyTemplates }}</div>
      <div v-else class="list">
        <div v-for="template in templates" :key="template.id" class="list-row">
          <div class="list-row-main stack-tight">
            <span class="list-row-title break-all">{{ template.name }}</span>
            <span v-if="template.description" class="muted break-all">{{ template.description }}</span>
            <span class="soft">{{ formatTemplate(copy.system.templateStepCount, [template.stepCount]) }}</span>
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
import { formatTemplate } from '@/runtime/audit.js';
import { roleLabelOf, session } from '@/runtime/session.js';

const router = useRouter();
const loading = ref(true);
const loadNotice = ref('');
const templates = ref([]);

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
    const result = await callApi('listAvailableFlowTemplates', {});
    templates.value = Array.isArray(result.templates) ? result.templates : [];
  } catch (error) {
    templates.value = [];
    loadNotice.value = errorText(error, copy.errors.requestFailed);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
