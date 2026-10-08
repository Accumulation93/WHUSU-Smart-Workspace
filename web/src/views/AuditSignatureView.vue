<template>
  <div class="page stack">
    <section class="card stack">
      <div class="row row-wrap">
        <span class="card-title grow">{{ copy.audit.signatureTitle }}</span>
        <button type="button" class="btn-quiet" @click="togglePad">
          {{ padVisible ? copy.audit.signatureCancel : copy.audit.signatureNew }}
        </button>
      </div>

      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>

      <div v-if="padVisible" class="stack-tight">
        <p class="soft">{{ copy.audit.signatureHint }}</p>
        <canvas
          ref="padRef"
          class="signature-pad"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @pointerleave="onPointerUp"
        ></canvas>
        <div class="row row-wrap">
          <button type="button" class="btn-quiet" @click="clearPad">{{ copy.audit.signatureClear }}</button>
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
import { nextTick, onMounted, ref } from 'vue';
import copy from '@/locales/zh-CN/index.js';
import { callApi, errorText } from '@/runtime/api.js';
import { detailTimeText } from '@/runtime/audit.js';
import { confirmAction, showToast } from '@/runtime/notify.js';

const signatures = ref([]);
const loading = ref(true);
const saving = ref(false);
const loadNotice = ref('');
const padVisible = ref(false);
const newName = ref('');
const padRef = ref(null);

let drawing = false;
let lastPoint = null;
let hasStroke = false;

function padContext() {
  const canvas = padRef.value;
  return canvas ? canvas.getContext('2d') : null;
}

/** 画布按显示尺寸和设备像素比设置后备像素，保证笔迹清晰且坐标一比一。 */
function preparePad() {
  const canvas = padRef.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round((rect.width || 320) * ratio);
  canvas.height = Math.round((rect.height || 160) * ratio);
  const context = canvas.getContext('2d');
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.lineWidth = 2.4;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = '#0f172a';
}

function pointOf(event) {
  const canvas = padRef.value;
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function onPointerDown(event) {
  const context = padContext();
  if (!context) return;
  event.preventDefault();
  if (typeof event.target.setPointerCapture === 'function') {
    event.target.setPointerCapture(event.pointerId);
  }
  drawing = true;
  hasStroke = true;
  lastPoint = pointOf(event);
  context.beginPath();
  context.moveTo(lastPoint.x, lastPoint.y);
  context.lineTo(lastPoint.x + 0.1, lastPoint.y + 0.1);
  context.stroke();
}

function onPointerMove(event) {
  if (!drawing) return;
  const context = padContext();
  if (!context) return;
  event.preventDefault();
  const point = pointOf(event);
  context.beginPath();
  context.moveTo(lastPoint.x, lastPoint.y);
  context.lineTo(point.x, point.y);
  context.stroke();
  lastPoint = point;
}

function onPointerUp() {
  drawing = false;
  lastPoint = null;
}

function clearPad() {
  const canvas = padRef.value;
  if (!canvas) return;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  hasStroke = false;
}

function togglePad() {
  padVisible.value = !padVisible.value;
  loadNotice.value = '';
  if (padVisible.value) {
    nextTick(() => {
      preparePad();
      clearPad();
    });
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
  const canvas = padRef.value;
  const imageData = canvas ? canvas.toDataURL('image/png') : '';
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
    await callApi('setDefaultSignature', { id: signature.id });
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
    await callApi('deleteSignature', { id: signature.id });
    showToast(copy.audit.signatureDeleted);
    await load();
  } catch (error) {
    loadNotice.value = errorText(error, copy.audit.signatureSaveFailed);
  }
}

onMounted(load);
</script>

<style scoped>
.signature-pad {
  display: block;
  width: 100%;
  height: 180px;
  border: 1px dashed rgba(147, 197, 253, 0.9);
  border-radius: var(--ui-field-radius);
  background: rgba(255, 255, 255, 0.94);
  touch-action: none;
  cursor: crosshair;
}

.signature-preview {
  display: block;
  max-width: 200px;
  max-height: 90px;
  border-radius: var(--ui-list-radius);
  background: rgba(255, 255, 255, 0.9);
}
</style>
