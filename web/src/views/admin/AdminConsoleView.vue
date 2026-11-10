<template>
  <div :class="embedded ? 'stack' : 'page stack'">
    <WorkspaceHero
      v-if="!embedded"
      :tone="session.context?.role === 'admin' ? 'admin' : 'blue'"
      :page-name="module.label"
      :person-name="displayName"
      :identity-name="roleLine"
      :organization-name="orgName"
      @switch="goWorkRole"
    />

    <section v-if="permissionLoading || permissionNotice || !tabs.length" class="card stack">
      <AppLoading v-if="permissionLoading" /><span v-else class="notice-line">{{ permissionNotice || copy.errors.permissionDenied }}</span>
      <button v-if="permissionNotice" type="button" class="btn-quiet" @click="loadPermissions">{{ personnel.dictionaryRetry }}</button>
    </section>
    <div v-if="tabs.length" class="tabs admin-tabs" role="tablist" :aria-label="module.label">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        class="tab"
        role="tab"
        :aria-selected="activeTab === tab.key"
        :disabled="permissionLoading || !!permissionNotice || actionBusy"
        :class="{ 'tab-active': activeTab === tab.key }"
        @click="selectTab(tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-if="activeTab === 'hrInfo'" class="tabs"><button v-if="canMembers || canMigration" class="tab" :class="{ 'tab-active': hrMode === 'profiles' }" :disabled="actionBusy" @click="hrMode = 'profiles'">{{ copy.admin.tabHr }}</button><button v-if="canDirectory" class="tab" :class="{ 'tab-active': hrMode === 'directory' }" :disabled="actionBusy" @click="hrMode = 'directory'">{{ directoryCopy.title }}</button><button v-if="canReadAuthPolicy" class="tab" :class="{ 'tab-active': hrMode === 'policy' }" :disabled="actionBusy" @click="hrMode='policy'">{{ accountCopy.copy_aef40f4a64 }}</button></div>
    <ContactDirectoryAdmin v-if="activeTab === 'hrInfo' && hrMode === 'directory' && canDirectory" :disabled="permissionLoading || !!permissionNotice" @busy="actionBusy = $event" />
    <AdminActivityPanel v-if="activeTab === 'activities'" :state="activityState" :disabled="permissionLoading || !!permissionNotice" @busy="actionBusy = $event" />
    <AdminTemplatePanel v-else-if="activeTab === 'templates'" :state="templateState" :disabled="permissionLoading || !!permissionNotice" @busy="actionBusy = $event" />
    <AdminRulePanel v-else-if="activeTab === 'rules'" :state="ruleState" :disabled="permissionLoading || !!permissionNotice" @busy="actionBusy = $event" />
    <AdminResultPanel v-else-if="activeTab === 'results'" :state="resultState" :profile="profile" :disabled="permissionLoading || !!permissionNotice" @busy="actionBusy = $event" />
    <AdminAuditTemplatePanel v-else-if="activeTab === 'auditTemplates'" :state="auditTemplateState" :disabled="permissionLoading || !!permissionNotice" @busy="actionBusy=$event" />
    <AdminAuditStampPanel v-else-if="activeTab === 'auditStamps'" :state="auditStampState" :disabled="permissionLoading || !!permissionNotice" @busy="actionBusy=$event" />
    <AdminAuditVerificationPanel v-else-if="activeTab === 'auditVerification'" :state="auditVerificationState" :disabled="permissionLoading || !!permissionNotice" @busy="actionBusy=$event" />
    <AdminAuditSubmissionPanel v-else-if="activeTab === 'auditSubmissions'" :profile="profile" :disabled="permissionLoading || !!permissionNotice" @busy="actionBusy=$event" />
    <AdminSettingsPanel v-else-if="activeTab === 'settings'" :state="settingsState" :profile="profile" :disabled="permissionLoading || !!permissionNotice" @busy="actionBusy = $event" />
    <AdminAccountPanel v-else-if="activeTab === 'admins'" @busy="actionBusy = $event" />
    <AdminHrTemplatePanel v-else-if="activeTab === 'hrTemplates'" @busy="actionBusy = $event" />
    <AdminPublicationPanel v-else-if="activeTab === 'publications'" @busy="actionBusy = $event" />
    <AdminDictionaryPanel v-else-if="['departments', 'workGroups', 'identities'].includes(activeTab)" :key="activeTab" :kind="activeTab" :state="dictionaryStates[activeTab]" :disabled="permissionLoading || !!permissionNotice" @busy="actionBusy = $event" />
    <AssignmentNatureEditor v-else-if="activeTab === 'assignmentNatures' && !permissionLoading && !permissionNotice" @busy="actionBusy = $event" />
    <section v-else-if="activeTab === 'hrInfo' && hrMode === 'profiles' && canMembers" class="card stack">
      <div class="panel-head">
        <div class="stack-tight">
          <span class="section-title">{{ copy.admin.tabHr }}</span>
          <span class="panel-note">
            {{ rows.length }} {{ copy.admin.memberCountSuffix }}
          </span>
        </div>
        <button v-if="loadNotice" type="button" class="btn-quiet" :disabled="loading" @click="load">{{ personnel.dictionaryRetry }}</button>
      </div>

      <label class="field">
        <input
          v-model="keyword"
          class="field-input"
          type="search"
          :placeholder="copy.admin.memberSearchPlaceholder"
        />
      </label>

      <p v-if="loadNotice" class="notice-line">{{ loadNotice }}</p>

      <div v-if="loading && !rows.length" class="empty-state"><AppLoading :text="copy.common.loading" /></div>
      <div v-else-if="!loadNotice && !filteredRows.length" class="empty-state">{{ copy.admin.memberEmpty }}</div>
      <div v-else class="list">
        <div v-for="row in filteredRows" :key="row.hrId || row.id" class="list-row">
          <div class="list-row-main stack-tight">
            <PersonLink class="list-row-title break-all" :name="row.name" :hr-id="row.hrId || row.id" />
            <span class="row row-wrap">
              <span v-if="row.studentId" class="muted">{{ row.studentId }}</span>
              <span class="chip" :class="row.auth?.status === 'verified' ? 'chip-green' : 'chip-orange'">
                {{ accountState(row) }}
              </span>
            </span>
            <details v-if="row.assignments?.length" class="stack-tight">
              <summary>{{ copy.hr.assignmentLabel }} {{ row.assignments.length }}</summary>
              <span v-for="assignment in row.assignments" :key="assignment.assignmentId" class="muted break-all">{{ [assignment.identityCategoryName, assignment.department, assignment.workGroup].filter(Boolean).join(' · ') }}</span>
            </details>
            <button v-if="canReadGovernance && row.personId" class="btn-quiet" :disabled="actionBusy" @click="router.replace({name:'adminConsole',query:{subApp:'hr',tab:'hrInfo',hrId:row.hrId||row.id}})">{{ copy.admin.memberDetailTitle }}</button>
          </div>
        </div>
      </div>
    </section>

    <section v-else-if="activeTab && activeTab !== 'hrInfo'" class="card stack">
      <span class="section-title">{{ activeLabel }}</span>
      <p class="notice-line">{{ copy.admin.managementPageUnavailable }}</p>
    </section>
    <HrProfileMigrationPanel v-if="activeTab === 'hrInfo' && hrMode === 'profiles' && canMigration" @busy="actionBusy = $event" />
    <HrAuthenticationPolicy v-if="activeTab === 'hrInfo' && hrMode === 'policy' && canReadAuthPolicy" @busy="actionBusy = $event" />
    <HrPersonDetail v-if="activeTab === 'hrInfo' && canMembers && route.query.hrId && !permissionLoading && !permissionNotice" :hr-id="String(route.query.hrId)" :assignments="rows.find(row => (row.hrId || row.id) === route.query.hrId)?.assignments || []" :can-read-profile="canReadProfiles" :governance-row="canReadGovernance ? rows.find(row => (row.hrId || row.id) === route.query.hrId) : null" @refresh="refreshPerson" @close="router.replace({name:'adminConsole',query:{subApp:'hr',tab:'hrInfo'}})" />
    <footer v-if="!embedded" class="page-footer"><div class="footer-name">{{ copy.common.appName }}</div><div class="footer-org">{{ copy.common.organizationName }}</div></footer>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import ContactDirectoryAdmin from '@/components/ContactDirectoryAdmin.vue';
