const { test } = require('node:test');
const assert = require('node:assert/strict');
const view = require('../../shared/calendarView');
const sample = () => ({id:'event',version:4,occurrenceDate:'2026-11-14',visibility:'organization',targets:[{type:'people',personIds:['original-person']}],
  startAt:'2026-11-15T03:30:00.000Z',endAt:'2026-11-15T04:30:00.000Z',
  form:{title:'Occurrence title',description:'Occurrence description',location:'Occurrence room',allDay:false,startDate:'2026-11-01',endDate:'2026-11-01',startTime:'09:00',endTime:'10:00',recurrence:{frequency:'daily',interval:1,count:30},reminders:[5]},
  seriesForm:{title:'Series title',description:'Series description',location:'Series room',allDay:true,startDate:'2026-11-01',endDate:'2026-11-02',startTime:'00:00',endTime:'00:00',recurrence:{frequency:'daily',interval:1,count:30},reminders:[60]}});
test('scope drafts use real moved occurrence times and the complete original series', () => {
  const source=sample(),drafts=view.createScopeDrafts(source,480);
  assert.equal(drafts.occurrence.draft.startDate,'2026-11-15');
  assert.equal(drafts.occurrence.draft.startTime,'11:30');
  assert.equal(drafts.occurrence.draft.endTime,'12:30');
  assert.equal(drafts.occurrence.draft.title,'Occurrence title');
  assert.equal(drafts.occurrence.ui.reminder,5);
  assert.equal(drafts.series.draft.startDate,'2026-11-01');
  assert.equal(drafts.series.draft.title,'Series title');
  assert.equal(drafts.series.draft.allDay,true);
  assert.equal(drafts.series.ui.reminder,60);
  assert.equal(drafts.series.draft.occurrenceDate,'2026-11-14');
  drafts.series.draft.targets[0].personIds.push('another');
  assert.deepEqual(source.targets,[{type:'people',personIds:['original-person']}]);
  assert.deepEqual(drafts.occurrence.draft.targets,source.targets);
});
test('historical occurrence keeps its content but uses the current series recurrence required for local saves', () => {
  const detail=sample();detail.seriesForm.recurrence={frequency:'daily',interval:2,count:10};
  const result=view.createScopeDrafts(detail,480);
  assert.deepEqual(result.occurrence.draft.recurrence,detail.seriesForm.recurrence);
  assert.equal(result.occurrence.draft.title,'Occurrence title');
  assert.equal(result.occurrence.draft.startDate,'2026-11-15');
  assert.equal(detail.form.recurrence.interval,1);
  result.occurrence.draft.recurrence.interval=3;
  assert.equal(detail.seriesForm.recurrence.interval,2);
});
test('series edits do not change occurrence recurrence targets or unsaved UI state', () => {
  const initial=view.createScopeDrafts(sample(),480),occurrence=JSON.parse(JSON.stringify(initial.occurrence.draft));
  occurrence.title='Unsaved occurrence';occurrence.startTime='13:00';
  let current=view.switchScopeDraft(initial,occurrence,'series',{endMode:'count',reminder:30});
  current.draft.title='Unsaved series';current.draft.recurrence.frequency='weekly';current.draft.recurrence.weekdays=[2,4];
  current.draft.targets=[{type:'people',personIds:['new-person']}];current.draft.allDay=false;
  current=view.switchScopeDraft(current.drafts,current.draft,'instance',{endMode:'none',reminder:1440});
  assert.equal(current.draft.title,'Unsaved occurrence');assert.equal(current.draft.startTime,'13:00');
  assert.equal(current.draft.allDay,false);assert.equal(current.draft.recurrence.frequency,'daily');
  assert.deepEqual(current.draft.targets,sample().targets);assert.deepEqual(current.ui,{endMode:'count',reminder:30});
  current=view.switchScopeDraft(current.drafts,current.draft,'series',current.ui);
  assert.equal(current.draft.title,'Unsaved series');assert.equal(current.draft.recurrence.frequency,'weekly');
  assert.deepEqual(current.draft.targets,[{type:'people',personIds:['new-person']}]);
  assert.deepEqual(current.ui,{endMode:'none',reminder:1440});assert.equal(current.draft.allDay,false);
  assert.equal(initial.occurrence.draft.title,'Occurrence title');assert.equal(initial.series.draft.title,'Series title');
});
test('instance and following share their draft without changing the original occurrence key', () => {
  const initial=view.createScopeDrafts(sample(),480),draft=JSON.parse(JSON.stringify(initial.occurrence.draft));draft.description='Unsaved detail';
  const following=view.switchScopeDraft(initial,draft,'following',{endMode:'count',reminder:-1});
  assert.equal(following.draft.scope,'following');assert.equal(following.draft.description,'Unsaved detail');
  assert.equal(following.draft.occurrenceDate,'2026-11-14');
  const instance=view.switchScopeDraft(following.drafts,following.draft,'instance',following.ui);
  assert.equal(instance.draft.description,'Unsaved detail');assert.equal(instance.ui.reminder,-1);
  assert.throws(()=>view.switchScopeDraft(initial,draft,'unknown'),/invalid_calendar_scope/);
});
test('fresh read resets both drafts and no nested returned draft mutates the stored copy', () => {
  const detail=sample(),initial=view.createScopeDrafts(detail,480);
  const current=view.switchScopeDraft(initial,initial.occurrence.draft,'series',initial.occurrence.ui);
  current.draft.recurrence.count=9;current.ui.reminder=0;
  assert.equal(current.drafts.series.draft.recurrence.count,30);assert.equal(current.drafts.series.ui.reminder,60);
  const fresh=view.createScopeDrafts(detail,480);assert.equal(fresh.series.draft.recurrence.count,30);
  assert.equal(fresh.occurrence.draft.startDate,'2026-11-15');
});
test('offset and all day occurrence dates remain local and exclusive across a day boundary', () => {
  const detail=sample();detail.startAt='2026-11-14T16:00:00.000Z';detail.endAt='2026-11-16T16:00:00.000Z';detail.form.allDay=true;
  const draft=view.createScopeDrafts(detail,480).occurrence.draft;
  assert.equal(draft.startDate,'2026-11-15');assert.equal(draft.endDate,'2026-11-17');assert.equal(draft.startTime,'00:00');assert.equal(draft.allDay,true);
});
