import { expect, test } from '@playwright/test';
import { mockApi } from './fixtures.js';
import authorization from '../../src/locales/zh-CN/shared/authorization.js';
import venueUi from '../../src/locales/zh-CN/shared/generated/subpackages/venue/pages/venueManage/venueManage.js';
import adminUi from '../../src/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/admin.js';
import pickerUi from '../../src/locales/zh-CN/shared/personnelPicker.js';
import hrTemplateCopy from '../../src/locales/zh-CN/shared/hrTemplateSave.js';
import migrationUi from '../../src/locales/zh-CN/shared/hrProfileMigration.js';
import personnelCopy from '../../src/locales/zh-CN/shared/adminPersonnel.js';
import publicationCopy from '../../src/locales/zh-CN/shared/generated/subpackages/scoring/pages/admin/modules/publicationBehavior.js';

async function grant(page, capabilities) {
  await mockApi(page);
  await page.route('**/api/getCurrentAuthorizationAccess', route => route.fulfill({ json: {
    status: 'success', mode: 'enforced', revision: 1,
    organizationId: 'org-1', contextId: 'ctx-assignment', role: 'user',
    capabilities, grantedCapabilities: capabilities
  } }));
}

test('assignment editor creates a nature without losing its draft and rereads the saved assignment', async ({ page }) => {
  await grant(page,['hr.people.read','hr.assignments.create','hr.assignments.update','hr.assignmentNatures.create']);
  let natures=[{id:'staff',name:'Staff'}],assignments=[],natureWrites=0,assignmentWrites=0,failRead=false;
  await page.route('**/api/listHrProfileAdminData',route=>route.fulfill({json:{status:'success',rows:[{id:'member',name:'Member',assignments:[]}]}}));
  await page.route('**/api/getHrPersonDetail',route=>route.fulfill({json:{status:'success',profile:{name:'Member'},template:{fields:[]},values:{},membershipStatus:'active'}}));
  await page.route('**/api/listAssignmentNatures',route=>route.fulfill({json:{status:'success',list:[],canCreate:true}}));
  await page.route('**/api/listPersonIdentities',route=>route.fulfill({json:failRead?{status:'error',message:'Read failed'}:{status:'success',organizations:[{organizationId:'org-1',organizationName:'Organization',hrId:'member',canEditAssignments:true,canAddAssignment:true,assignments,dictionaries:{assignmentNatures:natures,departments:[{id:'dept',name:'Department'}],identities:[{id:'identity',name:'Identity'}],workGroups:[]}}]}}));
  await page.route('**/api/saveAssignmentNature',route=>{expect(route.request().postDataJSON()).toEqual({name:'Project role'});natureWrites++;natures.push({id:'new-nature',name:'Project role'});failRead=true;return route.fulfill({json:{status:'success',nature:natures[1]}});});
  await page.route('**/api/saveMembershipAssignment',route=>{const value=route.request().postDataJSON();expect(value).toEqual({id:'',hrId:'member',organizationId:'org-1',assignmentKind:'new-nature',departmentId:'dept',identityId:'identity',workGroupId:''});assignmentWrites++;assignments=[{...value,id:'assignment',canEdit:true,writableFields:['*'],assignmentNatureLabel:'Project role'}];return route.fulfill({json:{status:'success'}});});
  await page.goto('/web/admin?subApp=hr&tab=hrInfo&hrId=member');
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:adminUi.copy_9242c7c6e4,exact:true}).click();
  await dialog.getByRole('combobox',{name:adminUi.copy_7ee1272d5b,exact:true}).selectOption('dept');
  await dialog.getByRole('combobox',{name:adminUi.hrIdentityCategory,exact:true}).selectOption('identity');
  await dialog.getByRole('button',{name:personnelCopy.addAssignmentNature,exact:true}).click();
  await dialog.getByLabel(personnelCopy.assignmentNatureName).fill('Project role');
  await dialog.getByRole('button',{name:personnelCopy.createAndSelectNature,exact:true}).click();
  await expect(dialog.getByText('Read failed',{exact:true})).toBeVisible();failRead=false;
  await dialog.getByRole('button',{name:personnelCopy.dictionaryRetry,exact:true}).click();
  await expect(dialog.getByRole('combobox',{name:adminUi.hrAssignmentNature,exact:true})).toHaveValue('new-nature');
  await expect(dialog.getByRole('combobox',{name:adminUi.copy_7ee1272d5b,exact:true})).toHaveValue('dept');
  await dialog.getByRole('button',{name:adminUi.copy_1b38edadcc,exact:true}).click();
  await expect.poll(()=>assignmentWrites).toBe(1);expect(natureWrites).toBe(1);
  await dialog.getByRole('button',{name:adminUi.copy_e040ae3016,exact:true}).click();
  await expect(dialog.getByRole('combobox',{name:adminUi.hrAssignmentNature,exact:true})).toHaveValue('new-nature');
});