import HrPersonDetail from '@/components/HrPersonDetail.vue';
import directoryCopy from '@/locales/zh-CN/shared/contactDirectory.js';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import AdminDictionaryPanel from '@/components/AdminDictionaryPanel.vue';
import AssignmentNatureEditor from '@/components/AssignmentNatureEditor.vue';
import AdminActivityPanel from '@/components/AdminActivityPanel.vue';
import AdminTemplatePanel from '@/components/AdminTemplatePanel.vue';
import AdminSettingsPanel from '@/components/AdminSettingsPanel.vue';
import AdminAccountPanel from '@/components/AdminAccountPanel.vue';
import AdminHrTemplatePanel from '@/components/AdminHrTemplatePanel.vue';
import AdminPublicationPanel from '@/components/AdminPublicationPanel.vue';
import HrProfileMigrationPanel from '@/components/HrProfileMigrationPanel.vue';
import HrAuthenticationPolicy from '@/components/HrAuthenticationPolicy.vue';
import AdminRulePanel from '@/components/AdminRulePanel.vue';
import AdminResultPanel from '@/components/AdminResultPanel.vue';
import AdminAuditTemplatePanel from '@/components/AdminAuditTemplatePanel.vue';
import AdminAuditStampPanel from '@/components/AdminAuditStampPanel.vue';
import AdminAuditVerificationPanel from '@/components/AdminAuditVerificationPanel.vue';
import AdminAuditSubmissionPanel from '@/components/AdminAuditSubmissionPanel.vue';
import resultCopy from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/resultBehavior.js';
import copy from '@/locales/zh-CN/index.js';
import personnel from '@/locales/zh-CN/shared/adminPersonnel.js';
import authorizationCopy from '@/locales/zh-CN/shared/authorization.js';
import accountCopy from '@/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/authPersonnelBehavior.js';
import { callApi, errorText, requireSuccess } from '@/runtime/api.js';
import { adminModule, adminTabs } from '@/runtime/adminNavigation.js';
import { roleLabelOf, session } from '@/runtime/session.js';
import { emptyTemplateForm } from '@/runtime/templateQuestions.js';
import { emptyRuleForm } from '@/runtime/scoringRuleForm.js';
import { provideAdminCapabilities, hasAdminCapability } from '@/runtime/adminCapabilities.js';
import { readCurrentAuthorizationAccess } from '@/runtime/authorizationAccess.js';

