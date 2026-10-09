<template>
  <div v-if="steps.length" class="stack">
    <details v-for="step in steps" :key="step.key" class="list-row flow-step" :class="step.state">
      <summary class="stack-tight"><strong>{{ step.name }}</strong><span>{{ step.label }}</span></summary>
      <div v-if="step.snapshot" class="stack-tight flow-expanded">
        <span v-if="step.snapshot.approverName">{{ native.copy_866290fa02 }}{{ step.snapshot.approverName }}</span>
        <span v-if="step.assignment">{{ native.approverAssignment }}{{ step.assignment }}</span>
        <span v-if="step.snapshot.approvedAt">{{ native.copy_dcadcebf08 }}{{ formatDetailTime(step.snapshot.approvedAt, step.snapshot.approvedAtReviewStatus) }}</span>
        <span v-if="step.snapshot.comment">{{ native.copy_3b3b392755 }}{{ step.snapshot.comment }}</span>
      </div>
    </details>
  </div>
</template>
<script setup>
import { computed } from 'vue';
import copy from '@/locales/zh-CN/shared/generated/subpackages/venue/utils/flowTimeline.js';
import native from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/pendingVenueApprovals/pendingVenueApprovals.js';
import { formatDetailTime } from '@/runtime/dateTime.js';
const props = defineProps({ progress: Object });
const steps = computed(() => {
  const progress = props.progress;
  if (!progress) return [];
  return Array.from({ length: Number(progress.totalSteps) || 0 }, (_, index) => {
    const snapshot = [...(progress.snapshots || [])].reverse().find(item => Number(item.stepIndex ?? item.step_index) === index
      && (!progress.flowId || String(item.flowId || item.flow_id || '') === String(progress.flowId)));
    const rejected = progress.isRejected && index === Number(progress.rejectStep);
    const done = !rejected && (progress.isApproved || index < Number(progress.isRejected ? progress.rejectStep : progress.currentStep));
    const assignment = snapshot?.approverAssignmentSnapshot;
    return {
      key: `${progress.flowId || 'legacy'}-${index}`, snapshot,
      name: progress.flowSteps?.[index]?.name || snapshot?.stepName || copy.copy_93c50c01c0 + (index + 1) + copy.copy_493a127a99,
      state: rejected ? 'rejected' : done ? 'done' : 'pending',
      label: rejected ? copy.copy_70d7f7f742 : done ? (snapshot?.automatic ? copy.automaticApproved : copy.copy_2d8cba342c)
        : index === Number(progress.currentStep) && !progress.isRejected ? copy.copy_532a477356 : copy.copy_9baefe7c49,
      assignment: assignment?.assignmentId && assignment?.departmentId && assignment?.identityCategoryId
        ? assignment.assignmentLabel || [assignment.identityCategoryName, assignment.departmentName, assignment.workGroupName].filter(Boolean).join(' · ')
        : snapshot?.approverAssignmentId || snapshot?.approverIdentityType === 'user' ? copy.historyAssignmentMissing : ''
    };
  });
});
</script>
<style scoped>
.flow-step { display: block; }
.flow-step summary { cursor: pointer; }
.flow-step.done { background: var(--ui-chip-green-bg); }
.flow-step.rejected { background: var(--ui-chip-orange-bg); }
.flow-step[open] { background: var(--ui-card-bg); }
.flow-expanded { margin-top: var(--ui-field-gap); font-size: var(--ui-type-meta); }
</style>
