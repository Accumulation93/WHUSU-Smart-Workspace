<template>
  <section class="card stack">
    <span class="section-title">{{ native.copy_be547ba4c7 }}</span>
    <label class="field"><span class="field-label">{{ copy.audit.detailStepsTitle }}</span><select v-model="status" class="field-input" :disabled="loading || busy" @change="load(false)"><option value="">{{ native.copy_31d4595959 }}</option><option v-for="value in statuses" :key="value" :value="value">{{ statusLabel(value) }}</option></select></label>
    <p v-if="notice" class="notice-line">{{ notice }}<button class="btn-quiet" :disabled="busy || loading" @click="load(false)">{{ text.retry }}</button></p>
    <p v-if="actionNotice" class="notice-line" role="status">{{ actionNotice }}</p>
    <p v-if="loading && !rows.length">{{ copy.common.loading }}</p>
    <p v-else-if="!notice && !rows.length">{{ copy.audit.emptySubmissions }}</p>
    <article v-for="row in rows" :key="row.id" class="stack-tight">
      <button class="list-row audit-submission" :disabled="busy" @click="router.push({name:'auditSubmission',params:{id:row.id}})"><span class="stack-tight"><strong>{{ row.title }}</strong><span>{{ row.submitterName }} · {{ row.submissionNumber }}</span><span class="soft">{{ detailTimeText(row.createdAt,row.createdAtReviewStatus) }}</span></span><span class="chip chip-blue">{{ statusLabel(row.status) }}</span></button>
      <div v-if="canDelete" class="card-actions"><button class="btn btn-danger" :disabled="busy || loading || !!notice || disabled" @click="remove(row)">{{ governance.deleteConfirm }}</button></div>
    </article>
    <button v-if="hasMore" class="btn-quiet" :disabled="loading || busy" @click="load(true)">{{ text.more }}</button>
  </section>
</template>
<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import copy from '@/locales/zh-CN/index.js';
import native from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
import text from '@/locales/zh-CN/shared/auditSigning.js';
import governance from '@/locales/zh-CN/shared/adminGovernance.js';
import { statusLabel, detailTimeText } from '@/runtime/audit.js';
import { requireSuccess, errorText } from '@/runtime/api.js';
import { auditRequests } from '@/runtime/auditRequests.js';
import { confirmAction } from '@/runtime/notify.js';
import { session } from '@/runtime/session.js';
const props = defineProps({ profile: Object, disabled: Boolean });
const emit = defineEmits(['busy']);
const router = useRouter(), requests = auditRequests(), rows = ref([]), status = ref(''), loading = ref(false), notice = ref(''), hasMore = ref(false);
const busy = ref(false), actionNotice = ref('');
const canDelete = computed(() => props.profile?.adminLevel === 'super_admin' || props.profile?.permissions?.['audit.submissions_delete'] === true);
const scope = () => [session.context?.organizationId, session.context?.contextId].join('|');
const statuses = ['draft', 'pending', 'in_progress', 'approved', 'rejected', 'withdrawn'];
let alive = true, sequence = 0;
async function load(append) {
  if (loading.value) return;
  const request = ++sequence, expected = scope();
  loading.value = true;
  try {
    const result = requireSuccess(await requests.call('listAllAuditSubmissions', { status: status.value, limit: 50, offset: append ? rows.value.length : 0 }));
    if (!alive || request !== sequence || expected !== scope()) return;
    const found = result.submissions || [];
    rows.value = append ? rows.value.concat(found) : found;
    hasMore.value = found.length === 50;
    notice.value = '';
  } catch (error) { if (alive && request === sequence && expected === scope()) notice.value = errorText(error, copy.audit.loadFailed); }
  finally { if (alive && request === sequence) loading.value = false; }
}
async function remove(row) {
  if (!canDelete.value || props.disabled || busy.value || loading.value || notice.value) return;
  const expected = scope();
  const current = () => alive && expected === scope();
  busy.value = true;
  actionNotice.value = '';
  try {
    const preview = requireSuccess(await requests.call('previewAuditSubmissionDeletion', { id: row.id }));
    if (!current()) return;
    const accepted = await confirmAction({ title: governance.deleteTitle, body: governance.deleteBody.replace('{0}', preview.record.title), confirmText: governance.deleteConfirm, cancelText: governance.cancel, danger: true });
    if (!accepted || !current() || !canDelete.value) return;
    const result = requireSuccess(await requests.call('deleteAuditSubmission', { id: row.id, revision: preview.record.revision }));
    if (!current()) return;
    rows.value = rows.value.filter(item => item.id !== row.id);
    actionNotice.value = result.cleanupPending ? governance.cleanupPending : governance.deleted;
    await load(false);
  } catch (error) { if (current()) actionNotice.value = errorText(error, governance.failed); }
  finally { if (alive) busy.value = false; }
}
watch(busy, value => emit('busy', value), { flush: 'sync' });
onMounted(() => load(false));
onBeforeUnmount(() => { alive = false; sequence++; requests.dispose(); emit('busy', false); });
</script>
<style scoped>
.audit-submission { width: 100%; color: var(--ui-text); font: inherit; text-align: left }
</style>