const router = useRouter();
const route = useRoute();
const props = defineProps({ embedded: Boolean, subApp: String });
const emit = defineEmits(['busy']);
const subAppKey = computed(() => props.subApp || route.query.subApp || 'scoring');
const activeTab = ref('');
const keyword = ref('');
const rows = ref([]);
const loading = ref(false);
const loadNotice = ref('');
const permissionLoading = ref(false);
const permissionNotice = ref('');
const profile = ref(null);
const hrMode = ref(route.query.copyKind === 'hr.directoryRules' ? 'directory' : 'profiles');
const canDirectory = computed(() => ['read', 'create', 'update', 'delete'].some(action => hasAdminCapability(profile.value, 'hr.directory.manage', 'hr.directoryRules.' + action)));
const canReadProfiles = computed(() => hasAdminCapability(profile.value, 'hr.people', 'hr.people.read')
  || hasAdminCapability(profile.value, 'hr.profile_review', 'hr.profileReview.read'));
const canReadGovernance = computed(() => [
  ['auth.identity.verify', 'auth.identity.read'],
  ['auth.accounts.recover', 'auth.recovery.read'],
  ['auth.accounts.global_manage', 'auth.accounts.read']
].some(([legacy, capability]) => hasAdminCapability(profile.value, legacy, capability)));
const canMembers = computed(() => canReadProfiles.value || canReadGovernance.value);
const canMigration = computed(() => hasAdminCapability(profile.value, 'hr.people', 'hr.profileMigration.read'));
const canReadAuthPolicy = computed(() => hasAdminCapability(profile.value, 'auth.policy.manage', 'auth.policy.read'));
provideAdminCapabilities(profile);
const actionBusy = ref(false);
const activityState = reactive({ form: { id: '', name: '', description: '', startDate: '', endDate: '' }, resetAfterRead: false });
const templateState = reactive({ form: emptyTemplateForm(), resetAfterRead: false, expanded: null });
const settingsState = reactive({ timezone: 8, timezoneAccess: null, dirty: false, pending: false, closeAfterRead: false, form: null, created: null });
const ruleState = reactive({form:emptyRuleForm(),activityId:'',configIndex:-1,filters:{department:'',identity:''},selected:[],pending:false,resetAfterRead:false});
const emptyResultState = () => ({ filters: { department: resultCopy.copy_31d4595959, identity: resultCopy.copy_31d4595959, workGroup: resultCopy.copy_31d4595959, viewMode: 'overview', sortMode: 'score_desc' }, activityId: '', pending: false, target: null, department: '', scorer: null });
const resultState = reactive(emptyResultState());
const emptyAuditTemplate=()=>({id:'',name:'',description:'',starterType:'conditions',starterConditions:[],steps:[]});
const auditTemplateState=reactive({form:emptyAuditTemplate(),pending:false,resetAfterRead:false});
const auditStampState=reactive({form:{id:'',name:'',imageData:''},pending:false,resetAfterRead:false});
const auditVerificationState=reactive({grantee:null,pending:false});
const dictionaryStates = reactive(Object.fromEntries(['departments', 'workGroups', 'identities'].map(kind => [kind, {
  form: { id: '', name: '', description: '', departmentId: '' }, resetAfterRead: false
}])));
const module = computed(() => adminModule(subAppKey.value));
const tabs = computed(() => adminTabs(subAppKey.value, profile.value));
let generation = 0;
let permissionGeneration = 0;
let disposed = false;
const scope = () => [session.context?.organizationId, session.context?.contextId, subAppKey.value].join('|');

