<template>
  <div class="page page-narrow stack">
    <WorkspaceHero :signed-in="isAuthenticated" :tone="session.context?.role === 'admin' ? 'admin' : 'blue'" :page-name="publicView ? copy.verifyTitle : managementOnly ? copy.management.title : copy.title" :person-name="publicView || managementOnly ? viewerName : (card?.name || '')" :identity-name="publicView || managementOnly ? viewerPosition : (card?.position || '')" :organization-name="publicView || managementOnly ? viewerOrganization : (card?.organization || '')" @switch="router.push({ name: 'workRole' })" />
    <section v-if="!managementOnly" class="card identity-card" :class="{'identity-verification': publicView}">
      <header v-if="publicView && valid && card && !loading" class="identity-header stack">
        <div class="row"><UiIcon name="shield" tone="primary" size-role="feature-leading" /><h2>{{ copy.verifyTitle }}</h2></div>
        <h1 class="identity-name">{{ card.name }}</h1>
        <div v-if="valid && card" class="identity-result"><UiIcon name="check" size-role="context-trailing" /><strong>{{ copy.verified }}</strong></div>
        <span v-if="card.state && card.stateCode !== 'no_position'" class="identity-member-state">{{ card.state }}</span>
      </header>
      <div class="identity-body stack">
      <h2 v-if="publicView && (!valid || !card || loading)">{{ copy.verifyTitle }}</h2>
      <AppLoading v-if="loading" :text="copy.loading" />
      <template v-if="card && (!publicView || (valid && !loading))">
        <span v-if="!publicView && card.state" class="chip chip-green identity-own-status">{{ card.state }}</span>
        <div v-if="!publicView" class="identity-time"><UiIcon name="clock" size-role="context-trailing" /><div><span class="muted">{{ copy.currentTime }}</span><div class="identity-time-value">{{ currentTimeText }}</div></div></div>
        <div class="identity-fields"><div class="identity-field identity-organization-field"><span class="muted">{{ copy.organization }}</span><strong class="break-all">{{ card.organization }}</strong></div>
        <div v-if="publicView && card.department" class="identity-field"><span class="muted">{{ copy.department }}</span><strong class="break-all">{{ card.department }}</strong></div>
        <div v-if="publicView && card.identityCategory" class="identity-field"><span class="muted">{{ copy.identityCategory }}</span><strong class="break-all">{{ card.identityCategory }}</strong></div>
        <div v-if="publicView && card.workGroup" class="identity-field"><span class="muted">{{ copy.functionGroup }}</span><strong class="break-all">{{ card.workGroup }}</strong></div>
        <div v-if="!publicView || !card.hasPositionDetails" class="identity-field"><span class="muted">{{ copy.position }}</span><strong class="break-all">{{ card.position }}</strong></div></div>
        <div v-if="publicView" class="identity-time identity-live-time"><UiIcon name="clock" tone="primary" size-role="context-trailing" /><div><span class="muted">{{ copy.currentTime }}</span><div class="identity-time-value">{{ currentTimeText }}</div></div></div>
        <div v-if="publicView && checkedAtText" class="identity-time"><UiIcon name="clock" tone="muted" size-role="context-trailing" /><div><span class="muted">{{ copy.checkedAt }}</span><div class="identity-time-value">{{ checkedAtText }}</div></div></div>
        <div v-if="!publicView" class="stack identity-code">
          <div class="row row-between row-wrap identity-code-heading"><strong>{{ copy.liveCheck }}</strong><span v-if="image" class="muted">{{ copy.expiryHint }}</span></div>
          <AppLoading v-if="qrLoading" :text="copy.generating" />
          <div v-if="image" class="tabs identity-code-tabs"><button class="tab" :class="{'tab-active':codeMode==='verification'}" :aria-pressed="codeMode==='verification'" @click="codeMode='verification'">{{ copy.verificationCode }}</button><button class="tab" :class="{'tab-active':codeMode==='miniProgram'}" :aria-pressed="codeMode==='miniProgram'" @click="codeMode='miniProgram'">{{ copy.miniProgramCode }}</button></div>
          <img v-if="image" class="identity-image" :src="image" :alt="copy.scanHint" />
          <span v-if="image" class="muted">{{ copy.scanHint }}</span>
        </div>
      </template>
      <p v-if="notice" class="notice-line" role="alert">{{ notice }}</p>
      <div v-if="!publicView && image" class="identity-card-actions">
        <button type="button" class="btn btn-secondary" @click="showOriginal">{{ copy.originalImage }}</button>
        <button type="button" class="btn btn-secondary" :disabled="loading || qrLoading || policySaving" @click="load">{{ copy.refresh }}</button>
      </div>
      <button v-else type="button" class="btn btn-secondary" :disabled="loading || qrLoading || policySaving" @click="load">{{ publicView ? (valid ? copy.refreshVerification : copy.retry) : copy.refresh }}</button>
      </div>
    </section>
    <section v-if="!publicView && (policyAllowed || managementOnly)" class="card identity-card" :aria-label="copy.management.title">
      <div class="identity-body stack">
        <h2 v-if="!managementOnly" class="section-title">{{ copy.management.title }}</h2>
        <AppLoading v-if="policyLoading" :text="copy.loading" />
        <template v-else-if="policy">
          <div class="identity-policy-row">
            <div><strong>{{ copy.management.issue }}</strong><p class="muted">{{ copy.management.issueHelp }}</p></div>
            <UiSwitch :label="copy.management.issue" :checked="policy.issueEnabled" :disabled="!canUpdatePolicy || policySaving" @change="changePolicy('issueEnabled', $event.target.checked)" />
          </div>
          <div class="identity-policy-row">
            <div><strong>{{ copy.management.publicVerification }}</strong><p class="muted">{{ copy.management.publicVerificationHelp }}</p></div>
            <UiSwitch :label="copy.management.publicVerification" :checked="policy.publicVerificationEnabled" :disabled="!canUpdatePolicy || policySaving" @change="changePolicy('publicVerificationEnabled', $event.target.checked)" />
          </div>
          <button v-if="canUpdatePolicy" type="button" class="btn btn-primary" :disabled="!policyDirty || policySaving" @click="savePolicy"><AppLoading v-if="policySaving" compact />{{ authorizationCopy.save }}</button>
          <p v-else class="muted">{{ copy.management.readOnly }}</p>
        </template>
        <template v-else>
          <p v-if="!policyAllowed && !policyNotice" class="muted">{{ authorizationCopy.forbidden }}</p>
          <button type="button" class="btn btn-secondary" @click="loadPolicy">{{ copy.retry }}</button>
        </template>
        <p v-if="policyNotice" class="notice-line" role="status">{{ policyNotice }}</p>
      </div>
    </section>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import copy from '@/locales/zh-CN/shared/identityCard.js';
