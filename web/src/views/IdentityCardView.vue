<template>
  <div class="page page-narrow stack">
    <WorkspaceHero v-if="!publicView" :page-name="copy.title" :person-name="card?.name || ''" :identity-name="card?.position || ''" :organization-name="card?.organization || ''" @switch="router.push({name:'workRole'})" />
    <section class="card stack identity-card">
      <div class="row"><UiIcon name="shield" size-role="feature-leading" /><h2 class="section-title">{{ publicView ? copy.verifyTitle : copy.title }}</h2></div>
      <AppLoading v-if="loading" :text="copy.loading" />
      <template v-if="card">
        <h1 class="identity-name">{{ card.name }}</h1><div><span class="chip chip-green">{{ card.state }}</span></div>
        <div class="stack-tight"><span class="muted">{{ copy.organization }}</span><strong class="break-all">{{ card.organization }}</strong></div>
        <div class="stack-tight"><span class="muted">{{ copy.position }}</span><strong class="break-all">{{ card.position }}</strong></div>
        <p v-if="publicView && valid" class="chip chip-green">{{ copy.verified }}</p>
        <div v-if="!publicView" class="stack identity-code">
          <AppLoading v-if="qrLoading" :text="copy.generating" />
          <img v-if="image" class="identity-image" :src="image" :alt="copy.scanHint" />
          <strong v-if="image">{{ copy.scanHint }}</strong><p class="muted">{{ copy.privacyHint }}</p><p class="muted">{{ copy.expiryHint }}</p>
        </div>
      </template>
      <p v-if="notice" class="notice-line" role="alert">{{ notice }}</p>
      <button class="btn btn-secondary" :disabled="loading || qrLoading" @click="load">{{ publicView ? copy.retry : copy.refresh }}</button>
      <p v-if="publicView" class="muted">{{ copy.notPhysicalProof }}</p>
    </section>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import copy from '@/locales/zh-CN/shared/identityCard.js';
import { callApi, requireSuccess } from '@/runtime/api.js';
import { session } from '@/runtime/session.js';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import UiIcon from '@/components/UiIcon.vue';
const route = useRoute(), router = useRouter();
const publicView = computed(() => route.name === 'identityCardVerify');
const card = ref(null), image = ref(''), valid = ref(false), notice = ref(''), loading = ref(false), qrLoading = ref(false);
let generation = 0, disposed = false;
function clear() { generation++; card.value = null; image.value = ''; valid.value = false; notice.value = ''; loading.value = false; qrLoading.value = false; }
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
    image.value = generated.image; card.value = generated.card;
  } catch (_) { if (current()) notice.value = qrLoading.value ? copy.qrFailure : copy.failure; }
  finally { if (current()) { loading.value = false; qrLoading.value = false; } }
}
function visibility() { if (document.hidden) clear(); else load(); }
document.addEventListener('visibilitychange', visibility);
watch(() => [route.name, route.query.token, session.context?.contextId, session.status], load, { immediate: true });
onBeforeUnmount(() => { disposed = true; clear(); document.removeEventListener('visibilitychange', visibility); });
</script>
<style scoped>
.identity-card { width: 100%; margin-inline: auto; }
.identity-name { font-size: var(--ui-type-page); line-height: 1.5; overflow-wrap: anywhere; }
.identity-code { align-items: center; text-align: center; }
.identity-image { width: calc(var(--ui-control-height) * 5); max-width: 100%; aspect-ratio: 1; object-fit: contain; }
.identity-card > .btn { flex: none; height: auto; }
</style>