const activeLabel = computed(() => {
  const tab = tabs.value.find((item) => item.key === activeTab.value);
  return tab ? tab.label : '';
});

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

const filteredRows = computed(() => {
  const query = keyword.value.trim().toLowerCase();
  if (!query) return rows.value;
  return rows.value.filter((row) => String(row.name || '').toLowerCase().indexOf(query) >= 0);
});

function accountState(row) {
  const auth = row.auth;
  if (!auth) return accountCopy.accountStateUnknown;
  const labels = {
    verified: accountCopy.copy_8e4abe3d58,
    frozen: accountCopy.copy_f6eb285e87,
    recovery_required: accountCopy.copy_16399ef078
  };
  if (labels[auth.status]) return labels[auth.status];
  if (!row.accountId) return accountCopy.accountNotCreated;
  if (auth.status === 'pending_verification') return accountCopy.accountPendingVerification;
  return accountCopy.accountStateUnknown;
}

function goWorkRole() {
  if (actionBusy.value) return;
  router.push({ name: 'workRole' });
}

function selectTab(key) {
  if (actionBusy.value || permissionLoading.value || permissionNotice.value || !tabs.value.some(tab => tab.key === key)) return;
  activeTab.value = key;
  if (!props.embedded) router.replace({ name: 'adminConsole', query: { subApp: subAppKey.value, tab: key } });
}

async function refreshPerson(event) {
  if (!event?.governanceHrId) return load();
  if (!canReadGovernance.value) return;
  const expected=scope(), request=generation, id=event.governanceHrId;
  try {
    const result=requireSuccess(await callApi('listHrGovernance',{organizationId:session.context?.organizationId}));
    if(disposed||expected!==scope()||request!==generation)return;
    const updated=(result.rows||[]).find(row=>(row.hrId||row.id)===id);
    rows.value=rows.value.map(row=>(row.hrId||row.id)===id ? (updated ? {...row,...updated} : {...row,canGlobalAccountManage:false,canVerifyIdentity:false,canRecoverAccount:false,auth:null}) : row);
  } catch(error) { if(!disposed&&expected===scope())loadNotice.value=errorText(error,copy.errors.requestFailed); }
}

async function load() {
  if (activeTab.value !== 'hrInfo' || hrMode.value !== 'profiles' || !canMembers.value || permissionNotice.value || permissionLoading.value) return;
  const request = ++generation;
  const expected = scope();
  const current = () => !disposed && request === generation && expected === scope() && activeTab.value === 'hrInfo';
  loading.value = true;
  loadNotice.value = '';
  try {
    const [result, governance] = await Promise.all([
      callApi(canReadProfiles.value ? 'listHrProfileAdminData' : 'listHrGovernance', { organizationId: session.context?.organizationId }).then(requireSuccess),
      canReadProfiles.value && canReadGovernance.value ? callApi('listHrGovernance', { organizationId: session.context?.organizationId }).then(requireSuccess) : null
    ]);
    if (!current()) return;
    if (!Array.isArray(result.rows)) throw new Error();
    rows.value = result.rows.map(row => Object.assign({}, row, (governance?.rows || []).find(item => (item.hrId || item.id) === (row.hrId || row.id)) || {}));
  } catch (error) {
    if (current()) loadNotice.value = errorText(error, copy.errors.requestFailed);
  } finally {
    if (current()) loading.value = false;
  }
}

