<template>
  <div class="page stack">
    <WorkspaceHero :page-name="copy.verify.pageName" />

    <section class="card stack">
      <div class="section-title">{{ copy.verify.formTitle }}</div>

      <div class="tabs">
        <button
          type="button"
          class="tab"
          :class="{ 'tab-active': mode === 'number' }"
          @click="setMode('number')"
        >
          {{ copy.verify.modeNumber }}
        </button>
        <button
          type="button"
          class="tab"
          :class="{ 'tab-active': mode === 'file' }"
          @click="setMode('file')"
        >
          {{ copy.verify.modeFile }}
        </button>
      </div>

      <label v-if="mode === 'number'" class="field">
        <span class="field-label">{{ copy.verify.numberLabel }}</span>
        <input
          v-model="submissionNumber"
          class="field-input"
          type="text"
          :placeholder="copy.verify.numberPlaceholder"
          @keyup.enter="verify"
        />
      </label>

      <div v-else class="field">
        <span class="field-label">{{ copy.verify.fileLabel }}</span>
        <div class="row">
          <span class="value grow break-all">{{ fileName || copy.verify.filePlaceholder }}</span>
          <button type="button" class="btn btn-secondary" @click="chooseFile">
            {{ copy.verify.filePlaceholder }}
          </button>
        </div>
        <input
          ref="fileInput"
          class="visually-hidden"
          type="file"
          @change="onFileChange"
        />
      </div>

      <button type="button" class="btn btn-primary" :disabled="busy" @click="verify">
        {{ busy ? copy.verify.verifying : copy.verify.verifyAction }}
      </button>
    </section>

    <section v-if="result" class="card stack">
      <div class="section-title">{{ copy.verify.resultTitle }}</div>

      <div v-if="result.matches.length" class="stack-tight">
        <div class="panel-head">
          <div class="panel-title-group">
            <div class="value">{{ matchCopy.text.matchSectionTitle }}</div>
            <div class="panel-note">{{ result.matchCountText }}</div>
          </div>
        </div>
        <div
          v-for="item in result.matches"
          :key="item.submissionId"
          class="list-row"
          :class="{ 'list-row-picked': item.isSelected }"
        >
          <div class="list-row-main">
            <div class="row row-wrap">
              <span class="list-row-title grow">{{ item.titleText }}</span>
              <span class="chip" :class="item.statusClass">{{ item.statusText }}</span>
            </div>
            <div class="muted">{{ copy.verify.numberLabel }} · {{ item.submissionNumber }}</div>
            <div v-if="item.matchingFiles.length" class="stack-tight">
              <div class="soft">{{ matchCopy.text.matchingFiles }}</div>
              <div v-for="file in item.matchingFiles" :key="file.fileId" class="muted break-all">
                {{ file.fileName }}
              </div>
            </div>
          </div>
          <div class="list-row-actions">
            <span v-if="item.isSelected" class="soft">{{ matchCopy.text.currentResult }}</span>
            <button v-else type="button" class="btn btn-secondary" @click="selectMatch(item.submissionId)">
              {{ matchCopy.text.viewResult }}
            </button>
          </div>
        </div>
      </div>

      <AuditVerificationResult :result-json="result.verificationJson" />
    </section>

    <p v-if="notice" class="notice-line">{{ notice }}</p>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import AuditVerificationResult from './AuditVerificationResult.vue';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import matchCopy from '@/locales/zh-CN/auditVerification.js';
import copy from '@/locales/zh-CN/index.js';
import { callApi, errorText } from '@/runtime/api.js';
import { buildMatchVerificationParams, presentVerificationResponse } from '@/runtime/verification.js';

/**
 * 验签页：按申请编号或在浏览器里选择的文件核对签署。
 *
 * 服务端接口与小程序一致（`verifySignatureChain`）。文件模式下浏览器直接把文件读成
 * base64 交给服务端，不上传原始路径，也不在本地保存任何副本。
 */

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const mode = ref('number');
const submissionNumber = ref('');
const fileName = ref('');
const fileBase64 = ref('');
const fileInput = ref(null);
const busy = ref(false);
const result = ref(null);
const notice = ref('');

function setMode(next) {
  mode.value = next;
  result.value = null;
  notice.value = '';
}

function chooseFile() {
  if (fileInput.value) fileInput.value.click();
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const comma = text.indexOf(',');
      resolve(comma >= 0 ? text.slice(comma + 1) : text);
    };
    reader.onerror = () => reject(new Error('read_failed'));
    reader.readAsDataURL(file);
  });
}

async function onFileChange(event) {
  const input = event.target;
  const file = input && input.files && input.files[0];
  if (!file) return;
  notice.value = '';
  if (file.size > MAX_FILE_BYTES) {
    notice.value = copy.verify.fileTooLarge;
    input.value = '';
    return;
  }
  try {
    fileBase64.value = await readFileAsBase64(file);
    fileName.value = file.name;
    result.value = null;
  } catch (_) {
    notice.value = copy.verify.fileReadFailed;
  } finally {
    input.value = '';
  }
}

async function runVerify(params) {
  busy.value = true;
  notice.value = '';
  try {
    const response = await callApi('verifySignatureChain', params);
    if (response.status === 'success') {
      result.value = presentVerificationResponse(response);
      return;
    }
    if (response.status === 'forbidden') {
      notice.value = copy.verify.forbidden;
      return;
    }
    notice.value = response.message || copy.verify.verifyFailed;
  } catch (error) {
    notice.value = errorText(error, copy.verify.verifyFailed);
  } finally {
    busy.value = false;
  }
}

function verify() {
  if (mode.value === 'number') {
    const number = submissionNumber.value.trim();
    if (!number) {
      notice.value = copy.verify.numberRequired;
      return;
    }
    runVerify({ submissionNumber: number });
    return;
  }
  if (!fileBase64.value) {
    notice.value = copy.verify.fileRequired;
    return;
  }
  runVerify({ fileBase64: fileBase64.value });
}

function selectMatch(submissionId) {
  const params = buildMatchVerificationParams(result.value, submissionId, fileBase64.value);
  if (!params || params.submissionId === String((result.value && result.value.submissionId) || '')) return;
  runVerify(params);
}
</script>

<style scoped>
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.list-row-picked {
  border-color: rgba(147, 197, 253, 0.64);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.96) 0%, rgba(239, 246, 255, 0.84) 100%);
}
</style>
