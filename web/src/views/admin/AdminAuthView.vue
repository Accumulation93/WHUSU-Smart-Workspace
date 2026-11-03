<template>
  <div class="page stack">
    <WorkspaceHero
      tone="admin"
      :page-name="copy.admin.authTitle"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />

    <section class="card stack">
      <div class="panel-head">
        <span class="section-title">{{ copy.admin.authTitle }}</span>
        <button type="button" class="btn-quiet" @click="load">{{ copy.audit.actionRefresh }}</button>
      </div>
      <p class="notice-line">{{ copy.admin.accountDirectoryReadOnly }}</p>
      <p v-if="loadNotice" role="alert" class="notice-line">{{ loadNotice }}</p>
      <div v-if="loading" class="empty-state"><AppLoading :text="copy.common.loading" /></div>
      <div v-else-if="!loadNotice && !rows.length" class="empty-state">{{ copy.admin.memberEmpty }}</div>
      <div v-else class="list">
        <div v-for="row in rows" :key="row.hrId || row.id" class="list-row">
          <div class="list-row-main stack-tight">
            <span class="list-row-title break-all">{{ row.name }}</span>
            <span class="row row-wrap">
              <span class="chip chip-sky">{{ copy.admin.accountStatusLabel }} {{ accountState(row) }}</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import copy from '@/locales/zh-CN/index.js';
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import accountCopy from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/adminUtils.js';
import { roleLabelOf, session } from '@/runtime/session.js';

const router = useRouter();
const loading = ref(true);
const loadNotice = ref('');
const rows = ref([]);
let alive = true, generation = 0;
const scope = () => [session.context?.organizationId, session.context?.contextId].join('|');

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

/** 账号状态取服务端下发的合并状态，不做二次推断。 */
function accountState(row) {
  const account = row.auth || row.account || {};
  const status = String(account.status || row.accountStatus || '');
  const map = {
    verified: accountCopy.hrAccountActive,
    frozen: accountCopy.hrAccountFrozen,
    pending_verification: accountCopy.hrAccountPendingVerification,
    recovery_required: accountCopy.hrAccountRecoveryRequired
  };
  return map[status] || (row.auth && !row.accountId ? accountCopy.hrAccountUnbound : accountCopy.hrAccountUnknown);
}

function goWorkRole() {
  router.push({ name: 'workRole' });
}

async function load() {
  const request = ++generation, expected = scope();
  loading.value = true;
  loadNotice.value = '';
  try {
    const result = requireSuccess(await callApi('listHrGovernance', {}));
    if (!alive || request !== generation || expected !== scope()) return;
    rows.value = Array.isArray(result.rows) ? result.rows : [];
  } catch (error) {
    if (!alive || request !== generation || expected !== scope()) return;
    rows.value = [];
    loadNotice.value = errorText(error, copy.errors.requestFailed);
  } finally {
    if (alive && request === generation && expected === scope()) loading.value = false;
  }
}

onMounted(load);
onBeforeUnmount(() => { alive = false; generation++; rows.value = []; });
</script>
