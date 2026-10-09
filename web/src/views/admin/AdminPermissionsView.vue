<template>
  <div class="page stack">
    <WorkspaceHero
      tone="admin"
      :page-name="copy.admin.permissionsPageName"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />

    <section class="card stack">
      <div class="panel-head">
        <span class="panel-title-group">
          <span class="section-title">{{ copy.admin.permissionsListTitle }}</span>
          <span class="panel-note">{{ filteredAdmins.length }} {{ copy.admin.permissionsCountSuffix }}</span>
        </span>
      </div>

      <div class="search-bar">
        <UiIcon name="search" tone="muted" size-role="row-leading" />
        <input
          v-model="keyword"
          class="search-input"
          type="text"
          :placeholder="copy.admin.permissionsSearchPlaceholder"
        />
        <button v-if="keyword" type="button" class="search-clear" @click="keyword = ''">
          <UiIcon name="x" tone="muted" size-role="message-trailing" />
        </button>
      </div>

      <div v-if="loading" class="empty-state">{{ copy.admin.permissionsLoading }}</div>
      <div v-else-if="!notice && !filteredAdmins.length" class="empty-state">
        {{ keyword ? copy.admin.permissionsSearchEmpty : copy.admin.permissionsEmpty }}
      </div>
      <div v-else class="list">
        <button
          v-for="item in filteredAdmins"
          :key="item.id"
          type="button"
          class="list-row admin-row"
          :disabled="loading || opening || !!notice"
          @click="openAdmin(item)"
        >
          <span class="admin-role-mark">
            <UiIcon name="shield" tone="primary" size-role="row-leading" />
          </span>
          <span class="list-row-main">
            <span class="row row-wrap">
              <span class="list-row-title grow">{{ item.name || copy.admin.permissionsUnnamed }}</span>
              <span class="chip" :class="levelChip(item)">{{ item.adminLevelLabel }}</span>
            </span>
            <span class="muted">
              {{ item.bindStatusLabel }}
            </span>
            <span class="admin-progress">
              <span class="admin-progress-track">
                <span class="admin-progress-fill" :style="grantStyle(item)"></span>
              </span>
              <span class="soft">
                {{ copy.admin.permissionsEnabled }} {{ item.grantedCount }} / {{ item.applicableCount }}
              </span>
            </span>
          </span>
          <UiIcon name="chevron-right" tone="muted" size-role="message-trailing" />
        </button>
      </div>
    </section>

    <p v-if="notice" class="notice-line">{{ notice }}</p>
    <button v-if="notice" type="button" class="btn btn-secondary" @click="loadAdmins">{{ copy.common.retry }}</button>

    <GlassDialog v-if="editor" :title="selected.name + copy.admin.permissionsOf" :busy="saving" @close="closeEditor">
          <span class="soft">{{ selected.adminLevelLabel }}</span>
          <div v-for="group in groups" :key="group.key" class="glass-panel stack">
            <div class="panel-head">
              <span class="panel-title-group">
                <span class="value">{{ group.label }}</span>
                <span class="panel-note">{{ group.description }}</span>
              </span>
              <label class="switch">
                <span class="muted">{{ copy.admin.permissionsAll }}</span>
                <input
                  type="checkbox"
                  :checked="group.allGranted"
                  :disabled="saving || !group.editableCount"
                  @change="onGroupChange(group, $event)"
                />
              </label>
            </div>
            <div v-for="item in group.permissions" :key="item.key" class="permission-item">
              <span class="list-row-main">
                <span class="list-row-title">{{ item.label }}</span>
                <span class="muted">{{ item.description }}</span>
              </span>
              <span class="list-row-actions">
                <input
                  type="checkbox"
                  :checked="item.granted"
                  :aria-label="item.label"
                  :disabled="saving || !item.editable"
                  @change="onPermissionChange(item, $event)"
                />
              </span>
            </div>
          </div>
        <p v-if="editorNotice" class="notice-line" role="alert">{{ editorNotice }}</p>
        <template #footer>
          <button type="button" class="btn btn-secondary" :disabled="saving" @click="closeEditor">
            {{ copy.common.cancel }}
          </button>
          <button type="button" class="btn btn-primary" :disabled="saving" @click="savePermissions">
            {{ saving ? copy.admin.permissionsSaving : copy.admin.permissionsSave }}
          </button>
        </template>
    </GlassDialog>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import UiIcon from '@/components/UiIcon.vue';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import GlassDialog from '@/components/GlassDialog.vue';
