'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { presentIssue } = require('../../shared/hrImportIssueView');
const copy = require('../../shared/locales/zh-CN/hrImport');

test('group descriptions use structured columns and names while row details stay local to the row', () => {
  const source = { category:'dictionary',reason:'newDictionary',field:'workGroup',after:'Group',dictionaryDepartment:'Department',message:'server sentence',categoryTitle:'server category',actions:[{type:'dictionary'}],
    presentationFacts:{columns:[{field:'workGroup',index:4,header:'Work group'}],people:[{rowNumber:2,name:'Person A'},{rowNumber:3,name:'Person B'}],beforeKind:'noRegisteredValue'} };
  const group = presentIssue(source,copy);
  assert.equal(group.categoryTitle,copy.work_group_unregistered);
  assert.equal(group.explanationAvailable,true);
  assert.equal(group.message.includes('Person A'),true);
  assert.equal(group.message.includes('Person B'),true);
  assert.equal(group.message.includes('Work group'),true);
  assert.equal(group.message.includes('server sentence'),false);
  const row = presentIssue({...source,rowNumber:3},copy);
  assert.equal(row.message.includes('Person A'),false);
  assert.equal(row.message.includes('Person B'),true);
});

test('old or unknown issues offer a real recheck instead of unexplained repair operations', () => {
  const old = presentIssue({category:'invalid',message:'untrusted',actions:[{type:'replace'}]},copy);
  assert.equal(old.message,copy.issueDetailsUnavailable);
  assert.deepEqual(old.actions,[{type:'refresh'}]);
  assert.equal(old.showComparison,false);
  const unknown = presentIssue({category:'invalid',reason:'future',presentationFacts:{columns:[{field:'name',index:1,header:'Name'}],people:[{rowNumber:2,name:'A'}]},actions:[{type:'replace'}]},copy);
  assert.equal(unknown.explanationAvailable,false);
  assert.deepEqual(unknown.actions,[{type:'refresh'}]);
});
