<template>
  <div class="page stack">
    <WorkspaceHero
      :page-name="copy.venue.title"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />
    <VenueNav active="myBookings" />

    <section class="card stack">
      <div class="panel-head">
        <div class="stack-tight">
          <span class="section-title">{{ copy.venue.mineTitle }}</span>
          <span class="panel-note">{{ copy.venue.mineNote }}</span>
        </div>
        <span class="row row-wrap">
          <button type="button" class="btn-quiet" @click="goCreate">{{ copy.venue.createTitle }}</button>
          <button type="button" class="btn-quiet" @click="load">{{ copy.audit.actionRefresh }}</button>
        </span>
      </div>

      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>

      <div v-if="loading" class="empty-state">{{ copy.common.loading }}</div>
      <div v-else-if="!bookings.length" class="empty-state">{{ copy.venue.emptyBookings }}</div>
      <div v-else class="list">
        <div v-for="booking in bookings" :key="booking.id" class="list-row">
          <div class="list-row-main stack-tight">
            <span class="list-row-title break-all">{{ booking.title }}</span>
            <span class="row row-wrap">
              <span class="chip" :class="statusTone(booking)">{{ statusLabel(booking) }}</span>
              <span class="chip chip-sky">{{ booking.venueName }}</span>
            </span>
            <span class="muted">{{ timeRange(booking) }}</span>
            <span v-if="progressText(booking)" class="soft">{{ progressText(booking) }}</span>
          </div>
          <div class="list-row-actions">
            <button
              v-if="canCancel(booking)"
              type="button"
              class="btn-quiet btn-quiet-danger"
              @click="cancelBooking(booking)"
            >
              {{ copy.venue.cancelAction }}
            </button>
            <button v-if="canEnd(booking)" type="button" class="btn-quiet" @click="endBooking(booking)">
              {{ copy.venue.endAction }}
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import VenueNav from '@/components/VenueNav.vue';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import copy from '@/locales/zh-CN/index.js';
import venueCopy from '@/locales/zh-CN/shared/generated/subpackages/venue/pages/venueBooking/venueBooking.js';
import { callApi, errorText } from '@/runtime/api.js';
import { formatListTime } from '@/runtime/dateTime.js';
import { confirmAction, showToast } from '@/runtime/notify.js';
import { roleLabelOf, session } from '@/runtime/session.js';

const router = useRouter();
const bookings = ref([]);
const loading = ref(true);
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

/** 展示状态与小程序一致：待审核 / 已通过 / 已驳回 / 已取消 / 已借用。 */
function displayStatus(booking) {
  if (booking.status === 'cancelled') return 'cancelled';
  if (booking.status === 'rejected') return 'rejected';
  if (booking.status === 'approved') {
    const start = Date.parse(booking.timeStart);
    const end = booking.timeEnd ? new Date(booking.timeEnd).getTime() : 0;
    if (end && end <= Date.now()) return 'completed';
    return Number.isFinite(start) && start <= Date.now() ? 'inUse' : 'approved';
  }
  return 'pending';
}

function statusLabel(booking) {
  const status = displayStatus(booking);
  if (status === 'cancelled') return copy.venue.statusCancelled;
  if (status === 'rejected') return copy.venue.statusRejected;
  if (status === 'inUse') return copy.venue.statusInUse;
  if (status === 'completed') return venueCopy.copy_2220286f1c;
  if (status === 'approved') return copy.venue.statusApproved;
  return copy.venue.statusPending;
}

function statusTone(booking) {
  const status = displayStatus(booking);
  if (status === 'rejected' || status === 'cancelled') return 'chip-orange';
  if (status === 'inUse') return 'chip-green';
  if (status === 'completed') return 'chip-sky';
  return 'chip-blue';
}

function timeRange(booking) {
  const start = formatListTime(booking.timeStart, booking.timeStartReviewStatus);
  const end = formatListTime(booking.timeEnd, booking.timeEndReviewStatus);
  if (!start && !end) return '';
  return start + ' ' + copy.venue.timeSeparator + ' ' + end;
}

function progressText(booking) {
  const progress = booking.approvalProgress;
  if (!progress || !progress.totalSteps) return '';
  const current = Math.max(0, Number(progress.currentStep || 0));
  return current + ' / ' + progress.totalSteps;
}

function canCancel(booking) {
  const status = displayStatus(booking);
  return status === 'pending' || status === 'approved';
}

function canEnd(booking) {
  return displayStatus(booking) === 'inUse';
}

function goWorkRole() {
  router.push({ name: 'workRole' });
}

function goCreate() {
  router.push({ name: 'venueBookingCreate' });
}

async function load() {
  loading.value = true;
  loadNotice.value = '';
  try {
    const result = await callApi('listMyVenueBookings', {});
    if (result.status !== 'success') {
      bookings.value = [];
      loadNotice.value = result.message || copy.venue.loadFailed;
      return;
    }
    bookings.value = Array.isArray(result.bookings) ? result.bookings : [];
  } catch (error) {
    bookings.value = [];
    loadNotice.value = errorText(error, copy.venue.loadFailed);
  } finally {
    loading.value = false;
  }
}

async function cancelBooking(booking) {
  const confirmed = await confirmAction({
    title: copy.venue.cancelAction,
    body: copy.venue.cancelConfirm,
    confirmText: copy.venue.cancelConfirmAction,
    cancelText: copy.common.cancel,
    danger: true
  });
  if (!confirmed) return;
  try {
    const result = await callApi('cancelVenueBooking', { id: booking.id });
    if (result.status !== 'success') {
      loadNotice.value = result.message || copy.venue.cancelFailed;
      return;
    }
    await load();
  } catch (error) {
    loadNotice.value = errorText(error, copy.venue.cancelFailed);
  }
}

async function endBooking(booking) {
  const confirmed = await confirmAction({
    title: copy.venue.endConfirmTitle,
    body: copy.venue.endConfirmContent,
    confirmText: copy.venue.endAction,
    cancelText: copy.common.cancel
  });
  if (!confirmed) return;
  try {
    const result = await callApi('endVenueBooking', { id: booking.id });
    if (result.status !== 'success') {
      loadNotice.value = result.message || copy.venue.endUnavailable;
      return;
    }
    showToast(copy.venue.endSuccess);
    await load();
  } catch (error) {
    loadNotice.value = errorText(error, copy.venue.operationFailed);
  }
}

onMounted(load);
</script>
