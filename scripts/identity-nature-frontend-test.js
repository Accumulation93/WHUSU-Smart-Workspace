'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const relations=require('../shared/locales/zh-CN/identityNatureRelations');
const directory=require('../shared/contactDirectoryView');
const conditions=require('../shared/auditConditionView');
const conditionCopy=require('../shared/locales/zh-CN/auditConditions');
const picker=require('../miniprogram/components/personnel-picker/personnelPickerModel');

for(const key of ['directorySameNature','calendarSameNature','directorySameNatureSummary','calendarSameNatureSummary','incompatibleSelectionTitle','incompatibleSelectionHelp','clearIncompatibleSelection','legacyScopeChangeTitle','confirmScopeChange','configurationNotEnabled'])assert.equal(typeof relations[key],'string',key);
assert.equal(typeof relations.legacyScopeChangeHelp,'function');
assert.ok(relations.legacyScopeChangeHelp(['Nature A']).includes('Nature A'));

const original={name:'Rule',audience:[{type:'scope',departmentIds:['d1']}],targets:[{type:'scope',natureIds:['n1'],sameNature:false,identityCategoryIds:['i1']}],fieldIds:[]};
const saved=directory.payload(original);
assert.equal(Object.hasOwn(saved.audience[0],'natureIds'),false);
assert.deepEqual(saved.targets[0].natureIds,['n1']);
assert.equal(saved.targets[0].sameNature,false);
assert.deepEqual(directory.blankClause('scope').natureIds,[]);

const people=picker.normalizeOptions([{id:'p1',personId:'p1',name:'Person',assignments:[{id:'a1',assignmentNatureName:'Nature A',identityCategoryName:'Leader',departmentName:'D1'},{id:'a2',assignmentNatureName:'Nature B',identityCategoryName:'Member',departmentName:'D2'}]}],'person');
assert.equal(picker.filterOptions(people,{nature:'Nature A',identity:'Member'}).length,0);
assert.equal(picker.filterOptions(people,{nature:'Nature B',identity:'Member'}).length,1);

const fact={conditionType:'identity_scope',departmentScope:'all',identityScope:'all',workGroupScope:'all'};
const legacy=conditions.buildConditions({conditionFacts:[fact]},conditionCopy);
assert.equal(legacy.groups[0].rows[0].value,relations.legacyScope);
const scoped=conditions.buildConditions({conditionFacts:[{...fact,natureIds:['n1'],natureNames:['Nature A']}]},conditionCopy);
assert.equal(scoped.groups[0].rows[0].value,'Nature A');
assert.equal(scoped.groups[0].notice,'');
const invalid=conditions.buildConditions({conditionFacts:[{...fact,natureIds:['missing'],natureNames:[]}]},conditionCopy);
assert.equal(invalid.groups[0].notice,conditionCopy.approvalConditionIncomplete);

const root=path.resolve(__dirname,'..');
for(const relative of ['web/src/components/CalendarConditions.vue','web/src/components/ContactDirectoryAdmin.vue','web/src/components/VenueFlowEditor.vue','web/src/components/AuditConditionEditor.vue','miniprogram/components/contact-directory/contact-directory.js','miniprogram/subpackages/workspace/components/calendarConditions/calendarConditions.js']){
  const source=fs.readFileSync(path.join(root,relative),'utf8');
  for(const match of source.matchAll(/\brelations\.([A-Za-z][A-Za-z0-9_]*)/g))assert.ok(Object.hasOwn(relations,match[1]),relative+': '+match[1]);
}
console.log('Identity nature frontend checks passed');