test('personnel template create edit and reopening use saved field definitions', async ({ page }) => {
  await grant(page, ['hr.profileTemplates.read','hr.profileTemplates.create','hr.profileTemplates.update']);
  let rows=[],reads=0;
  await page.route('**/api/listHrProfileTemplates',route=>{reads++;return route.fulfill({json:{status:'success',list:rows,activeSnapshot:null,canManage:true,canSelect:false}});});
  await page.route('**/api/saveHrProfileTemplateDefinition',route=>{const value=route.request().postDataJSON();expect(value.fields[0].type).toBe('text');rows=[{...value,id:'template-1',fields:value.fields.map((field,index)=>({...field,id:'field-'+index}))}];return route.fulfill({json:{status:'success',id:'template-1'}});});
  await page.goto('/web/admin?subApp=hr&tab=hrTemplates');
  await page.getByRole('button',{name:adminUi.copy_96187d380e,exact:true}).click();
  await page.getByLabel(adminUi.copy_53adcabdff,{exact:true}).fill('New profile template');
  await page.getByLabel(adminUi.copy_93ab263567,{exact:true}).fill('Office');
  await page.getByRole('button',{name:adminUi.copy_41e8060a1f,exact:true}).click();
  await expect(page.locator('article').filter({hasText:'New profile template'})).toBeVisible();
  await page.getByRole('button',{name:hrTemplateCopy.viewEditAction,exact:true}).click();
  await expect(page.getByLabel(adminUi.copy_93ab263567,{exact:true})).toHaveValue('Office');
  await page.getByLabel(adminUi.copy_93ab263567,{exact:true}).fill('Office room');
  await page.getByRole('button',{name:adminUi.copy_41e8060a1f,exact:true}).click();
  await expect(page.locator('form')).toHaveCount(0);
  await page.getByRole('button',{name:hrTemplateCopy.viewEditAction,exact:true}).click();
  await expect(page.getByLabel(adminUi.copy_93ab263567,{exact:true})).toHaveValue('Office room');
  expect(reads).toBeGreaterThanOrEqual(3);
  await expect(page.locator('article').getByRole('button',{name:adminUi.copy_acc985cabc,exact:true})).toHaveCount(0);
});

