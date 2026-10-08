<template>
  <div class="page stack">
    <WorkspaceHero
      tone="admin"
      :page-name="copy.venue.adminTitle"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />

    <section class="card stack">
      <div class="panel-head">
        <span class="section-title">{{ copy.venue.adminTitle }}</span>
        <button type="button" class="btn-quiet" @click="load">{{ copy.audit.actionRefresh }}</button>
      </div>
      <p class="notice-line">{{ copy.venue.adminNote }}</p>
      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>
      <div v-if="loading" class="empty-state">{{ copy.common.loading }}</div>
      <div v-else-if="!venues.length" class="empty-state">{{ copy.venue.emptyBookings }}</div>
      <div v-else class="list">
        <div v-for="venue in venues" :key="venue.id" class="list-row">
          <div class="list-row-main stack-tight">
            <span class="list-row-title break-all">{{ venue.name }}</span>
            <span v-if="venue.location" class="muted break-all">{{ venue.location }}</span>
            <span class="row row-wrap">
              <span class="chip" :class="venue.isActive === false || venue.is_active === 0 ? 'chip-orange' : 'chip-green'">
                {{ venue.isActive === false || venue.is_active === 0 ? copy.audit.statusLabels.withdrawn : copy.venue.statusApproved }}
              </span>
            </span>
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
const venues = ref([]);
const loading = ref(true);
const loadNotice = ref('');

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
    const result = await callApi('listVenues', {});
    if (result.status !== 'success') {
      venues.value = [];
      loadNotice.value = result.message || copy.venue.loadFailed;
      return;
    }
    venues.value = Array.isArray(result.venues) ? result.venues : [];
  } catch (error) {
    venues.value = [];
    loadNotice.value = errorText(error, copy.venue.loadFailed);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>