import copy from '@/locales/zh-CN/index.js';
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import { showToast } from '@/runtime/notify.js';
import { roleLabelOf, session } from '@/runtime/session.js';

const router = useRouter();

const admins = ref([]);
const keyword = ref('');
const loading = ref(true);
const notice = ref('');
const editor = ref(false);
const saving = ref(false);
const selected = ref({});
const groups = ref([]);
const opening = ref(false);
const editorNotice = ref('');
let generation = 0;

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

const filteredAdmins = computed(() => {
  const text = keyword.value.trim().toLowerCase();
  if (!text) return admins.value;
  return admins.value.filter((item) => [item.name, item.adminLevelLabel]
    .some((field) => String(field || '').toLowerCase().indexOf(text) >= 0));
});

function levelChip(item) {
  return item && item.adminLevel === 'super_admin' ? 'chip-blue' : 'chip-sky';
}

function grantStyle(item) {
  const total = Number(item && item.applicableCount) || 0;
  const granted = Number(item && item.grantedCount) || 0;
  const percent = total ? Math.min(100, Math.round((granted * 100) / total)) : 0;
  return { width: percent + '%' };
}

function goWorkRole() {
  router.push({ name: 'workRole' });
}

function cloneGroups(source) {
  return (Array.isArray(source) ? source : []).map((group) => Object.assign({}, group, {
    permissions: (Array.isArray(group.permissions) ? group.permissions : [])
      .map((item) => Object.assign({}, item))
  }));
}

function refreshGroupState(group) {
  const editable = group.permissions.filter((item) => item.editable);
  group.editableCount = editable.length;
  group.allGranted = editable.length > 0 && editable.every((item) => item.granted);
}

function onGroupChange(group, event) {
  if (saving.value || !group.editableCount) return;
  const granted = Boolean(event.target.checked);
  group.permissions.forEach((item) => {
    if (item.editable) item.granted = granted;
  });
  refreshGroupState(group);
}

function onPermissionChange(item, event) {
  if (saving.value || !item.editable) return;
  item.granted = Boolean(event.target.checked);
  const group = groups.value.find((candidate) => candidate.permissions.indexOf(item) >= 0);
  if (item.key === 'system.admin_accounts.write' && item.granted) {
    const read = group?.permissions.find(permission => permission.key === 'system.admin_accounts.read');
    if (read?.editable) read.granted = true;
  }
  if (group) refreshGroupState(group);
}

function closeEditor() {
  if (saving.value) return;
  editor.value = false;
  selected.value = {};
  groups.value = [];
}

async function loadAdmins() {
  const request = ++generation;
  loading.value = true;
  notice.value = '';
  try {
    const result = await callApi('listPermissionManagedAdmins', {});
    if (request !== generation) return;
    requireSuccess(result);
    admins.value = Array.isArray(result.list) ? result.list : [];
  } catch (error) {
    if (request === generation) notice.value = errorText(error, copy.admin.permissionsLoadFailed);
  } finally {
    if (request === generation) loading.value = false;
  }
}

