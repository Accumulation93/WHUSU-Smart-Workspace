<template>
  <div v-if="view" class="crypto-result">
    <div class="crypto-heading">
      <div class="crypto-title" :class="'crypto-state-' + view.state">{{ view.title }}</div>
      <div class="crypto-note">{{ view.source }}</div>
      <div v-if="view.notice" class="crypto-note">{{ view.notice }}</div>
    </div>

    <div v-if="!view.files.length" class="crypto-note">{{ copy.noFiles }}</div>

    <div v-for="file in view.files" :key="file.key" class="crypto-file">
      <div class="crypto-file-name">{{ file.name }}</div>
      <div class="crypto-file-state" :class="'crypto-state-' + file.state">{{ file.stateText }}</div>
      <div v-if="!file.platformVerified" class="crypto-note">{{ copy.platformUnconfirmed }}</div>
      <div v-if="report && file.platformVerified" class="crypto-note">{{ copy.hostedNotice }}</div>
      <div v-if="report && !file.platformVerified" class="crypto-note">{{ copy.unconfirmedReportNotice }}</div>

      <div v-if="!report" class="crypto-check-grid">
        <div v-for="check in file.summary" :key="check.key" class="crypto-check">
          <div class="crypto-check-label">{{ check.label }}</div>
          <div :class="'crypto-state-' + check.state">{{ check.text }}</div>
        </div>
      </div>

      <div v-if="report" class="crypto-check-grid">
        <div v-for="check in file.checks" :key="check.key" class="crypto-check">
          <div class="crypto-check-label">{{ check.label }}</div>
          <div :class="'crypto-state-' + check.state">{{ check.stateText }}</div>
          <div class="crypto-note">{{ check.reasonText }}</div>
        </div>
      </div>

      <div v-if="!file.steps.length" class="crypto-note">{{ copy.noSteps }}</div>

      <div v-for="step in file.steps" :key="step.key" class="crypto-step">
        <div class="crypto-step-header">
          <div class="crypto-check-label">{{ step.title }}</div>
          <div v-if="step.personText" class="crypto-person-reference">{{ step.personText }}</div>
        </div>
        <div class="crypto-person">{{ step.name }}</div>
        <div class="crypto-identity" :class="'crypto-state-' + step.state">{{ step.stateText }}</div>
        <div class="crypto-affiliation">
          <div v-if="step.organization" class="crypto-affiliation-row">
            <div class="crypto-note">{{ copy.organizationLabel }}</div>
            <div class="crypto-organization">{{ step.organization }}</div>
          </div>
          <div v-if="step.assignment" class="crypto-affiliation-row">
            <div class="crypto-note">{{ copy.assignmentLabel }}</div>
            <div class="crypto-assignment">{{ step.assignment }}</div>
          </div>
        </div>
        <div class="crypto-step-time crypto-note">{{ copy.timeLabel }} · {{ step.signedAtText }}</div>

        <div v-if="report" class="crypto-details">
          <div class="crypto-note">{{ step.digestTypeText }}</div>
          <div v-for="field in step.fields" :key="field.key" class="crypto-detail-row">
            <div class="crypto-note">{{ field.label }}</div>
            <code class="crypto-code">{{ field.value }}</code>
          </div>
        </div>
      </div>

      <div v-if="report" class="crypto-details">
        <div class="crypto-note">{{ copy.fileDigest }}</div>
        <code class="crypto-code">{{ file.fileDigest }}</code>
        <div v-for="cms in file.cms" :key="cms.key" class="crypto-detail-row">
          <div class="crypto-note">{{ copy.wholeDocument }} · {{ cms.coverage }}</div>
          <div v-for="field in cms.fields" :key="field.key" class="crypto-detail-row">
            <div class="crypto-note">{{ field.label }}</div>
            <code class="crypto-code">{{ field.value }}</code>
          </div>
        </div>

        <div v-if="file.platformVerified" class="crypto-details">
          <div class="crypto-check-label">{{ copy.certificateTitle }}</div>
          <div class="crypto-report-guide">
            <div class="crypto-check-label">{{ copy.certificateScopeTitle }}</div>
            <div class="crypto-note">{{ copy.certificateNotice }}</div>
          </div>
          <div class="crypto-report-guide">
            <div class="crypto-check-label">{{ copy.certificateUseTitle }}</div>
            <div class="crypto-note">{{ copy.certificateGuide }}</div>
          </div>
          <div class="crypto-report-guide">
            <div class="crypto-check-label">{{ copy.adobeTrustTitle }}</div>
            <div class="crypto-note">{{ copy.adobeTrustNotice }}</div>
          </div>
          <div class="crypto-report-guide">
            <div class="crypto-check-label">{{ copy.certificatePublicTrustTitle }}</div>
            <div class="crypto-note">{{ copy.certificatePublicTrust }}</div>
          </div>
          <div v-if="!file.certificates.length" class="crypto-note">{{ copy.noCertificate }}</div>
          <div
            v-for="(certificate, certificateIndex) in file.certificates"
            :key="certificate.fingerprint"
            class="crypto-certificate-actions"
          >
            <button type="button" class="btn btn-secondary" @click="exportCertificate(file.key, certificateIndex)">
              {{ copy.exportCertificate }}
            </button>
            <button type="button" class="btn btn-secondary" @click="copyCertificate(file.key, certificateIndex)">
              {{ copy.copyCertificate }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="report && file.platformVerified" class="crypto-note">{{ copy.timeNotice }}</div>
    </div>

    <button v-if="!report" type="button" class="btn btn-secondary crypto-details-toggle" @click="openReport">
      {{ copy.technical }}
    </button>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import copy from '@/locales/zh-CN/signingEvidence.js';
import { formatDetailTime } from '@/runtime/dateTime.js';
import { showToast } from '@/runtime/notify.js';
import { openVerificationReport } from '@/runtime/verification.js';

/**
 * 验签结果展示，与小程序 `components/audit-verification-result` 一一对应。
 *
 * 判断顺序、状态取值、平台身份是否成立的判定、报告模式与简明模式的差异都保持原样：
 * 只有文件内容完整、文件签名有效、处理记录可核、签署人身份绑定且平台证书成立，
 * 整份结果才可能显示为通过；任何一项缺失都退回"暂时无法确认"。
 */
const props = defineProps({
  resultJson: { type: String, default: '' },
  report: { type: Boolean, default: false }
});

const router = useRouter();

const STATES = ['passed', 'failed', 'indeterminate', 'legacy_partial'];

function stateOf(value) {
  return STATES.indexOf(value) >= 0 ? value : 'indeterminate';
}

function platformIdentityVerified(file) {
  const checks = file.checks || {};
  const bound = ['documentIntegrity', 'cmsSignature', 'identityBinding', 'platformCertificate']
    .every((key) => checks[key] && checks[key].status === 'passed');
  const receipt = checks.receiptChain && ['passed', 'legacy_partial'].indexOf(checks.receiptChain.status) >= 0;
  return bound && Boolean(receipt);
}

function details(source, names) {
  return names
    .filter((key) => source[key] !== undefined && source[key] !== '')
    .map((key) => ({
      key,
      label: copy[key] || key,
      value: Array.isArray(source[key]) ? source[key].join(' / ') : String(source[key])
    }));
}

const view = computed(() => {
  const raw = props.resultJson;
  if (!raw) return null;
  let result;
  try {
    result = JSON.parse(raw);
  } catch (_) {
    result = { verificationVersion: 2, overallStatus: 'indeterminate', files: [] };
  }
  return present(result);
});

function present(result) {
  if (!result) return null;
  const sourceFiles = Array.isArray(result.files) ? result.files : [];
  const shapeValid = Array.isArray(result.files)
    && sourceFiles.every((file) => file && typeof file === 'object'
      && (file.cms === undefined || Array.isArray(file.cms))
      && (file.steps === undefined || Array.isArray(file.steps))
      && (file.cms || []).every((item) => item && typeof item === 'object')
      && (file.steps || []).every((item) => item && typeof item === 'object'));
  const requested = result.verificationVersion === 2 ? stateOf(result.overallStatus) : 'legacy_partial';
  const complete = shapeValid && sourceFiles.length > 0
    && sourceFiles.every((file) => platformIdentityVerified(file)
      && file.checks.receiptChain.status === 'passed'
      && file.overallStatus === 'passed');
  const overall = !shapeValid || (requested === 'passed' && !complete) ? 'indeterminate' : requested;

  const files = (shapeValid ? sourceFiles : []).map((file, index) => ({
    key: String(index),
    name: file.fileName || copy.file,
    platformVerified: result.verificationVersion === 2 && Boolean(platformIdentityVerified(file)),
    state: file.overallStatus === 'passed' && !platformIdentityVerified(file)
      ? 'indeterminate'
      : stateOf(file.overallStatus),
    stateText: copy.statuses[file.overallStatus === 'passed' && !platformIdentityVerified(file)
      ? 'indeterminate'
      : stateOf(file.overallStatus)],
    fileDigest: file.currentHash || '',
    checks: Object.keys(copy.checks).map((key) => {
      const value = (file.checks && file.checks[key]) || {};
      return {
        key,
        label: copy.checks[key],
        state: stateOf(value.status),
        stateText: copy.statuses[stateOf(value.status)],
        reasonCode: value.reasonCode || '',
        reasonText: copy.reasons[value.reasonCode] || copy.unknownReason
      };
    }),
    summary: Object.keys(copy.fileChecks).map((key) => {
      const value = (file.checks && file.checks[key]) || {};
      return {
        key,
        label: copy.fileChecks[key],
        state: stateOf(value.status),
        text: copy.simpleResults[key][stateOf(value.status)]
      };
    }),
    certificates: (result.verificationVersion === 2 && platformIdentityVerified(file) && Array.isArray(file.certificates)
      ? file.certificates
      : []).filter((item) => item
        && /^[a-f0-9]{64}$/.test(item.fingerprint)
        && typeof item.derBase64 === 'string'
        && item.derBase64.length <= 90000)
      .map((item) => ({ fingerprint: item.fingerprint, derBase64: item.derBase64 })),
    cms: (file.cms || []).map((item, cmsIndex) => ({
      key: String(cmsIndex),
      fields: details(item, ['algorithm', 'certificateFingerprint', 'byteRange', 'signedBytesDigest']),
      coverage: item.wholeDocument ? copy.yes : copy.no
    })),
    steps: (result.verificationVersion === 2 && platformIdentityVerified(file) ? file.steps || [] : []).map((item) => ({
      key: item.reference,
      name: item.status === 'passed' ? item.name : copy.identityUnknown,
      assignment: item.status === 'passed' ? item.assignment : '',
      organization: item.status === 'passed' ? item.organization : '',
      personText: item.status === 'passed' && Number.isInteger(item.personIndex) && item.personIndex > 0
        ? copy.signerLabel(item.personIndex)
        : '',
      title: copy.stepTitle(item.round, item.step, copy.actions[item.action] || ''),
      signedAtText: formatDetailTime(item.signedAt),
      state: stateOf(item.status),
      stateText: item.status === 'passed' ? copy.identityConfirmed : copy.identityUnknown,
      digestTypeText: copy.digestTypes[item.outputDigestType] || '',
      fields: details(item, ['reference', 'algorithm', 'identityAlgorithm', 'snapshotAlgorithm', 'keyVersion',
        'certificateFingerprint', 'inputDigest', 'outputDigest', 'previousDigest', 'receiptDigest'])
    }))
  }));

  const fileOnly = result.verificationScope === 'file_only';
  const fileChecks = (shapeValid && sourceFiles.length === 1 && sourceFiles[0].checks) || {};
  const fileSignatureValid = fileOnly
    && fileChecks.documentIntegrity && fileChecks.documentIntegrity.status === 'passed'
    && fileChecks.cmsSignature && fileChecks.cmsSignature.status === 'passed';
  const unsigned = fileOnly && fileChecks.cmsSignature && fileChecks.cmsSignature.reasonCode === 'pdf_unsigned';

  return {
    state: overall,
    title: fileSignatureValid ? copy.fileOnlyValid : unsigned ? copy.unsignedFile : copy.statuses[overall],
    notice: fileOnly ? copy.fileOnlyNotice : '',
    source: copy.sources[result.verificationSource] || copy.noFiles,
    files
  };
}

function openReport() {
  const raw = props.resultJson;
  if (!raw) return;
  try {
    openVerificationReport(JSON.parse(raw));
  } catch (_) {
    return;
  }
  router.push({ name: 'auditVerificationReport' });
}

function certificateAt(fileIndex, certificateIndex) {
  const files = (view.value && view.value.files) || [];
  const file = files[Number(fileIndex)];
  return (file && file.certificates[Number(certificateIndex)]) || null;
}

/** 只导出已经过验证的公开证书字节，不生成也不更换签署身份。 */
function exportCertificate(fileIndex, certificateIndex) {
  const certificate = certificateAt(fileIndex, certificateIndex);
  if (!certificate) return;
  const token = String(certificate.fingerprint || '');
  if (!/^[a-f0-9]{64}$/.test(token)) return;
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    showToast(copy.exportUnavailable);
    return;
  }
  try {
    const binary = atob(certificate.derBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pkix-cert' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'WHUSU-' + token + '.cer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (_) {
    showToast(copy.exportFailed);
  }
}

async function copyCertificate(fileIndex, certificateIndex) {
  const certificate = certificateAt(fileIndex, certificateIndex);
  if (!certificate) return;
  const lines = String(certificate.derBase64 || '').match(/.{1,64}/g);
  if (!lines) return;
  const text = '-----BEGIN CERTIFICATE-----\n' + lines.join('\n') + '\n-----END CERTIFICATE-----\n';
  try {
    await navigator.clipboard.writeText(text);
    showToast(copy.certificateCopied);
  } catch (_) {
    showToast(copy.certificateCopyFailed);
  }
}
</script>

<style scoped>
.crypto-result {
  display: flex;
  flex-direction: column;
  gap: var(--ui-field-gap);
}

.crypto-heading {
  display: flex;
  flex-direction: column;
  gap: var(--ui-label-gap);
}

.crypto-title {
  font-size: var(--ui-type-value);
  font-weight: 700;
  line-height: var(--ui-leading-heading);
}

.crypto-file {
  display: flex;
  flex-direction: column;
  gap: var(--ui-inline-gap);
  padding: var(--ui-list-padding-y) var(--ui-list-padding-x);
  border-radius: var(--ui-list-radius);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.92) 0%, rgba(249, 251, 255, 0.82) 100%);
  border: 1px solid rgba(226, 237, 247, 0.96);
  box-shadow: 0 6px 12px rgba(15, 23, 42, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.78);
}