import authorizationCopy from '@/locales/zh-CN/shared/authorization.js';
import common from '@/locales/zh-CN/shared/common.js';
import heroCopy from '@/locales/zh-CN/shared/generated/components/workspace-hero/workspace-hero.js';
import { callApi, requireSuccess, createLocalError, errorText } from '@/runtime/api.js';
import { readCurrentAuthorizationAccess } from '@/runtime/authorizationAccess.js';
import { session, isAuthenticated, roleLabelOf } from '@/runtime/session.js';
import { formatDetailTime } from '@/runtime/dateTime.js';
import { outputFile } from '@/runtime/fileIO.js';
import UiIcon from '@/components/UiIcon.vue';
import UiSwitch from '@/components/UiSwitch.vue';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
const route = useRoute();
const router = useRouter();
const publicView = computed(() => route.name === 'identityCardVerify');
const managementOnly = computed(() => !publicView.value && route.query.area === 'management');
const viewerName = computed(() => session.context?.name || session.user?.name || '');
const viewerPosition = computed(() => session.context ? (session.context.assignmentLabel || session.context.identityName || roleLabelOf(session.context)) : '');
const viewerOrganization = computed(() => session.context?.organizationName || session.activeOrg?.name || '');
const card = ref(null), miniProgramImage = ref(''), verificationImage = ref(''), codeMode = ref('verification'), valid = ref(false), notice = ref(''), loading = ref(false), qrLoading = ref(false);
const image = computed(() => codeMode.value === 'verification' ? verificationImage.value : miniProgramImage.value);
const currentTimeText = ref(''), checkedAtText = ref('');
const policyAllowed = ref(false), policy = ref(null), canUpdatePolicy = ref(false), policyLoading = ref(false), policySaving = ref(false), policyNotice = ref('');
let savedPolicy = null;
const policyDirty = computed(() => policy.value && savedPolicy && (policy.value.issueEnabled !== savedPolicy.issueEnabled
  || policy.value.publicVerificationEnabled !== savedPolicy.publicVerificationEnabled));