async function openAdmin(item) {
  if (saving.value || opening.value || loading.value || notice.value) return;
  const request = generation;
  opening.value = true;
  notice.value = '';
  try {
    const result = await callApi('getAdminPermissionDetail', { adminId: item.id });
    if (request !== generation) return;
    requireSuccess(result);
    selected.value = result.admin || item;
    groups.value = cloneGroups(result.groups);
    groups.value.forEach(refreshGroupState);
    editor.value = true;
    editorNotice.value = '';
  } catch (error) {
    if (request === generation) notice.value = errorText(error, copy.admin.permissionsLoadFailed);
  } finally { if (request === generation) opening.value = false; }
}

function permissionMap() {
  const map = {};
  groups.value.forEach((group) => {
    group.permissions.forEach((item) => {
      if (item.editable) map[item.key] = Boolean(item.granted);
    });
  });
  return map;
}

async function savePermissions() {
  if (saving.value || !selected.value.id) return;
  saving.value = true;
  editorNotice.value = '';
  const request = generation;
  try {
    const result = await callApi('saveAdminPermissions', {
      adminId: selected.value.id,
      permissions: permissionMap()
    });
    if (request !== generation) return;
    requireSuccess(result);
    if (Array.isArray(result.groups) && result.groups.length) {
      groups.value = cloneGroups(result.groups);
      groups.value.forEach(refreshGroupState);
    }
    editor.value = false;
    selected.value = {};
    groups.value = [];
    showToast(copy.admin.permissionsSaved);
    await loadAdmins();
  } catch (error) {
    if (request === generation) editorNotice.value = errorText(error, copy.admin.permissionsSaveFailed);
  } finally {
    saving.value = false;
  }
}

watch(() => session.context?.contextId, () => {
  editor.value = false; selected.value = {}; groups.value = []; admins.value = []; opening.value = false; loadAdmins();
}, { immediate: true });
onBeforeUnmount(() => { generation++; });
</script>

<style scoped>
.permission-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-inline-gap);
  min-height: var(--ui-field-control-height);
  padding: var(--ui-control-padding-y) 0;
  border-bottom: 1px solid var(--ui-line);
}
.permission-item:last-child { border-bottom: 0; }
.panel-title-group {
  display: flex;
  flex-direction: column;
  gap: var(--ui-label-gap);
  min-width: 0;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: var(--ui-inline-gap);
  padding: 7px 10px;
  border-radius: var(--ui-field-radius);
  background: var(--ui-field-bg);
  border: var(--ui-field-border);
  box-shadow: var(--ui-field-shadow);
}

.search-input {
  display: block;
  flex: 1 1 auto;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--ui-text);
  font-family: inherit;
  font-size: var(--ui-type-body);
  line-height: var(--ui-leading-body);
}

.search-input:focus {
  outline: none;
}

.search-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--ui-compact-height);
  min-height: var(--ui-compact-height);
  padding: 0;
  border: 0;
  border-radius: var(--ui-compact-radius);
  background: transparent;
  cursor: pointer;
}

.admin-row {
  width: 100%;
  align-items: flex-start;
  gap: var(--ui-list-gap);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.admin-role-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border-radius: var(--ui-compact-radius);
  background: linear-gradient(135deg, rgba(239, 246, 255, 0.94), rgba(219, 234, 254, 0.84));
  border: 1px solid rgba(147, 197, 253, 0.4);
}

.list-row-main {
  display: flex;
  flex-direction: column;
  gap: var(--ui-label-gap);
}

.admin-progress {
  display: flex;
  align-items: center;
  gap: var(--ui-inline-gap);
  margin-top: var(--ui-label-gap);
}

.admin-progress-track {
  flex: 1 1 auto;
  min-width: 0;
  height: 6px;
  border-radius: 999px;
  background: rgba(219, 234, 254, 0.76);
  overflow: hidden;
}

.admin-progress-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 58%, #3b82f6 100%);
}

.switch {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-label-gap);
  flex: 0 0 auto;
  min-height: var(--ui-compact-height);
}

.switch input,
.list-row-actions input {
  width: 16px;
  height: 16px;
  accent-color: #2563eb;
}

</style>
