<template>
  <div class="page stack">
    <WorkspaceHero
      :page-name="copy.audit.signatureTitle"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />

    <section class="card stack">
      <div class="panel-head">
        <div class="stack-tight">
          <span class="section-title">{{ copy.audit.signatureTitle }}</span>
          <span class="panel-note">{{ copy.audit.signaturePanelNote }}</span>
        </div>
        <button type="button" class="btn-quiet" @click="togglePad">
          {{ padVisible ? copy.audit.signatureCancel : copy.audit.signatureNew }}
        </button>
      </div>

      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>

      <div v-if="padVisible" class="stack-tight">
        <p class="soft">{{ copy.audit.signatureHint }}</p>
        <img v-if="newImage" class="signature-preview" :src="newImage" :alt="signing.padTitle" />
        <div class="row row-wrap">
          <button type="button" class="btn-quiet" @click="openPad">{{ signing.rewrite }}</button>
        </div>
        <label class="field">
          <span class="field-label">{{ copy.audit.signatureNameLabel }}</span>
          <input
            v-model="newName"
            class="field-input"
            type="text"
            :placeholder="copy.audit.signatureNamePlaceholder"
          />
        </label>
        <button type="button" class="btn btn-primary" :disabled="saving" @click="save">
          {{ saving ? copy.common.loading : copy.audit.signatureSave }}
        </button>
      </div>

      <div v-if="loading" class="empty-state">{{ copy.common.loading }}</div>
      <div v-else-if="!signatures.length" class="empty-state">{{ copy.audit.signatureEmpty }}</div>
      <div v-else class="list">
        <div v-for="signature in signatures" :key="signature.id" class="list-row">
          <div class="list-row-main stack-tight">
            <span class="row row-wrap">
              <span class="list-row-title">{{ signature.name }}</span>
              <span v-if="signature.isDefault" class="chip chip-green">{{ copy.audit.signatureDefaultBadge }}</span>
            </span>
            <img v-if="signature.imageData" class="signature-preview" :src="signature.imageData" :alt="signature.name" />
            <span class="soft">{{ detailTimeText(signature.createdAt, signature.createdAtReviewStatus) }}</span>
          </div>
          <div class="list-row-actions">
            <button
              v-if="!signature.isDefault"
              type="button"
              class="btn-quiet"
              @click="setDefault(signature)"
            >
              {{ copy.audit.signatureSetDefault }}
            </button>
            <button type="button" class="btn-quiet btn-quiet-danger" @click="remove(signature)">
              {{ copy.audit.signatureDelete }}
            </button>
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
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import { detailTimeText } from '@/runtime/audit.js';
import { confirmAction, showToast } from '@/runtime/notify.js';
import { roleLabelOf, session } from '@/runtime/session.js';
import signing from '@/locales/zh-CN/shared/auditSigning.js';
import { signingDrafts, setSigningHandoff, getSigningHandoff } from '@/runtime/signingDrafts.js';

const router = useRouter();

const signatures = ref([]);
const loading = ref(true);
const saving = ref(false);
const loadNotice = ref('');
const padVisible = ref(false);
const newName = ref('');

const newImage=ref('');
function openPad(){const draft=signingDrafts.open('personal-signature-new');const handoff={kind:'template',draft,file:{id:'personal-signature-new',fileName:signing.padTitle},pad:true,mode:'pen',templateName:newName.value,back:{name:'auditSignatures'},result:null};handoff.confirm=exports=>{handoff.result=exports;};setSigningHandoff(handoff);router.push({name:'auditSigning'});}



let hasStroke = false;

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

function togglePad() {
  padVisible.value = !padVisible.value;
  loadNotice.value = '';
  if (padVisible.value) {
    openPad();
  }
}

async function load() {
  loading.value = true;
  loadNotice.value = '';
  try {
    const result = await callApi('listMySignatures', {});
    signatures.value = Array.isArray(result.signatures) ? result.signatures : [];
  } catch (error) {
    signatures.value = [];
    loadNotice.value = errorText(error, copy.audit.loadFailed);
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (saving.value) return;
  if (!newName.value.trim()) {
    loadNotice.value = copy.audit.signatureNameRequired;
    return;
  }
  if (!hasStroke) {
    loadNotice.value = copy.audit.signatureEmptyCanvas;
    return;
  }

  const imageData = newImage.value;
  saving.value = true;
  loadNotice.value = '';
  try {
    const result = await callApi('saveSignature', {
      name: newName.value.trim(),
      imageData,
      isDefault: signatures.value.length === 0
    });
    if (result.status !== 'success') throw new Error(result.message || '');
    showToast(copy.audit.signatureSaved);
    const transfer = getSigningHandoff();
    if (transfer?.kind === 'template') { transfer.result = null; transfer.draft.files = {}; }
    newImage.value = ''; hasStroke = false;
    newName.value = '';
    padVisible.value = false;
    await load();
  } catch (error) {
    loadNotice.value = errorText(error, copy.audit.signatureSaveFailed);
  } finally {
    saving.value = false;
  }
}

async function setDefault(signature) {
  try {
    requireSuccess(await callApi('setDefaultSignature', { id: signature.id }));
    showToast(copy.audit.signatureDefaultSet);
    await load();
  } catch (error) {
    loadNotice.value = errorText(error, copy.audit.signatureSaveFailed);
  }
}

async function remove(signature) {
  const confirmed = await confirmAction({
    title: copy.audit.signatureDeleteConfirmTitle,
    body: copy.audit.signatureDeleteConfirmBody,
    confirmText: copy.audit.signatureDelete,
    cancelText: copy.common.cancel,
    danger: true
  });
  if (!confirmed) return;
  try {
    requireSuccess(await callApi('deleteSignature', { id: signature.id }));
    showToast(copy.audit.signatureDeleted);
    await load();
  } catch (error) {
    loadNotice.value = errorText(error, copy.audit.signatureSaveFailed);
  }
}

onMounted(()=>{const handoff=getSigningHandoff();if(handoff&&handoff.kind==='template'&&handoff.result){newImage.value=handoff.result[0].imageData;newName.value=handoff.templateName;padVisible.value=true;hasStroke=true;}load();});
</script>

<style scoped>
.signature-preview {
  display: block;
  max-width: 200px;
  max-height: 90px;
  border-radius: var(--ui-list-radius);
  background: rgba(255, 255, 255, 0.9);
}
</style>