.crypto-file-name {
  font-size: var(--ui-type-emphasis);
  font-weight: 700;
  color: var(--ui-text);
  overflow-wrap: anywhere;
}

.crypto-file-state {
  font-size: var(--ui-type-meta);
  font-weight: 700;
}

.crypto-note {
  font-size: var(--ui-type-caption);
  color: var(--ui-text-muted);
  line-height: var(--ui-leading-body);
  overflow-wrap: anywhere;
}

.crypto-check-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-inline-gap);
}

.crypto-check {
  display: flex;
  flex-direction: column;
  gap: var(--ui-label-gap);
  padding: var(--ui-compact-padding-y) var(--ui-compact-padding-x);
  border-radius: var(--ui-compact-radius);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.82) 0%, rgba(246, 249, 255, 0.72) 100%);
  border: 1px solid rgba(219, 229, 241, 0.76);
}

.crypto-check-label {
  font-size: var(--ui-type-meta);
  font-weight: 700;
  color: var(--ui-text);
}

.crypto-step {
  display: flex;
  flex-direction: column;
  gap: var(--ui-label-gap);
  padding: var(--ui-compact-padding-y) var(--ui-compact-padding-x);
  border-radius: var(--ui-field-radius);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.78) 0%, rgba(248, 251, 255, 0.62) 100%);
  border: 1px solid rgba(226, 237, 247, 0.82);
}