function presentCard(value) {
  if (!value) return null;
  const facts = value.positionFacts || {};
  const position = facts.assignmentLabel || (facts.role === 'admin'
    ? (facts.adminLevel === 'super_admin' ? heroCopy.copy_ccd219e5f1 : heroCopy.copy_c01a9aef59)
    : facts.hasAssignment === false ? copy.noPosition : '');
  return { ...value, state: ({ admin_active: copy.adminActive, active: copy.active, no_position: copy.noPosition })[value.stateCode] || '',
    position, department: facts.department || '', identityCategory: facts.identityCategory || '', workGroup: facts.workGroup || '', hasPositionDetails: Boolean(facts.department || facts.identityCategory || facts.workGroup) };
}
let generation = 0, disposed = false, clockTimer;
function clear() { clearInterval(clockTimer); clockTimer = undefined; currentTimeText.value = ''; checkedAtText.value = ''; generation++; card.value = null; miniProgramImage.value = ''; verificationImage.value = ''; codeMode.value = 'verification'; valid.value = false; notice.value = ''; loading.value = false; qrLoading.value = false; }
function clearPolicy() {
  savedPolicy = null;
  policyAllowed.value = false;
  policy.value = null;
  canUpdatePolicy.value = false;
  policyLoading.value = false;
  policySaving.value = false;
  policyNotice.value = '';
}
function applyPolicy(result) {
  savedPolicy = result.policy;
  policy.value = result.policy;
  canUpdatePolicy.value = result.canUpdate === true;
}
async function loadPolicy() {
  if (publicView.value || policySaving.value || policyLoading.value || document.hidden || !isAuthenticated.value) return;
  const attempt = generation;
  const current = () => !disposed && attempt === generation && !document.hidden;
  policyLoading.value = true;
  policyNotice.value = '';
  try {
    const access = await readCurrentAuthorizationAccess();
    if (!current()) return;
    policyAllowed.value = Boolean(access?.grantedCapabilities.includes('identity.cardPolicy.read'));
    if (!policyAllowed.value) return;
    const result = requireSuccess(await callApi('getIdentityCardPolicy', {}));
    if (current()) applyPolicy(result);
  } catch (_) {
    if (current() && policyAllowed.value) {
      policy.value = null;
      canUpdatePolicy.value = false;
      policyNotice.value = copy.management.loadFailed;
    }
  } finally { if (current()) policyLoading.value = false; }
}
function changePolicy(key, value) {
  if (!canUpdatePolicy.value || policySaving.value || !policy.value) return;
  policy.value = { ...policy.value, [key]: value };
  policyNotice.value = '';
}
async function savePolicy() {
  if (!canUpdatePolicy.value || !policyDirty.value || policySaving.value) return;
  const attempt = generation;
  const current = () => !disposed && attempt === generation && !document.hidden;
  const { version, issueEnabled, publicVerificationEnabled } = policy.value;
  policySaving.value = true;
  policyNotice.value = '';
  try {
    const result = requireSuccess(await callApi('saveIdentityCardPolicy', { expectedVersion: version, issueEnabled, publicVerificationEnabled }));
    if (!current()) return;
    applyPolicy(result);
    policyNotice.value = copy.management.saved;
  } catch (error) {
    if (current()) {
      policy.value = null;
      canUpdatePolicy.value = false;
      policyNotice.value = errorText(error, authorizationCopy.operationFailed);
    }
  } finally { if (current()) policySaving.value = false; }
}
function showOriginal() {
  if (!image.value) return;
  const [header, data] = image.value.split(',');
  const mime = header.includes('image/png') ? 'image/png' : 'image/jpeg';
  const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0));
  return outputFile({ blob: new Blob([bytes], { type: mime }), fileName: copy.imageName + (mime === 'image/png' ? '.png' : '.jpg'), modes: ['preview', 'save'] });
}
async function load() {
  clear();
  clearPolicy();
  if (document.hidden) return;
  if (!publicView.value) loadPolicy();
  if (managementOnly.value) return;
  const attempt = generation;
  const current = () => !disposed && attempt === generation && !document.hidden;
  loading.value = true;
  try {
    const result = requireSuccess(await callApi(publicView.value ? 'verifyIdentityCard' : 'getMyIdentityCard', publicView.value ? {token: String(route.query.token || '')} : {}));
    if (!current()) return;
    valid.value = result.valid; card.value = presentCard(result.card); loading.value = false;
    if (!result.valid) { notice.value = publicView.value ? copy.verificationUnavailable : copy.personalUnavailable; return; }
    checkedAtText.value = result.checkedAt ? formatDetailTime(result.checkedAt) : '';
    currentTimeText.value = formatDetailTime(Date.now());
    clockTimer = setInterval(() => {
      if (current()) currentTimeText.value = formatDetailTime(Date.now());
    }, 1000);
    if (publicView.value) return;
    if (result.codeDisabledByPolicy === true) { notice.value = copy.codeDisabledByPolicy; return; }
    qrLoading.value = true;
    const generated = requireSuccess(await callApi('createMyIdentityCardCode', {}));
    if (!current()) return;
    if (!generated.valid || !/^data:image\/(png|jpeg);base64,/.test(generated.image || '')) throw createLocalError(copy.qrFailure);
    const verification = generated.verificationImage || generated.image;
    if (!/^data:image\/(png|jpeg);base64,/.test(verification)) throw createLocalError(copy.qrFailure);
    miniProgramImage.value = generated.image; verificationImage.value = verification; card.value = presentCard(generated.card);
  } catch (error) { if (current()) notice.value = errorText(error, qrLoading.value ? copy.qrFailure : copy.failure); }
  finally { if (current()) { loading.value = false; qrLoading.value = false; } }
}
function visibility() { if (document.hidden) { clear(); clearPolicy(); } else load(); }
document.addEventListener('visibilitychange', visibility);
watch(() => [route.name, route.query.token, route.query.area, session.context?.contextId, session.status], load, { immediate: true });
onBeforeUnmount(() => { disposed = true; clear(); clearPolicy(); document.removeEventListener('visibilitychange', visibility); });
</script>
<style scoped>
.identity-card { width: 100%; margin-inline: auto; padding: 0; overflow: hidden; }
.identity-header { padding: var(--ui-card-padding-y) var(--ui-card-padding-x); color: var(--ui-text); border-bottom: 1px solid var(--ui-line-blue); }
.identity-header h2 { font-size: var(--ui-type-section); line-height: 1.5; }
.identity-brand { font-size: var(--ui-type-meta); color: var(--ui-on-primary); }
.identity-result-icon { display: flex; align-items: center; justify-content: center; padding: var(--ui-field-gap); border-radius: var(--ui-field-radius); background: var(--ui-hero-context-bg); border: var(--ui-hero-context-border); }
.identity-result { display: inline-flex; align-self: flex-start; align-items: center; gap: var(--ui-field-gap); padding: var(--ui-label-gap) var(--ui-field-gap); border-radius: var(--ui-compact-radius); background: var(--ui-chip-green-bg); color: var(--ui-chip-green-text); font-size: var(--ui-type-body); }
.identity-fields { display: grid; gap: var(--ui-field-gap); }
.identity-field { display: flex; flex-direction: column; gap: var(--ui-label-gap); min-width: 0; padding: var(--ui-field-gap); border-radius: var(--ui-field-radius); border: 1px solid var(--ui-line-blue); background: var(--ui-field-bg); }
.identity-time { display: flex; align-items: center; gap: var(--ui-field-gap); padding-bottom: var(--ui-field-gap); border-bottom: 1px dashed var(--ui-chip-blue-border); }
.identity-time-value { color: var(--ui-blue-800); font-size: var(--ui-type-emphasis); line-height: 1.6; font-weight: 700; font-variant-numeric: tabular-nums; }
.identity-own-status { align-self: flex-start; }
.identity-body { padding: var(--ui-card-padding-y) var(--ui-card-padding-x); }
.identity-card-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--ui-inline-gap); }
.identity-card-actions > .btn { min-width: 0; max-width: 100%; }
.identity-policy-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--ui-field-gap); }
.identity-policy-row p { margin: var(--ui-label-gap) 0 0; }
.identity-name { font-size: var(--ui-type-page); line-height: 1.5; overflow-wrap: anywhere; }
.identity-code { align-items: center; text-align: center; padding-top: var(--ui-field-gap); border-top: 1px dashed var(--ui-chip-blue-border); }
.identity-code-heading, .identity-code-tabs { width: 100%; }
.identity-image { width: calc(var(--ui-control-height) * 6); max-width: 100%; aspect-ratio: 1; object-fit: contain; }
.identity-body > .btn, .identity-code > .btn { flex: none; height: auto; width: 100%; }
.identity-verification { display: flex; flex-direction: column; gap: var(--ui-card-gap); background: none; border: 0; box-shadow: none; backdrop-filter: none; overflow: visible; }
.identity-verification .identity-header,
.identity-verification .identity-body { border-radius: var(--ui-card-radius); border: var(--ui-card-border); background: var(--ui-card-bg); box-shadow: var(--ui-card-shadow); backdrop-filter: blur(12px); }
.identity-verification .identity-member-state { color: var(--ui-text-muted); }
.identity-verification .identity-result { font-size: var(--ui-type-section); font-weight: 800; gap: var(--ui-inline-gap); padding: var(--ui-field-gap); background: var(--ui-chip-green-bg); border-radius: var(--ui-field-radius); align-self: stretch; }
.identity-verification .identity-member-state { font-size: var(--ui-type-emphasis); font-weight: 600; }
.identity-verification .identity-fields { grid-template-columns: repeat(2,minmax(0,1fr)); }
.identity-verification .identity-organization-field { grid-column: 1 / -1; }
.identity-verification .identity-field { box-shadow: var(--ui-card-shadow); backdrop-filter: blur(12px); }
.identity-verification .identity-field { padding: var(--ui-field-gap); border: 1px solid var(--ui-line-blue); border-radius: var(--ui-field-radius); background: var(--ui-field-bg); }
.identity-verification .identity-time { border-bottom: 0; border-top: 1px solid var(--ui-line-blue); padding: var(--ui-field-gap) 0 0; align-items: flex-start; }
.identity-verification .identity-time-value { color: var(--ui-text-muted); font-size: var(--ui-type-meta); font-weight: 400; overflow-wrap: anywhere; }
.identity-verification .identity-live-time .identity-time-value { color: var(--ui-text); font-size: var(--ui-type-emphasis); font-weight: 700; }
</style>
