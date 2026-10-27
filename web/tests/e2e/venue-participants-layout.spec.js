import {test,expect} from '@playwright/test';
import {mockApi} from './fixtures.js';
import ui from '../../src/locales/zh-CN/shared/generated/subpackages/venue/pages/venueBooking/venueBooking.js';
import copy from '../../src/locales/zh-CN/shared/calendar.js';

async function openActivity(page,participants,canEdit=true) {
  await mockApi(page);
  await page.clock.setFixedTime(new Date('2035-01-01T00:00:00Z'));
  await page.route('**/api/listVenuesForBooking',r=>r.fulfill({json:{status:'success',venues:[{id:'venue',name:'Room A',approvalType:'direct'}]}}));
  await page.route('**/api/getVenueSchedule',r=>r.fulfill({json:{status:'success',dailySchedules:[{date:'2035-01-01',openSlots:[],bookedSlots:[],activitySlots:[{ruleId:'activity',ruleName:'Weekly meeting',timeStart:'09:00',timeEnd:'10:00',activity:{id:'activity',name:'Weekly meeting',occurrenceStart:'2035-01-01 09:00',occurrenceEnd:'2035-01-01 10:00',cycleType:'daily',cycleValues:{repeatCount:3}}}]}]}}));
  await page.route('**/api/getCalendarParticipants',r=>r.fulfill({json:{status:'success',participants,canEdit}}));
  await page.goto('/web/venue/bookings');
  await page.getByRole('button',{name:ui.copy_391b522838,exact:true}).click();
  await page.getByRole('button',{name:'Weekly meeting',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:ui.copy_c4df6642e3});
  await expect(dialog.locator('.calendar-participants-title')).toBeVisible();
  return dialog;
}

test('activity details and people remain compact, readable and editable',async({page},info)=>{
  const dialog=await openActivity(page,[{name:'\u5f20\u540c\u5b66',positions:[{identityCategory:'\u6210\u5458',department:'\u529e\u516c\u5ba4',workGroup:''}]},{name:'\u674e\u540c\u5b66',positions:[]}]);
  await page.screenshot({path:info.outputPath('compact-activity.png'),animations:'disabled'});
  const action=dialog.locator('.calendar-participants-action');
  const geometry=await action.evaluate(el=>{const r=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect();return {height:r.height,width:r.width,parent:p.width,center:Math.abs(r.y+r.height/2-p.y-p.height/2)};});
  expect(geometry.height).toBeGreaterThanOrEqual(36);expect(geometry.height).toBeLessThanOrEqual(48);expect(geometry.width).toBeLessThan(geometry.parent/2);expect(geometry.center).toBeLessThan(2);
  const content=await dialog.locator('.activity-detail').boundingBox();expect(content.height).toBeLessThan(390);
  const cards=await dialog.locator('.calendar-participant').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {top:r.top,height:r.height,width:r.width,scroll:n.scrollWidth};}));
  for(const card of cards){expect(card.height).toBeLessThan(95);expect(card.scroll).toBeLessThanOrEqual(card.width+1);}
  if(page.viewportSize().width>=520)expect(Math.abs(cards[0].top-cards[1].top)).toBeLessThan(1);
  await expect(dialog.getByText(copy.noPosition,{exact:true})).toBeVisible();
  await action.click();await expect(page).toHaveURL(/calendar\/edit\?sourceKind=venue_activity&sourceId=activity/);
});

test('long participant lists scroll without expanding controls or losing closing actions',async({page},info)=>{
  const participants=Array.from({length:30},(_,i)=>({name:'Participant '+i,positions:[{identityCategory:'Committee member',department:'Long department name for wrapping review',workGroup:'Public activity coordination team'}]}));
  const dialog=await openActivity(page,participants,false);
  await expect(dialog.locator('.calendar-participants-action')).toHaveCount(0);
  await dialog.getByText('Participant 29',{exact:true}).scrollIntoViewIfNeeded();
  await expect(dialog.getByText('Participant 29',{exact:true})).toBeVisible();
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath('long-participants.png'),animations:'disabled'});
  await dialog.getByRole('button',{name:ui.copy_09614cef6c,exact:true}).click();
  await expect(dialog).toHaveCount(0);
});

test('participant conditions keep compact actions and preserve selection after save',async({page},info)=>{
  await mockApi(page);
  const config={status:'success',version:2,canEdit:true,participants:[],targets:[{type:'people',personIds:[]}],people:[{personId:'p',name:'Member A',assignments:[]}],departments:[{id:'d',name:'Department A'}],identities:[],workGroups:[]};
  const writes=[];
  await page.route('**/api/getCalendarParticipants',r=>r.fulfill({json:config}));
  await page.route('**/api/saveCalendarParticipants',async r=>{const body=r.request().postDataJSON();writes.push(body);config.targets=body.targets;config.version++;await r.fulfill({json:{status:'success'}});});
  const url='/web/calendar/edit?sourceKind=venue_activity&sourceId=activity';
  await page.goto(url);
  const editor=page.locator('.calendar-condition-stack');
  await expect(editor).toBeVisible();
  await expect(page.getByRole('heading',{name:copy.participants,exact:true})).toHaveCount(1);
  const widths=await editor.locator('.calendar-condition-toolbar').evaluate(el=>({width:el.clientWidth,parent:el.parentElement.clientWidth,padding:parseFloat(getComputedStyle(el.parentElement).paddingLeft)+parseFloat(getComputedStyle(el.parentElement).paddingRight)}));
  expect(Math.abs(widths.width-(widths.parent-widths.padding))).toBeLessThan(2);
  for(const action of await editor.locator('button').all()) {
    const r=await action.boundingBox();expect(r.height).toBeGreaterThanOrEqual(36);expect(r.height).toBeLessThanOrEqual(48);
  }
  await editor.getByRole('button',{name:copy.choosePeople+' · 0',exact:true}).click();
  const picker=page.getByRole('dialog');
  await picker.getByText('Member A',{exact:true}).click();
  await picker.getByRole('button',{name:/\u786e\u8ba4/,exact:false}).click();
  await expect(editor.getByText('Member A',{exact:true})).toBeVisible();
  await editor.getByRole('button',{name:copy.addCondition,exact:true}).click();
  const scope=editor.locator('.calendar-condition-card').nth(1);
  await scope.locator('summary').first().click();
  await scope.getByLabel('Department A',{exact:true}).check();
  const selected=await scope.locator('.personnel-option-selected').evaluate(el=>({border:getComputedStyle(el).borderTopWidth,background:getComputedStyle(el).backgroundImage}));
  expect(selected.border).toBe('1px');expect(selected.background).toContain('linear-gradient');
  expect(await editor.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath('participant-editor.png'),animations:'disabled'});
  await page.getByRole('button',{name:copy.save,exact:true}).click();
  await expect(page).toHaveURL(/\/web\/calendar$/);
  expect(writes).toHaveLength(1);expect(writes[0].targets[0].personIds).toEqual(['p']);expect(writes[0].targets[1].departmentIds).toEqual(['d']);
  await page.goto(url);await expect(page.locator('.calendar-condition-card').first().getByText('Member A',{exact:true})).toBeVisible();
});
