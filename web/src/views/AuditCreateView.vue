<template>
  <div class="page stack">
    <WorkspaceHero
      :page-name="copy.audit.createTitle"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />

    <section class="card stack">
      <div class="panel-head">
        <div class="stack-tight">
          <span class="section-title">{{ copy.audit.createTitle }}</span>
          <span class="panel-note">{{ copy.audit.createPanelNote }}</span>
        </div>
        <button type="button" class="btn-quiet" @click="goBack">{{ copy.audit.actionBackToList }}</button>
      </div>

      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>

      <div v-if="loadingTemplates" class="empty-state">{{ copy.common.loading }}</div>
      <div v-else-if="!templates.length" class="empty-state">{{ copy.audit.createNoTemplate }}</div>

      <template v-else>
        <div class="stack-tight">
          <span class="field-label">{{ copy.audit.createTemplateLabel }}</span>
          <div class="list">
            <button
              v-for="template in templates"
              :key="template.id"
              type="button"
              class="template-row"
              :class="{ 'template-row-active': templateId === template.id }"
              @click="selectTemplate(template)"
            >
              <span class="list-row-title break-all">{{ template.name }}</span>
              <span v-if="template.description" class="muted break-all">{{ template.description }}</span>
              <span class="soft">{{ formatTemplate(copy.audit.createStepsHint, [template.stepCount]) }}</span>
            </button>
          </div>
        </div>

        <label class="field">
          <span class="field-label">{{ copy.audit.createTitleLabel }}</span>
          <input
            v-model="title"
            class="field-input"
            type="text"
            :placeholder="copy.audit.createTitlePlaceholder"
          />
        </label>

        <label class="field">
          <span class="field-label">{{ copy.audit.createDescLabel }}</span>
          <textarea
            v-model="description"
            class="field-input field-textarea"
            :placeholder="copy.audit.createDescPlaceholder"
          ></textarea>
        </label>

        <div class="stack-tight">
          <span class="field-label">{{ copy.audit.createFilesLabel }}</span>
          <input
            class="field-input"
            type="file"
            multiple
            @change="onFilesPicked"
          />
          <div v-if="files.length" class="list">
            <div v-for="(file, index) in files" :key="file.key" class="list-row">
              <div class="list-row-main stack-tight">
                <span class="list-row-title break-all">{{ file.name }}</span>
                <span class="soft">{{ fileSizeText(file.size) }}</span>
              </div>
              <div class="list-row-actions">
                <button type="button" class="btn-quiet btn-quiet-danger" @click="removeFile(index)">
                  {{ copy.audit.createRemoveFile }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <button type="button" class="btn btn-primary" :disabled="submitting" @click="submit">
          {{ submitting ? copy.audit.createSubmitting : copy.audit.createSubmit }}
        </button>
        <p class="soft">{{ copy.audit.createAdHocNotAvailable }}</p>
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
import { MAX_AUDIT_FILE_BYTES, formatTemplate, readFileAsBase64 } from '@/runtime/audit.js';
import { showToast } from '@/runtime/notify.js';
import { roleLabelOf, session } from '@/runtime/session.js';

const router = useRouter();

const templates = ref([]);
const loadingTemplates = ref(true);
const templateId = ref('');
const title = ref('');
const description = ref('');
const files = ref([]);
const submitting = ref(false);
const loadNotice = ref('');
let fileSeed = 0;

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

function fileSizeText(size) {
  const value = Number(size || 0);
  if (!value) return '';
  return value >= 1024 * 1024
    ? (value / (1024 * 1024)).toFixed(1) + 'MB'
    : Math.max(1, Math.round(value / 1024)) + 'KB';
}

function selectTemplate(template) {
  templateId.value = template.id;
}

function onFilesPicked(event) {
  const picked = Array.from(event.target.files || []);
  const accepted = [];
  for (const file of picked) {
    if (file.size > MAX_AUDIT_FILE_BYTES) {
      loadNotice.value = copy.audit.createFileTooLarge;
      continue;
    }
    accepted.push({ key: 'file-' + (++fileSeed), name: file.name, size: file.size, file });
  }
  files.value = files.value.concat(accepted);
  event.target.value = '';
}

function removeFile(index) {
  files.value = files.value.filter((_, current) => current !== index);
}

async function loadTemplates() {
  loadingTemplates.value = true;
  loadNotice.value = '';
  try {
    const result = await callApi('listAvailableFlowTemplates', {});
    templates.value = Array.isArray(result.templates) ? result.templates : [];
    if (templates.value.length === 1) templateId.value = templates.value[0].id;
  } catch (error) {
    templates.value = [];
    loadNotice.value = errorText(error, copy.audit.loadFailed);
  } finally {
    loadingTemplates.value = false;
  }
}

async function submit() {
  if (submitting.value) return;
  if (!title.value.trim()) {
    loadNotice.value = copy.audit.createTitleRequired;
    return;
  }
  if (!files.value.length) {
    loadNotice.value = copy.audit.createFilesRequired;
    return;
  }
  loadNotice.value = '';
  submitting.value = true;
  try {
    // 先逐个上传附件拿到服务端标识，再随申请一起提交，这条链路与小程序一致。
    const serverFiles = [];
    for (const item of files.value) {
      const base64 = await readFileAsBase64(item.file);
      const uploadResult = await callApi('uploadAuditFile', {
        fileBase64: base64,
        fileName: item.name,
        mimeType: item.file.type || ''
      });
      if (uploadResult.status !== 'success') {
        throw new Error(uploadResult.message || copy.audit.actionFailed);
      }
      serverFiles.push({
        fileId: uploadResult.fileId,
        fileName: uploadResult.fileName,
        mimeType: uploadResult.mimeType,
        fileSize: uploadResult.fileSize,
        fileHash: uploadResult.fileHash,
        fileToken: uploadResult.fileToken
      });
    }
    const created = await callApi('startAuditSubmission', {
      templateId: templateId.value,
      title: title.value.trim(),
      description: description.value,
      files: serverFiles,
      stepOverrides: []
    });
    if (created.status !== 'success') {
      throw new Error(created.message || copy.audit.actionFailed);
    }
    showToast(copy.audit.createDone);
    router.replace({ name: 'auditMySubmissions' });
  } catch (error) {
    loadNotice.value = errorText(error, copy.audit.actionFailed);
  } finally {
    submitting.value = false;
  }
}

function goBack() {
  router.push({ name: 'auditMySubmissions' });
}

onMounted(loadTemplates);
</script>

<style scoped>
.template-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
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

.template-row-active {
  border-color: var(--ui-line-blue);
  background: linear-gradient(135deg, rgba(219, 234, 254, 0.7) 0%, rgba(239, 246, 255, 0.6) 100%);
}

.field-textarea {
  min-height: 84px;
  line-height: 1.5;
  resize: vertical;
}
</style>