test('publication creates a view rule and reopens the persisted clauses without dictionary management', async ({ page }) => {
  await grant(page,['scoring.publications.read','scoring.publications.create','scoring.publications.update','scoring.activities.read']);
  let rules=[],reads=0;
  await page.route('**/api/listScoreActivities',route=>route.fulfill({json:{status:'success',currentActivityId:'activity',list:[{id:'activity',name:'Activity'}]}}));
  await page.route('**/api/getResultPublication',route=>{reads++;return route.fulfill({json:{status:'success',publication:{id:'publication',activityId:'activity',isPublished:false},viewRules:rules,meritRules:[],assignmentCandidates:[],meritListDesignations:[],configurationCandidates:{departments:[{id:'dept',name:'Department'}],identities:[{id:'identity',name:'Identity'}]}}});});
  await page.route('**/api/getMeritListSummary',route=>route.fulfill({json:{status:'success',groups:[]}}));
  await page.route('**/api/savePubViewRule',route=>{const value=route.request().postDataJSON();expect(value.publicationId).toBe('publication');expect(value.clauses).toEqual([{scopeType:'own_results',targetIdentityId:'',displayMode:'score',gradeBands:[]}]);rules=[{...value,id:'rule',granteeDepartment:'Department',granteeIdentity:'Identity',clauses:value.clauses.map((clause,index)=>({...clause,id:'clause-'+index}))}];return route.fulfill({json:{status:'success'}});});
  await page.goto('/web/admin?subApp=scoring&tab=publications');
  await page.locator('section').filter({has:page.getByText(adminUi.copy_17903d1b98,{exact:true})}).getByRole('button',{name:adminUi.copy_32d3256b22,exact:true}).click();
  await page.getByRole('combobox',{name:adminUi.copy_0bfd822c5b,exact:true}).selectOption('dept');
  await page.getByRole('combobox',{name:adminUi.copy_9a5675654c,exact:true}).selectOption('identity');
  await page.getByRole('button',{name:adminUi.copy_04d8c1a10d,exact:true}).click();
  await expect(page.locator('form')).toHaveCount(0);
  await expect(page.locator('article').filter({hasText:'Department · Identity'})).toBeVisible();
  await page.locator('article').filter({hasText:'Department · Identity'}).getByRole('button',{name:adminUi.copy_e040ae3016,exact:true}).click();
  await expect(page.getByRole('combobox',{name:adminUi.copy_0bfd822c5b,exact:true})).toHaveValue('dept');
  expect(reads).toBeGreaterThanOrEqual(2);
});

test('publication read failure preserves rows and prevents writes until successful retry', async ({ page }) => {
  await grant(page,['scoring.publications.read','scoring.publications.create','scoring.publications.update','scoring.activities.read']);
  let fails = false;
  let writes = 0;
  await page.route('**/api/listScoreActivities', route => route.fulfill({json:{status:'success',currentActivityId:'activity',list:[{id:'activity',name:'Activity'}]}}));
  await page.route('**/api/getResultPublication', route => route.fulfill({json: fails ? {status:'error'} : {status:'success',publication:{id:'publication',isPublished:false},viewRules:[{id:'rule',granteeDepartment:'Retained department',granteeIdentity:'Role',clauses:[]}],meritRules:[],configurationCandidates:{departments:[],identities:[]}}}));
  await page.route('**/api/getMeritListSummary', route => route.fulfill({json:{status:'success',groups:[]}}));
  await page.route('**/api/saveResultPublication', route => { writes++; return route.fulfill({json:{status:'success'}}); });
  await page.goto('/web/admin?subApp=scoring&tab=publications');
  const row = page.locator('article').filter({hasText:'Retained department'});
  await expect(row).toBeVisible();
  fails = true;
  await page.getByRole('combobox',{name:adminUi.copy_5aa4cb13ec,exact:true}).selectOption('activity');
  await expect(page.getByText(publicationCopy.publicationLoadFailed,{exact:true})).toBeVisible();
  await expect(row).toBeVisible();
  await expect(page.getByRole('button',{name:adminUi.copy_a7cce01d43,exact:true})).toBeDisabled();
  await expect(row.getByRole('button',{name:adminUi.copy_e040ae3016,exact:true})).toHaveCount(0);
  expect(writes).toBe(0);
  fails = false;
  await page.getByRole('button',{name:publicationCopy.publicationRetry,exact:true}).click();
  await expect(page.getByText(publicationCopy.publicationLoadFailed,{exact:true})).toHaveCount(0);
  await expect(row.getByRole('button',{name:adminUi.copy_e040ae3016,exact:true})).toBeVisible();
});