async function loadPermissions() {
  const request = ++permissionGeneration;
  const expected = scope();
  const current = () => !disposed && request === permissionGeneration && expected === scope();
  permissionLoading.value = true;
  permissionNotice.value = '';
  profile.value = null;
  activeTab.value = '';
  try {
    const access = await readCurrentAuthorizationAccess();
    if (!current() || !access) return;
    if (access.mode !== 'enforced' && session.context?.role !== 'admin') throw new Error(copy.errors.permissionDenied);
    const result = access.mode === 'enforced' ? { authorizationAccess: access }
      : requireSuccess(await callApi('getMyAdminPermissions', {}));
    if (!current()) return;
    if (result.organizationId && result.organizationId !== session.context?.organizationId) throw new Error(copy.errors.permissionDenied);
    profile.value = result;
    if (!canMembers.value && !canMigration.value) hrMode.value = canDirectory.value ? 'directory' : canReadAuthPolicy.value ? 'policy' : 'profiles';
    const requested = route.query.tab;
    activeTab.value = tabs.value.some(tab => tab.key === requested) ? requested
      : tabs.value.some(tab => tab.key === activeTab.value) ? activeTab.value : tabs.value[0]?.key || '';
  } catch (error) { if (current()) permissionNotice.value = errorText(error, copy.errors.permissionDenied); }
  finally { if (current()) permissionLoading.value = false; }
}
function resetView() {
  permissionGeneration++;
  generation++; profile.value = null; activeTab.value = ''; rows.value = []; keyword.value = ''; loadNotice.value = '';
  Object.assign(activityState.form, { id: '', name: '', description: '', startDate: '', endDate: '' }); activityState.resetAfterRead = false;
  Object.assign(templateState.form, emptyTemplateForm()); templateState.resetAfterRead = false; templateState.expanded = null;
  Object.assign(settingsState, { timezone: 8, timezoneAccess: null, dirty: false, pending: false, closeAfterRead: false, form: null, created: null });
  Object.assign(ruleState, {form:emptyRuleForm(),activityId:'',configIndex:-1,filters:{department:'',identity:''},selected:[],pending:false,resetAfterRead:false});
  Object.assign(resultState, emptyResultState());
  Object.assign(auditTemplateState,{form:emptyAuditTemplate(),pending:false,resetAfterRead:false});
  Object.assign(auditStampState,{form:{id:'',name:'',imageData:''},pending:false,resetAfterRead:false});
  Object.assign(auditVerificationState,{grantee:null,pending:false});
  for (const state of Object.values(dictionaryStates)) {
    Object.assign(state.form, { id: '', name: '', description: '', departmentId: '' }); state.resetAfterRead = false;
  }
}
function onVisibilityChange() {
  resetView();
  if (!document.hidden) loadPermissions();
}
watch(scope, () => {
  resetView();
  if (!document.hidden) loadPermissions();
}, { immediate: true });
watch(() => route.query.tab, key => { if (tabs.value.some(tab => tab.key === key)) activeTab.value = key; });
watch([activeTab, hrMode, permissionLoading], () => { generation++; if (activeTab.value === 'hrInfo' && !permissionLoading.value) load(); });
watch(actionBusy, value => emit('busy', value), { flush: 'sync' });
onMounted(() => document.addEventListener('visibilitychange', onVisibilityChange));
onBeforeUnmount(() => { disposed = true; generation++; permissionGeneration++; emit('busy', false); document.removeEventListener('visibilitychange', onVisibilityChange); });
onBeforeRouteLeave(() => session.status !== 'authenticated' || !actionBusy.value);
onBeforeRouteUpdate(() => session.status !== 'authenticated' || !actionBusy.value);
</script>

<style scoped>
.admin-tabs .tab { min-width: 0; width: 0; padding-inline: var(--ui-admin-tab-padding-x); font-size: var(--ui-admin-tab-font-size); white-space: nowrap; }
</style>
