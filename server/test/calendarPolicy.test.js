'use strict';
const assert = require('node:assert/strict');
const policy = require('../src/core/services/calendarPolicy');
const assignment = (id,departmentId,identityCategoryId,workGroupId)=>({id,departmentId,identityCategoryId,workGroupId});
const people = [
  {personId:'a',assignments:[assignment('a1','d1','i1','w1')]},
  {personId:'b',assignments:[assignment('b1','d1','i1','w1'),assignment('b2','d2','i2','w2')]},
  {personId:'c',assignments:[assignment('c1','d1','i2','w1'),assignment('c2','d2','i1','w2')]},
  {personId:'d',assignments:[]}
];
const catalog = {people,fields:[],departmentIds:['d1','d2'],identityCategoryIds:['i1','i2'],workGroupIds:['w1','w2']};
const actor={personId:'a',assignmentId:'a1'};
const rule={name:'范围',enabled:true,audience:[{type:'scope',departmentIds:['d1'],identityCategoryIds:['i1']}],targets:[{type:'scope',sameDepartment:true,sameIdentity:true}],actions:['assign']};
assert.deepEqual([...policy.allowedPeople([], 'assign',actor,catalog)],['a']);
assert.deepEqual([...policy.allowedPeople([rule], 'assign',actor,catalog)],['a','b']);
assert.deepEqual([...policy.allowedPeople([rule], 'update',actor,catalog)],['a']);
assert.deepEqual(policy.selectedPeople([{type:'scope',departmentIds:['d1'],identityCategoryIds:['i1']}],actor,catalog),['a','b']);
assert.deepEqual(policy.selectedPeople([{type:'people',personIds:['d']}],actor,catalog),['d']);
const admin = {personId:'admin',assignmentId:null};
assert.deepEqual(policy.selectedPeople([{type:'people',personIds:['b']}],admin,catalog),['b']);
assert.deepEqual(policy.selectedPeople([{type:'scope',sameDepartment:true}],admin,catalog),[]);
assert.throws(()=>policy.selectedPeople([{type:'people',personIds:['unknown']}],admin,catalog));
assert.deepEqual(policy.selectedPeople([{type:'people',personIds:['b','departed']}],admin,catalog,{dynamic:true}),['b']);
assert.deepEqual(policy.selectedAssignments([{type:'scope',departmentIds:['d1'],identityCategoryIds:['i1']}],actor,catalog).map(item=>item.assignment.id),['a1','b1']);
assert.throws(()=>policy.selectedPeople([{type:'scope'}],actor,catalog));
assert.throws(()=>policy.allowedPeople([rule],'assign',{...actor,assignmentId:'expired'},catalog));
assert.throws(()=>policy.assertSelection(['c'],policy.allowedPeople([rule],'assign',actor,catalog)));
const exits=[{personId:'b',scope:'instance',occurrenceDate:'2026-10-20'},{personId:'c',scope:'following',occurrenceDate:'2026-10-21'},{personId:'d',scope:'series'}];
assert(policy.hasExited(exits,'b','2026-10-20'));
assert(!policy.hasExited(exits,'b','2026-10-21'));
assert(policy.hasExited(exits,'c','2026-10-22'));
assert(!policy.hasExited(exits,'c','2026-10-20'));
assert(policy.hasExited(exits,'d','2027-01-01'));
assert.deepEqual([...policy.allowedPeople([{...rule,targets:[{type:'scope',departmentIds:['removed']}]}],'assign',actor,catalog)],['a']);
console.log('PASS 日程默认自己、同岗位交集、跨岗位不能拼接、无岗位指定、失效条件拒绝及三类永久退出');