test('migration-only role selects minimal members and submits then rereads its request', async ({ page }) => {
  await grant(page,['hr.profileMigration.read','hr.profileMigration.request']);
  let requests=[],reads=0;
  await page.route('**/api/listCrossOrgMigrationRequests',route=>{reads++;return route.fulfill({json:{status:'success',myRequests:requests,pendingForMe:[]}});});
  await page.route('**/api/getCrossOrgMigrationContext',route=>route.fulfill({json:{status:'success',canDirect:false,visibleOrgs:[{id:'source',name:'Source organization'}],members:[{personId:'person',name:'Selected person'}],sourceFields:[{id:'sourceField',label:'Phone',type:'text'}],targetFields:[{id:'targetField',label:'Phone',type:'text'}]}}));
  await page.route('**/api/previewCrossOrgMigration',route=>{expect(route.request().postDataJSON().personIds).toEqual(['person']);return route.fulfill({json:{status:'success',switchToken:'checked-token',blockers:[],conflicts:[]}});});
  await page.route('**/api/submitCrossOrgMigrationRequest',route=>{const value=route.request().postDataJSON();expect(value.switchToken).toBe('checked-token');requests=[{id:'request',sourceOrgName:'Source organization',targetOrgName:'Target organization',statusText:migrationUi.statusPending,personCount:1,canCancel:true}];return route.fulfill({json:{status:'success'}});});
  await page.goto('/web/admin?subApp=hr&tab=hrInfo');
  await page.getByRole('button',{name:migrationUi.entry,exact:true}).click();
  await page.getByRole('combobox',{name:migrationUi.sourceOrg,exact:true}).selectOption('source');
  await page.getByRole('button',{name:new RegExp('^'+migrationUi.selectMembers)}).click();
  await page.getByRole('dialog').getByText('Selected person',{exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:pickerUi.confirm,exact:true}).click();
  await page.getByRole('combobox',{name:migrationUi.fieldPlanTitle,exact:true}).selectOption('copy');
  await page.getByRole('combobox',{name:migrationUi.targetField,exact:true}).selectOption('targetField');
  await page.getByRole('button',{name:migrationUi.preview,exact:true}).click();
  await page.getByRole('button',{name:migrationUi.submitRequest,exact:true}).click();
  await page.getByRole('dialog',{name:migrationUi.submitRequest,exact:true}).getByRole('button').last().click();
  await expect(page.locator('article').filter({hasText:'Source organization'})).toBeVisible();
  await expect(page.locator('form')).toHaveCount(0);
  expect(reads).toBeGreaterThanOrEqual(2);
});

test('account read-only role inspects security without write controls or profile reads', async ({ page }) => {
  await grant(page,['auth.accounts.read']);
  let profileReads=0;
  await page.route('**/api/getHrPersonDetail',route=>{profileReads++;return route.fulfill({json:{status:'forbidden'}});});
  await page.route('**/api/listHrGovernance',route=>route.fulfill({json:{status:'success',rows:[{id:'member',hrId:'member',personId:'person',name:'Member',canGlobalAccountManage:false,auth:{status:'verified'}}]}}));
  await page.route('**/api/admin/auth/security',route=>route.fulfill({json:{status:'success',accountExists:true,bindingStatus:'bound',passphraseSet:true,canGlobalManage:false}}));
  await page.goto('/web/admin?subApp=hr&tab=hrInfo&hrId=member');
  await expect(page.getByRole('dialog')).toContainText(adminUi.copy_563acb4455);
  await expect(page.getByRole('dialog').getByRole('button',{name:adminUi.copy_eb1ebe5d11,exact:true})).toHaveCount(0);
  await expect(page.getByRole('dialog').getByRole('textbox')).toHaveCount(0);
  expect(profileReads).toBe(0);
});

test('policy reader sees current switches and cannot save', async ({ page }) => {
  await grant(page,['auth.policy.read']);
  await page.route('**/api/admin/auth/policy',route=>{expect(route.request().postDataJSON()).toEqual({action:'get'});return route.fulfill({json:{status:'success',policy:{initial_claim_enabled:true,allow_passphrase:true,allow_recovery_code:false}}});});
  await page.goto('/web/admin?subApp=hr&tab=hrInfo');
  await expect(page.getByRole('checkbox').first()).toBeChecked();
  for(const checkbox of await page.getByRole('checkbox').all())await expect(checkbox).toBeDisabled();
  await expect(page.getByRole('button',{name:adminUi.copy_7e4100d002,exact:true})).toHaveCount(0);
});

