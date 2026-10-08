<template>
  <div class="page stack">
    <WorkspaceHero :page-name="evidence.reportTitle" />

    <section class="card stack">
      <div class="section-title">{{ evidence.reportTitle }}</div>
      <p class="muted">{{ resultJson ? evidence.reportIntro : evidence.reportExpired }}</p>
      <AuditVerificationResult v-if="resultJson" :result-json="resultJson" report />
    </section>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import AuditVerificationResult from './AuditVerificationResult.vue';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import evidence from '@/locales/zh-CN/signingEvidence.js';
import { takeVerificationReport } from '@/runtime/verification.js';

/**
 * 验证报告页。报告由验签页一次性交接过来，只放在内存里；
 * 直接打开地址、超时或工作角色变化后都会显示"请返回验签页重新打开"。
 */

const resultJson = ref('');

onMounted(() => {
  resultJson.value = takeVerificationReport();
});
</script>
