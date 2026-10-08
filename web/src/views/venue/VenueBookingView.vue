<template>
  <div class="page stack">
    <WorkspaceHero
      :page-name="copy.venue.title"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />
    <VenueNav active="create" />

    <section class="card stack">
      <div class="panel-head">
        <span class="section-title">{{ copy.venue.createTitle }}</span>
      </div>

      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>

      <label class="field">
        <span class="field-label">{{ copy.venue.createVenueLabel }}</span>
        <select v-model="venueId" class="field-input">
          <option value="">{{ copy.venue.chooseVenue }}</option>
          <option v-for="venue in venues" :key="venue.id" :value="venue.id">{{ venue.name }}</option>
        </select>
      </label>

      <label class="field">
        <span class="field-label">{{ copy.venue.createTitleLabel }}</span>
        <input v-model="title" class="field-input" type="text" :placeholder="copy.venue.createTitleRequired" />
      </label>

      <label class="field">
        <span class="field-label">{{ copy.venue.createTimeLabel }}</span>
        <input v-model="timeStart" class="field-input" type="datetime-local" />
        <input v-model="timeEnd" class="field-input" type="datetime-local" />
      </label>

      <label class="field">
        <span class="field-label">{{ copy.venue.createPurposeLabel }}</span>
        <textarea
          v-model="description"
          class="field-input field-textarea"
          :placeholder="copy.venue.createDescPlaceholder"
        ></textarea>
      </label>

      <button type="button" class="btn btn-primary" :disabled="submitting" @click="submit">
        {{ submitting ? copy.venue.submitting : copy.venue.createSubmit }}
      </button>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import VenueNav from '@/components/VenueNav.vue';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import copy from '@/locales/zh-CN/index.js';
import { callApi, errorText, createRequestId } from '@/runtime/api.js';
import { showToast } from '@/runtime/notify.js';
import { roleLabelOf, session } from '@/runtime/session.js';

const route = useRoute();
const router = useRouter();
const venues = ref([]);
const venueId = ref('');
const title = ref('');
const description = ref('');
const timeStart = ref('');
const timeEnd = ref('');
const submitting = ref(false);
const loadNotice = ref('');

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

async function loadVenues() {
  try {
    const result = await callApi('listVenuesForBooking', {});
    venues.value = Array.isArray(result.venues) ? result.venues : [];
    const preset = String(route.query.venueId || '');
    if (preset) venueId.value = preset;
    else if (venues.value.length === 1) venueId.value = venues.value[0].id;
  } catch (error) {
    loadNotice.value = errorText(error, copy.venue.loadFailed);
  }
}

async function submit() {
  if (submitting.value) return;
  if (!title.value.trim()) {
    loadNotice.value = copy.venue.createTitleRequired;
    return;
  }
  if (!venueId.value || !timeStart.value || !timeEnd.value) {
    loadNotice.value = copy.venue.operationFailed;
    return;
  }
  submitting.value = true;
  loadNotice.value = '';
  try {
    const result = await callApi('createVenueBooking', {
      venueId: venueId.value,
      title: title.value.trim(),
      description: description.value,
      timeStart: timeStart.value,
      timeEnd: timeEnd.value,
      clientRequestId: createRequestId()
    });
    if (result.status !== 'success') {
      // 时间窗口、占用冲突、开放时段等判断都在服务端，这里如实展示它的说明。
      loadNotice.value = result.message || copy.venue.operationFailed;
      return;
    }
    showToast(copy.venue.createDone);
    router.replace({ name: 'venueMyBookings' });
  } catch (error) {
    loadNotice.value = errorText(error, copy.venue.operationFailed);
  } finally {
    submitting.value = false;
  }
}

onMounted(loadVenues);
</script>

<style scoped>
.field-textarea {
  min-height: 72px;
  line-height: 1.5;
  resize: vertical;
}
</style>