test('policy editor saves switches and rereads authoritative values', async ({ page }) => {
  await grant(page,['auth.policy.read','auth.policy.update']);
  let saved,reads=0;
  await page.route('**/api/admin/auth/policy',route=>{const value=route.request().postDataJSON();if(value.action==='get'){reads++;return route.fulfill({json:{status:'success',policy:saved||{initialClaimEnabled:true,allowPassphrase:true,allowRecoveryCode:false}}});}saved=value;return route.fulfill({json:{status:'success',policy:value}});});
  await page.goto('/web/admin?subApp=hr&tab=hrInfo');
  await page.getByRole('checkbox',{name:adminUi.copy_c318ac62ef,exact:true}).check();
  await page.getByRole('button',{name:adminUi.copy_7e4100d002,exact:true}).click();
  await expect.poll(()=>reads).toBe(2);
  expect(saved.allowRecoveryCode).toBe(true);
  await expect(page.getByRole('checkbox',{name:adminUi.copy_c318ac62ef,exact:true})).toBeChecked();
});

test('recovery operator approves one request and rereads the cleared action', async ({ page }) => {
  await grant(page,['auth.recovery.read','auth.recovery.update','auth.accounts.update']);
  let pending='recovery-1',reads=0;
  await page.route('**/api/listHrGovernance',route=>{reads++;return route.fulfill({json:{status:'success',rows:[{id:'member',hrId:'member',personId:'person',accountId:'account',name:'Member',canRecoverAccount:true,canGlobalAccountManage:true,auth:{status:'recovery_required',pendingRecoveryId:pending}}]}});});
  await page.route('**/api/admin/auth/recoveries',route=>{expect(route.request().postDataJSON()).toEqual({action:'approve',recoveryRequestId:'recovery-1'});pending='';return route.fulfill({json:{status:'success'}});});
  await page.goto('/web/admin?subApp=hr&tab=hrInfo&hrId=member');
  await page.getByRole('button',{name:adminUi.copy_a25637362e,exact:true}).click();
  await page.getByRole('dialog',{name:adminUi.copy_d98f6ae430,exact:true}).getByRole('button').last().click();
  await expect.poll(()=>reads).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole('button',{name:adminUi.copy_a25637362e,exact:true})).toHaveCount(0);
});

test('ordinary assignment manages venues in the same page with separate create and update grants', async ({ page }) => {
  await grant(page, ['venue.resources.read', 'venue.resources.create']);
  let rows = [{ id: 'v1', name: 'Existing room' }];
  await page.route('**/api/listVenues', route => route.fulfill({ json: { status: 'success', venues: rows } }));
  await page.route('**/api/saveVenue', route => {
    const value = route.request().postDataJSON();
    expect(value.id).toBe('');
    rows = [...rows, { ...value, id: 'v2' }];
    return route.fulfill({ json: { status: 'success' } });
  });
  await page.goto('/web/venue/bookings');
  await page.getByRole('tab', { name: authorization.businessManagement, exact: true }).click();
  await expect(page.locator('.venue-resource')).toContainText('Existing room');
  await expect(page.locator('.venue-resource').getByRole('button', { name: venueUi.copy_e040ae3016, exact: true })).toHaveCount(0);
  await expect(page.locator('.workspace-hero')).toHaveCount(1);
  await page.getByRole('button', { name: venueUi.copy_4fd7b5de41, exact: true }).click();
  await page.getByRole('dialog').getByLabel(venueUi.copy_70ae057f15).fill('New room');
  await page.getByRole('dialog').getByRole('button', { name: venueUi.copy_c701dd2fcc, exact: true }).click();
  await expect(page.locator('.venue-resource').filter({ hasText: 'New room' })).toBeVisible();
  await expect(page).toHaveURL(/\/web\/venue\/bookings$/);
});