.crypto-step-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-inline-gap);
}

.crypto-person-reference {
  flex: none;
  font-size: var(--ui-type-micro);
  font-weight: 700;
  color: var(--ui-blue-800);
  background: rgba(219, 234, 254, 0.76);
  border: 1px solid rgba(147, 197, 253, 0.64);
  border-radius: var(--ui-compact-radius);
  padding: 1px 6px;
}

.crypto-person {
  font-size: var(--ui-type-emphasis);
  font-weight: 700;
  color: var(--ui-text);
  overflow-wrap: anywhere;
}

.crypto-identity {
  font-size: var(--ui-type-meta);
  font-weight: 700;
}

.crypto-affiliation {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.crypto-affiliation-row {
  display: flex;
  gap: var(--ui-inline-gap);
  align-items: baseline;
}

.crypto-organization,
.crypto-assignment {
  flex: 1;
  min-width: 0;
  font-size: var(--ui-type-meta);
  color: var(--ui-text-body);
  overflow-wrap: anywhere;
}

.crypto-details {
  display: flex;
  flex-direction: column;
  gap: var(--ui-label-gap);
  margin-top: var(--ui-inline-gap);
  padding-top: var(--ui-inline-gap);
  border-top: 1px solid var(--ui-line);
}

.crypto-detail-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.crypto-code {
  font-size: var(--ui-type-micro);
  color: var(--ui-text-body);
  overflow-wrap: anywhere;
  word-break: break-all;
}

.crypto-report-guide {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.crypto-certificate-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--ui-action-gap);
}

.crypto-details-toggle {
  width: 100%;
}

.crypto-state-passed {
  color: #15803d;
}

.crypto-state-failed {
  color: var(--ui-danger);
}

.crypto-state-indeterminate,
.crypto-state-legacy_partial {
  color: #c2410c;
}
</style>
