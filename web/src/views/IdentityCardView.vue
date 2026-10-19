<template>
  <div class="page page-narrow stack">
    <WorkspaceHero v-if="!publicView" :page-name="copy.title" :person-name="card?.name || ''" :identity-name="card?.position || ''" :organization-name="card?.organization || ''" @switch="router.push({ name: 'workRole' })" />
    <section class="card identity-card">
      <header v-if="publicView" class="identity-header stack">
        <div class="row"><span class="identity-result-icon"><UiIcon name="shield" size-role="feature-leading" /></span><div><p class="identity-brand">{{ common.brandName }}</p><h2>{{ copy.verifyTitle }}</h2></div></div>
        <div v-if="valid && card" class="identity-result"><UiIcon name="check" size-role="context-trailing" /><strong>{{ copy.verified }}</strong></div>
        <template v-if="card"><h1 class="identity-name">{{ card.name }}</h1><span>{{ card.state }}</span></template>
      </header>
      <div class="identity-body stack">
      <AppLoading v-if="loading" :text="copy.loading" />
      <template v-if="card">
        <span v-if="!publicView" class="chip chip-green identity-own-status">{{ card.state }}</span>
        <div class="stack-tight"><span class="muted">{{ copy.organization }}</span><strong class="break-all">{{ card.organization }}</strong></div>
        <div class="stack-tight"><span class="muted">{{ copy.position }}</span><strong class="break-all">{{ card.position }}</strong></div>
        <div v-if="!publicView" class="stack identity-code">
          <div class="row row-between row-wrap identity-code-heading"><strong>{{ copy.liveCheck }}</strong><span class="muted">{{ copy.expiryHint }}</span></div>
          <AppLoading v-if="qrLoading" :text="copy.generating" />
          <div v-if="image" class="tabs identity-code-tabs"><button class="tab" :class="{'tab-active':codeMode==='verification'}" :aria-pressed="codeMode==='verification'" @click="codeMode='verification'">{{ copy.verificationCode }}</button><button class="tab" :class="{'tab-active':codeMode==='miniProgram'}" :aria-pressed="codeMode==='miniProgram'" @click="codeMode='miniProgram'">{{ copy.miniProgramCode }}</button></div>
          <img v-if="image" class="identity-image" :src="image" :alt="copy.scanHint" />
          <span v-if="image" class="muted">{{ copy.scanHint }}</span>
          <button v-if="image" class="btn btn-secondary" @click="showOriginal">{{ copy.originalImage }}</button>
        </div>
      </template>
      <p v-if="notice" class="notice-line" role="alert">{{ notice }}</p>
      <button class="btn btn-secondary" :disabled="loading || qrLoading" @click="load">{{ publicView ? (valid ? copy.refreshVerification : copy.retry) : copy.refresh }}</button>
      </div>
    </section>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import copy from '@/locales/zh-CN/shared/identityCard.js';
import common from '@/locales/zh-CN/shared/common.js';
import { callApi, requireSuccess } from '@/runtime/api.js';
import { session } from '@/runtime/session.js';
import { outputFile } from '@/runtime/fileIO.js';
import UiIcon from '@/components/UiIcon.vue';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
const route = useRoute();
const router = useRouter();
const publicView = computed(() => route.name === 'identityCardVerify');
const card = ref(null), miniProgramImage = ref(''), verificationImage = ref(''), codeMode = ref('verification'), valid = ref(false), notice = ref(''), loading = ref(false), qrLoading = ref(false);
const image = computed(() => codeMode.value === 'verification' ? verificationImage.value : miniProgramImage.value);
let generation = 0, disposed = false;
function clear() { generation++; card.value = null; miniProgramImage.value = ''; verificationImage.value = ''; codeMode.value = 'verification'; valid.value = false; notice.value = ''; loading.value = false; qrLoading.value = false; }
function showOriginal() {
  if (!image.value) return;
  const [header, data] = image.value.split(',');
  const mime = header.includes('image/png') ? 'image/png' : 'image/jpeg';
  const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0));
  return outputFile({ blob: new Blob([bytes], { type: mime }), fileName: copy.imageName + (mime === 'image/png' ? '.png' : '.jpg'), modes: ['preview', 'save'] });
}
async function load() {
  clear();
  if (document.hidden) return;
  const attempt = generation;
  const current = () => !disposed && attempt === generation && !document.hidden;
  loading.value = true;
  try {
    const result = requireSuccess(await callApi(publicView.value ? 'verifyIdentityCard' : 'getMyIdentityCard', publicView.value ? {token: String(route.query.token || '')} : {}));
    if (!current()) return;
    valid.value = result.valid; card.value = result.card || null; loading.value = false;
    if (!result.valid) { notice.value = copy.unavailable; return; }
    if (publicView.value) return;
    qrLoading.value = true;
    const generated = requireSuccess(await callApi('createMyIdentityCardCode', {}));
    if (!current()) return;
    if (!generated.valid || !/^data:image\/(png|jpeg);base64,/.test(generated.image || '')) throw new Error();
    const verification = generated.verificationImage || generated.image;
    if (!/^data:image\/(png|jpeg);base64,/.test(verification)) throw new Error();
    miniProgramImage.value = generated.image; verificationImage.value = verification; card.value = generated.card;
  } catch (_) { if (current()) notice.value = qrLoading.value ? copy.qrFailure : copy.failure; }
  finally { if (current()) { loading.value = false; qrLoading.value = false; } }
}
function visibility() { if (document.hidden) clear(); else load(); }
document.addEventListener('visibilitychange', visibility);
watch(() => [route.name, route.query.token, session.context?.contextId, session.status], load, { immediate: true });
onBeforeUnmount(() => { disposed = true; clear(); document.removeEventListener('visibilitychange', visibility); });
</script>
<style scoped>
.identity-card { width: 100%; margin-inline: auto; padding: 0; overflow: hidden; }
.identity-header { padding: var(--ui-card-padding-y) var(--ui-card-padding-x); background: var(--ui-option-selected-bg); border-bottom: 1px solid var(--ui-chip-blue-border); }
.identity-header h2 { font-size: var(--ui-type-section); line-height: 1.5; }
.identity-brand { font-size: var(--ui-type-meta); color: var(--ui-text-muted); }
.identity-result-icon { display: flex; align-items: center; justify-content: center; padding: var(--ui-field-gap); border-radius: var(--ui-field-radius); background: var(--ui-field-bg); border: 1px solid var(--ui-chip-blue-border); }
.identity-result { display: flex; align-items: center; gap: var(--ui-field-gap); color: var(--ui-chip-green-text); font-size: var(--ui-type-body); }
.identity-own-status { align-self: flex-start; }
.identity-body { padding: var(--ui-card-padding-y) var(--ui-card-padding-x); }
.identity-name { font-size: var(--ui-type-page); line-height: 1.5; overflow-wrap: anywhere; }
.identity-code { align-items: center; text-align: center; padding-top: var(--ui-field-gap); border-top: 1px dashed var(--ui-chip-blue-border); }
.identity-code-heading, .identity-code-tabs { width: 100%; }
.identity-image { width: calc(var(--ui-control-height) * 6); max-width: 100%; aspect-ratio: 1; object-fit: contain; background: var(--ui-field-bg); }
.identity-body > .btn, .identity-code > .btn { flex: none; height: auto; width: 100%; }
</style>