test('configuration-only venue grant opens rules through minimal candidate without resource disclosure', async ({ page }) => {
  await grant(page,['venue.bookingRules.read']);
  await page.route('**/api/listVenues',route=>route.fulfill({json:{status:'success',venues:[],configurationVenues:[{id:'v1',name:'Configured room'}]}}));
  await page.route('**/api/listVenueBookingRules',route=>route.fulfill({json:{status:'success',rules:[],bookingRules:[],bookingWindow:null}}));
  await page.goto('/web/venue/bookings');
  await page.getByRole('tab',{name:authorization.businessManagement,exact:true}).click();
  await expect(page.getByText('Configured room',{exact:true})).toBeVisible();
  await expect(page.locator('.venue-resource')).toHaveCount(0);
  await page.getByRole('button',{name:venueUi.copy_f10a13b6e1,exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('ordinary assignment manages permitted departments inside personnel page', async ({ page }) => {
  await grant(page, ['hr.departments.read']);
  await page.route('**/api/listAuthorizedDictionary', route => route.fulfill({ json: {
    status: 'success', list: [{ id: 'd1', name: 'Permitted department', canUpdate: false, canDelete: false }]
  } }));
  await page.goto('/web/hr/profile');
  await page.getByRole('tab', { name: authorization.businessManagement, exact: true }).click();
  await expect(page.locator('.dictionary-row')).toContainText('Permitted department');
  await expect(page.locator('.dictionary-row button')).toHaveCount(0);
  await expect(page.locator('form')).toHaveCount(0);
  await expect(page.locator('.workspace-hero')).toHaveCount(1);
  await expect(page).toHaveURL(/\/web\/hr\/profile$/);
});

test('personnel field editor submits only granted fields and rereads persisted values', async ({ page }) => {
  await grant(page, ['hr.people.read', 'hr.people.update']);
  let saved = 'Old phone', reads = 0;
  await page.route('**/api/listHrProfileAdminData', route => route.fulfill({ json: { status: 'success', rows: [{ id: 'member', name: 'Member', assignments: [] }] } }));
  await page.route('**/api/getHrPersonDetail', route => {
    reads++;
    return route.fulfill({ json: { status: 'success', membershipStatus: 'active', profile: { name: 'Member' },
      template: { fields: [{ id: 'phone', label: 'Editable phone', type: 'text' }, { id: 'note', label: 'Read-only note', type: 'text' }] },
      values: { phone: saved, note: 'Restricted to reading' }, writableFieldIds: ['phone'], canReviewProfiles: false } });
  });
  await page.route('**/api/saveHrPersonFull', route => {
    expect(route.request().postDataJSON()).toEqual({ hrId: 'member', profileValues: { phone: 'New phone' } });
    saved = 'New phone';
    return route.fulfill({ json: { status: 'success' } });
  });
  await page.goto('/web/admin?subApp=hr&tab=hrInfo&hrId=member');
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Editable phone')).toHaveValue('Old phone');
  await expect(dialog.getByText('Restricted to reading', { exact: true })).toBeVisible();
  await expect(dialog.locator('input')).toHaveCount(1);
  await dialog.getByLabel('Editable phone').fill('New phone');
  await dialog.locator('button[type="submit"]').click();
  await expect.poll(() => reads).toBeGreaterThan(1);
  await expect(dialog.getByLabel('Editable phone')).toHaveValue('New phone');
});

test('administrator edits preserve the person association without requiring a student identifier', async ({ page }) => {
  await mockApi(page, { activeContextId: 'ctx-admin' });
  await page.route('**/api/getCurrentAuthorizationAccess', route => route.fulfill({ json: { status: 'success', mode: 'enforced', revision: 1,
    organizationId: 'org-1', contextId: 'ctx-admin', role: 'admin', capabilities: ['system.adminAccounts.read', 'system.adminAccounts.update'],
    grantedCapabilities: ['system.adminAccounts.read', 'system.adminAccounts.update'] } }));
  let name = 'Old admin', reads = 0;
  await page.route('**/api/listAdmins', route => { reads++; return route.fulfill({ json: { status: 'success', canRead: true, canWrite: true, canCreate: false,
    list: [{ id: 'a1', name, adminLevel: 'admin', canEdit: true, canDelete: false }], creatableLevels: [] } }); });
  await page.route('**/api/saveAdmin', route => {
    expect(route.request().postDataJSON()).toEqual({ id: 'a1', name: 'New admin', adminLevel: 'admin' }); name = 'New admin';
    return route.fulfill({ json: { status: 'success' } });
  });
  await page.goto('/web/admin?subApp=system&tab=admins');
  await expect(page.getByRole('button', { name: adminUi.copy_a6b6f71690, exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: adminUi.copy_49a7fb10d7, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: adminUi.copy_e040ae3016, exact: true }).click();
  await page.getByRole('dialog').getByLabel(adminUi.copy_7a4d5ab30f).fill('New admin');
  await expect(page.getByRole('dialog').getByLabel(adminUi.copy_80fba348b7)).toHaveCount(0);
  await page.getByRole('dialog').locator('button[type="submit"]').click();
  await expect.poll(() => reads).toBeGreaterThan(1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('New admin', { exact: true })).toBeVisible();
});

test('administrator creation selects an existing person and rereads the new identity', async ({ page }) => {
  await mockApi(page, { activeContextId: 'ctx-admin' });
  await page.route('**/api/getCurrentAuthorizationAccess', route => route.fulfill({ json: { status: 'success', mode: 'enforced', revision: 1,
    organizationId: 'org-1', contextId: 'ctx-admin', role: 'admin', capabilities: ['system.adminAccounts.read', 'system.adminAccounts.create'],
    grantedCapabilities: ['system.adminAccounts.read', 'system.adminAccounts.create'] } }));
  let list = [];
  await page.route('**/api/listAdmins', route => route.fulfill({ json: { status: 'success', canRead: true, canWrite: true, canCreate: true,
    list, creatableLevels: [{ value: 'admin', label: 'Administrator' }] } }));
  await page.route('**/api/getAdminAccountCandidates', route => route.fulfill({ json: { status: 'success', list: [{ hrId: 'h1', name: 'Existing member' }] } }));
  await page.route('**/api/saveAdmin', route => {
    expect(route.request().postDataJSON()).toEqual({ hrId: 'h1', adminLevel: 'admin' });
    list = [{ id: 'a1', name: 'Existing member', adminLevel: 'admin', canEdit: false, canDelete: false }];
    return route.fulfill({ json: { status: 'success' } });
  });
  await page.goto('/web/admin?subApp=system&tab=admins');
  await page.getByRole('button', { name: adminUi.copy_a6b6f71690, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: adminUi.copy_809f3d3dd3, exact: true }).click();
  const picker = page.getByRole('dialog').last();
  await picker.getByRole('button', { name: 'Existing member', exact: true }).click();
  await picker.getByRole('button', { name: pickerUi.confirm, exact: true }).click();
  await page.getByRole('dialog').locator('button[type="submit"]').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Existing member', { exact: true })).toBeVisible();
});

test('ordinary assignment reads permitted submissions inside audit page without delete permission', async ({ page }) => {
  await grant(page, ['audit.submissions.read']);
  await page.route('**/api/listAllAuditSubmissions', route => route.fulfill({ json: {
    status: 'success', submissions: [{ id: 's1', title: 'Permitted submission', status: 'approved', submissionNumber: 'A001' }]
  } }));
  await page.goto('/web/audit/my-submissions');
  await page.getByRole('tab', { name: authorization.businessManagement, exact: true }).click();
  await expect(page.locator('.audit-submission')).toContainText('Permitted submission');
  await expect(page.locator('.btn-danger')).toHaveCount(0);
  await expect(page.locator('.workspace-hero')).toHaveCount(1);
  await expect(page).toHaveURL(/\/web\/audit\/my-submissions$/);
});

test('personnel readers load the profile directory without account governance permission', async ({ page }) => {
  await mockApi(page, { activeContextId: 'ctx-admin' });
  await page.route('**/api/getMyAdminPermissions', route => route.fulfill({ json: {
    status: 'success', organizationId: 'org-1', adminLevel: 'admin', permissions: { 'hr.people': true }
  } }));
  let governanceReads = 0;
  await page.route('**/api/listHrGovernance', route => {
    governanceReads++;
    return route.fulfill({ status: 403, json: { status: 'forbidden' } });
  });
  await page.route('**/api/listHrProfileAdminData', route => route.fulfill({ json: {
    status: 'success', rows: [{ id: 'member', name: 'Profile directory member', assignments: [] }]
  } }));
  await page.goto('/web/admin?subApp=hr');
  await expect(page.getByText('Profile directory member', { exact: true })).toBeVisible();
  expect(governanceReads).toBe(0);
});
