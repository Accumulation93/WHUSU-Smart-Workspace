import {test,expect} from '@playwright/test';
import {mockApi} from './fixtures.js';
import homeCopy from '../../src/locales/zh-CN/shared/home.js';
import copy from '../../src/locales/zh-CN/shared/calendar.js';

test('日程共享 Hero 随工作角色切换配色且只保留一份卡片间距', async ({ page }, testInfo) => {
  await setup(page);
  await page.goto('/web/calendar');
  const hero = page.locator('.workspace-hero');
  const measurements = [];
  const inspect = async role => {
    await expect(page.getByRole('button', { name: copy.ruleManage, exact: true })).toBeVisible();
    if (role === 'admin') await expect(hero).toHaveClass(/workspace-hero-admin/);
    else await expect(hero).not.toHaveClass(/workspace-hero-admin/);
    await page.locator('main.page').evaluate(async element => {
      await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})));
    });
    const bounds = await hero.evaluate(element => {
      const heroBox = element.getBoundingClientRect();
      const controlsBox = element.nextElementSibling.getBoundingClientRect();
      return { gap: controlsBox.top - heroBox.bottom, expectedGap: parseFloat(getComputedStyle(element.parentElement).gap), background: getComputedStyle(element).backgroundImage };
    });
    expect(Math.abs(bounds.gap - bounds.expectedGap)).toBeLessThan(1);
    expect(bounds.gap).toBeGreaterThanOrEqual(9);
    measurements.push({ role, width: page.viewportSize().width, ...bounds });
    await page.screenshot({ path: testInfo.outputPath(`calendar-hero-${measurements.length}-${role}.png`) });
  };
  await inspect('user');
  await hero.locator('.workspace-context-card').click();
  await expect(page).toHaveURL(/\/work-role$/);
  await page.locator('.role-row').filter({ hasText: '管理权限' }).click();
  await expect(page).toHaveURL(/\/portal$/);
  await expect(hero).toHaveClass(/workspace-hero-admin/);
  await page.locator('.app-grid-item').filter({ hasText: copy.title }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  await inspect('admin');
  await page.getByRole('button', { name: copy.create, exact: true }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(page.locator('.calendar-editor')).toBeVisible();
  await expect(hero).toHaveClass(/workspace-hero-admin/);
  await hero.locator('.workspace-context-card').click();
  await page.locator('.role-row').filter({ hasText: '综合事务 · 办公室' }).click();
  await expect(page).toHaveURL(/\/portal$/);
  await expect(hero).not.toHaveClass(/workspace-hero-admin/);
  await page.locator('.app-grid-item').filter({ hasText: copy.title }).click();
  await inspect('user');
  await page.goto('/web/workbench?subApp=scoring');
  await expect(hero).toBeVisible();
  await expect(hero).not.toHaveClass(/workspace-hero-admin/);
  await testInfo.attach('calendar-hero-spacing', { body: JSON.stringify(measurements), contentType: 'application/json' });
  console.log(JSON.stringify({ project: testInfo.project.name, measurements }));
});

async function setup(page){
  await mockApi(page);
  const calls=[];
  const config={status:'success',permissions:{manage:true,rules:true},timezoneOffset:480,people:[],departments:[],identities:[],workGroups:[],rules:[]};
  for(const name of ['getCalendarConfiguration','getCalendarRules','getCalendar','saveCalendarEvent','manageCalendarSubscription'])await page.route('**/api/'+name,async route=>{
    const body=route.request().postDataJSON();calls.push({name,body});
    await route.fulfill({json:name==='getCalendar'?{status:'success',items:[]}:name==='saveCalendarEvent'?{status:'success',id:'saved',version:1}:name==='manageCalendarSubscription'?{status:'success',url:'https://example.invalid/calendar',server:'https://example.invalid/calendar',username:'calendar',password:'test-only'}:config});
  });
  return calls;
}
test('日程四种视图和空状态可用，页面不横向溢出',async({page})=>{
  await setup(page);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/web/calendar');
  await expect(page.getByRole('button',{name:copy.ruleManage,exact:true})).toBeVisible();
  const actions=await page.locator('.calendar-primary-tabs > button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {text:n.textContent,x:r.x,y:r.y,width:r.width,height:r.height};}));
  expect(actions.map(item=>item.text)).toEqual([copy.title,copy.ruleManage,copy.systemCalendar]);
  expect(Math.max(...actions.map(item=>item.y))-Math.min(...actions.map(item=>item.y))).toBeLessThan(1);
  expect(Math.max(...actions.map(item=>item.height))-Math.min(...actions.map(item=>item.height))).toBeLessThan(1);
  const controls=await page.locator('.calendar-navigation').evaluate(element=>Array.from(element.children).map(child=>child.getBoundingClientRect().top));
  expect(Math.max(...controls.slice(0,3))-Math.min(...controls.slice(0,3))).toBeLessThan(2);
  if(page.viewportSize().width<520)expect(controls[3]).toBeGreaterThan(controls[0]);
  else expect(Math.max(...controls)-Math.min(...controls)).toBeLessThan(2);
  const search=await page.locator('.search-field').evaluate(element=>{const icon=element.querySelector('svg,img'),input=element.querySelector('input');return icon ? Math.abs((icon.getBoundingClientRect().top+icon.getBoundingClientRect().height/2)-(input.getBoundingClientRect().top+input.getBoundingClientRect().height/2)) : 999;});
  expect(search).toBeLessThan(2);
  for(const mode of ['month','week','day','list']){
    await page.locator('.calendar-view-tabs').getByRole('button',{name:copy[mode],exact:true}).click();
    await expect(page.locator('.calendar-view-tabs .tab-active')).toHaveText(copy[mode]);
  }
  await expect(page.getByText(copy.empty,{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  expect(errors).toEqual([]);
});
test('calendar ranges retain actual review fields and the calendar timezone', async ({page}) => {
  await setup(page);
  await page.route('**/api/getCalendarConfiguration', route => route.fulfill({json:{status:'success',permissions:{},timezoneOffset:0}}));
  const item = {id:'review-event',occurrenceDate:'2026-11-14',title:'Review event',sourceKind:'manual',startAt:'2026-11-14T08:30:45Z',startAtReviewStatus:'review_required'};
  await page.route('**/api/getCalendar', route => route.fulfill({json:{status:'success',items:[item]}}));
  await page.goto('/web/calendar?date=2026-11-14');
  await page.locator('.calendar-view-tabs').getByRole('button',{name:copy.list,exact:true}).click();
  const card = page.getByRole('button').filter({hasText:'Review event'});
  await expect(card).toContainText('2026年11月14日 08:30 · 时间待核对');
  await card.click();
  await expect(page.getByRole('dialog',{name:'Review event'})).toContainText('2026年11月14日 08:30 · 时间待核对');
});

test('个人日程真实表单参数包含日期时间和提醒',async({page})=>{
  const calls=await setup(page);await page.goto('/web/calendar/edit?date=2026-11-02');
  await page.getByLabel(copy.name,{exact:true}).fill('日程保存回归');
  await page.getByRole('button',{name:copy.save,exact:true}).click();
  await expect(page).toHaveURL(/\/web\/calendar$/);
  const saved=calls.find(item=>item.name==='saveCalendarEvent');
  expect(saved.body).toMatchObject({title:'日程保存回归',startDate:'2026-11-02',startTime:'09:00',visibility:'private',reminders:[15]});
});

test('calendar month cells and date selector remain readable on narrow screens', async ({ page }) => {
  await setup(page);
  await page.goto('/web/calendar');
  await expect(page.locator('.calendar-date').first()).toBeVisible();
  for (const width of [320, 375, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const boxes = await page.locator('.calendar-grid').evaluate(element => {
      const outer = element.getBoundingClientRect();
      return [...element.querySelectorAll('.calendar-date')].map(cell => {
        const rect = cell.getBoundingClientRect(), text = cell.querySelector('strong').getBoundingClientRect();
        return { right: rect.right, outerRight: outer.right, width: rect.width, textWidth: text.width,
          overflow: cell.scrollWidth - cell.clientWidth };
      });
    });
    for (const box of boxes) {
      expect(box.right).toBeLessThanOrEqual(box.outerRight + 1);
      expect(box.overflow).toBeLessThanOrEqual(1);
      expect(box.textWidth).toBeLessThanOrEqual(box.width);
    }
    const date = await page.locator('.calendar-navigation input').boundingBox();
    expect(date.width).toBeGreaterThanOrEqual(120);
  }
});
test('订阅重置需要确认，取消不发写请求',async({page})=>{
  const calls=await setup(page);await page.goto('/web/calendar');
  await page.getByRole('button',{name:copy.systemCalendar,exact:true}).click();
  await page.getByRole('button',{name:copy.subscribe,exact:true}).click();
  await expect(page.getByText(copy.subscriptionResetConfirm,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:copy.cancel,exact:true}).click();
  expect(calls.filter(item=>item.name==='manageCalendarSubscription')).toHaveLength(0);
  await page.getByRole('button',{name:copy.subscribe,exact:true}).click();
  await page.getByRole('button',{name:copy.save,exact:true}).click();
  await expect(page.getByText('https://example.invalid/calendar',{exact:true})).toBeVisible();
  expect(calls.filter(item=>item.name==='manageCalendarSubscription')).toHaveLength(1);
});
test('日程卡打开人员详情，退出确认不会叠放两个窗口',async({page})=>{
  await setup(page);
  const today=new Date(Date.now()+480*60000).toISOString().slice(0,10);
  const item={id:'meeting',occurrenceDate:today,title:'工作安排讨论会',startAt:today+'T01:00:00Z',endAt:today+'T02:00:00Z',allDay:false,location:'会议室',description:'讨论本周工作',sourceKind:'manual',visibility:'organization',version:1,attending:true,canUpdate:true,canCancel:true,participants:[{name:'测试成员',positions:[{department:'办公室',identityCategory:'成员',workGroup:''}]}]};
  await page.route('**/api/getCalendar',route=>route.fulfill({json:{status:'success',items:[item]}}));
  await page.goto('/web/calendar');
  await page.getByRole('button',{name:/工作安排讨论会/}).click();
  await expect(page.getByText('测试成员',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:copy.participantsExpand,exact:true}).click();
  await expect(page.getByText('测试成员',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:copy.participantsCollapse,exact:true}).click();
  await expect(page.getByText('测试成员',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:copy.participantsExpand,exact:true}).click();
  await page.getByRole('button',{name:copy.leave,exact:true}).click();
  await expect(page.getByText(copy.leaveConfirm,{exact:true})).toBeVisible();
  await expect(page.getByText('测试成员',{exact:true})).toHaveCount(0);
});

test('rule create and edit reveal the form below a long rule directory', async ({ page }) => {
  await setup(page);
  const rules = Array.from({ length: 18 }, (_, index) => ({ id: 'rule-' + index, version: 1, name: 'Rule ' + index, enabled: true, audience: [{ type: 'people', personIds: ['p'] }], targets: [{ type: 'self' }], actions: ['assign'] }));
  await page.route('**/api/getCalendarRules', route => route.fulfill({ json: { status: 'success', people: [], departments: [], identities: [], workGroups: [], rules } }));
  await page.goto('/web/calendar');
  await page.getByRole('button', { name: copy.ruleManage, exact: true }).click();
  await page.getByRole('button', { name: copy.createRule, exact: true }).click();
  await expect(page.getByLabel(copy.ruleName, { exact: true })).toBeInViewport();
  await page.getByRole('button', { name: copy.cancel, exact: true }).click();
  await page.getByRole('button', { name: copy.edit, exact: true }).first().click();
  await expect(page.getByLabel(copy.ruleName, { exact: true })).toBeInViewport();
  await expect(page.getByLabel(copy.ruleName, { exact: true })).toHaveValue('Rule 0');
});

test('readable calendar rules show only the granted edit and delete actions', async ({ page }) => {
  await setup(page);
  const base = { version: 1, enabled: true, audience: [{ type: 'people', personIds: ['p'] }],
    targets: [{ type: 'self' }], actions: ['assign'] };
  const readOnly = { ...base, id: 'read-only', name: 'Read only rule', canUpdate: false, canDelete: false };
  const editable = { ...base, id: 'editable', name: 'Editable rule', canUpdate: true, canDelete: true };
  await page.route('**/api/getCalendarRules', route => route.fulfill({ json: {
    status: 'success', canCreate: false, people: [], departments: [], identities: [], workGroups: [], rules: [readOnly, editable]
  } }));
  const writes = [];
  await page.route('**/api/saveCalendarRule', route => {
    const value = route.request().postDataJSON();
    writes.push(value);
    editable.name = value.name;
    return route.fulfill({ json: { status: 'success' } });
  });
  await page.goto('/web/calendar');
  await page.getByRole('button', { name: copy.ruleManage, exact: true }).click();
  const readOnlyCard = page.locator('article').filter({ hasText: readOnly.name });
  const editCard = page.locator('article').filter({ hasText: editable.name });
  await expect(readOnlyCard).toBeVisible();
  await expect(readOnlyCard.getByRole('button')).toHaveCount(0);
  await expect(readOnlyCard.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: copy.createRule, exact: true })).toHaveCount(0);
  await expect(editCard.getByRole('button', { name: copy.duplicate, exact: true })).toHaveCount(0);
  await editCard.getByRole('button', { name: copy.edit, exact: true }).click();
  await page.getByLabel(copy.ruleName, { exact: true }).fill('Updated rule');
  await page.getByRole('button', { name: copy.save, exact: true }).click();
  await expect(page.getByText('Updated rule', { exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ id: 'editable', version: 1, name: 'Updated rule' });
});

test('安排规则复制后编辑保存，批量删除取消不发请求',async({page})=>{
  await setup(page);const writes=[];
  const rule={id:'rule',version:1,name:'办公室安排',enabled:true,audience:[{type:'people',personIds:['p']}],targets:[{type:'self'}],actions:['assign']};
  const config={status:'success',permissions:{manage:true,rules:true},timezoneOffset:480,people:[{personId:'p',name:'测试成员',assignments:[]}],departments:[],identities:[],workGroups:[],rules:[rule]};
  await page.route('**/api/getCalendarRules',r=>r.fulfill({json:config}));
  await page.route('**/api/saveCalendarRule',async r=>{const body=r.request().postDataJSON();writes.push(body);config.rules.push({...body,id:'copy',version:1});await r.fulfill({json:{status:'success'}});});
  await page.route('**/api/batchCalendarRules',async r=>{writes.push(r.request().postDataJSON());await r.fulfill({json:{status:'success'}});});
  await page.goto('/web/calendar');await page.getByRole('button',{name:copy.ruleManage,exact:true}).click();
  await page.getByRole('button',{name:copy.duplicate,exact:true}).click();
  await page.getByLabel(copy.ruleName,{exact:true}).fill('复制后的安排');
  await page.getByRole('button',{name:copy.save,exact:true}).click();
  await expect(page.getByText('复制后的安排',{exact:true})).toBeVisible();
  expect(writes[0].id).toBeUndefined();expect(writes[0].audience[0].personIds).toEqual(['p']);
  await page.getByRole('checkbox',{name:/办公室安排/}).check();
  await expect(page.getByText('已选 1 项',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:copy.delete,exact:true}).click();
  await expect(page.getByText(copy.deleteRuleConfirm,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:copy.cancel,exact:true}).click();expect(writes).toHaveLength(1);
});

test('calendar primary tabs and inline editor preserve the browsing state',async({page})=>{
  const calls=await setup(page);
  await page.goto('/web/calendar?date=2026-11-02');
  await page.locator('.calendar-view-tabs').getByRole('button',{name:copy.list,exact:true}).click();
  await page.getByPlaceholder(copy.search).fill('saved filter');
  const before=await page.evaluate(()=>history.length);
  for(const label of [copy.systemCalendar,copy.ruleManage,copy.title]){
    await page.locator('.calendar-primary-tabs').getByRole('button',{name:label,exact:true}).click();
    await expect(page).toHaveURL(/\/calendar\?date=2026-11-02$/);
  }
  await expect(page.getByPlaceholder(copy.search)).toHaveValue('saved filter');
  await expect(page.locator('.calendar-view-tabs .tab-active')).toHaveText(copy.list);
  await page.getByRole('button',{name:copy.create,exact:true}).click();
  await expect(page.locator('.calendar-primary-tabs button:disabled')).toHaveCount(3);
  await page.getByLabel(copy.name,{exact:true}).fill('Inline saved event');
  await page.getByRole('button',{name:copy.save,exact:true}).click();
  await expect(page.locator('.calendar-editor')).toHaveCount(0);
  expect(calls.find(item=>item.name==='saveCalendarEvent').body.title).toBe('Inline saved event');
  await expect(page.getByPlaceholder(copy.search)).toHaveValue('saved filter');
  expect(await page.evaluate(()=>history.length)).toBe(before);
  await page.getByRole('button',{name:copy.create,exact:true}).click();
  await page.getByRole('button',{name:copy.cancel,exact:true}).click();
  await expect(page.locator('.calendar-editor')).toHaveCount(0);
});

test('calendar failed inline editor remains cancellable and copied rules open once',async({page})=>{
  await setup(page);
  const rule={id:'copied-rule',name:'Copied rule',version:1,enabled:true,audience:[{type:'people',personIds:[]}],targets:[{type:'self'}],actions:['assign']};
  await page.route('**/api/getCalendarRules',route=>route.fulfill({json:{status:'success',canCreate:true,rules:[rule],people:[],departments:[],identities:[],workGroups:[]}}));
  await page.goto('/web/calendar?copyKind=calendar.rules&copyId=copied-rule');
  await expect(page.getByLabel(copy.ruleName,{exact:true})).toHaveValue('Copied rule');
  await expect(page).not.toHaveURL(/copyId=/);
  await expect(page.locator('.calendar-primary-tabs button:disabled')).toHaveCount(3);
  await page.getByRole('button',{name:copy.cancel,exact:true}).click();
  await page.locator('.calendar-primary-tabs').getByRole('button',{name:copy.systemCalendar,exact:true}).click();
  await page.locator('.calendar-primary-tabs').getByRole('button',{name:copy.ruleManage,exact:true}).click();
  await expect(page.getByLabel(copy.ruleName,{exact:true})).toHaveCount(0);
  await page.locator('.calendar-primary-tabs').getByRole('button',{name:copy.title,exact:true}).click();
  await page.route('**/api/getCalendarConfiguration',route=>route.fulfill({json:{status:'error'}}));
  await page.getByRole('button',{name:copy.create,exact:true}).click();
  await expect(page.locator('.calendar-editor').getByRole('button',{name:copy.retry,exact:true})).toBeVisible();
  await page.locator('.calendar-editor').getByRole('button',{name:copy.cancel,exact:true}).click();
  await expect(page.locator('.calendar-editor')).toHaveCount(0);
  await expect(page.locator('.calendar-primary-tabs button:disabled')).toHaveCount(0);
});


test('calendar participation confirmation keeps errors visible and freezes its target',async({page},testInfo)=>{
  await setup(page);
  const item={id:'confirmation-meeting',version:7,occurrenceDate:'2026-11-14',title:'Confirmation target',startAt:'2026-11-14T01:00:00Z',endAt:'2026-11-14T02:00:00Z',sourceKind:'manual',visibility:'organization',attending:true,canUpdate:true,canCancel:true,participants:[]};
  let removed=false;
  await page.route('**/api/getCalendar',route=>route.fulfill({json:{status:'success',items:removed?[]:[item]}}));
  const writes=[];
  let release;
  await page.route('**/api/changeCalendarParticipation',async route=>{
    writes.push(route.request().postDataJSON());
    await new Promise(resolve=>{release=resolve;});
    if(writes.length===1)await route.fulfill({json:{status:'error'}});
    else{removed=true;await route.fulfill({json:{status:'success'}});}
  });
  await page.goto('/web/calendar?date=2026-11-14');
  await page.getByRole('button',{name:/Confirmation target/}).click();
  await page.getByRole('button',{name:copy.leave,exact:true}).click();
  let dialog=page.getByRole('dialog',{name:copy.leave,exact:true});
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(dialog.locator('.dialog-body > .stack')).toBeVisible();
  await expect(dialog.getByText(copy.scope,{exact:true})).toBeVisible();
  await dialog.getByLabel(copy.scope,{exact:true}).selectOption('following');
  await dialog.getByRole('button',{name:copy.confirmLeave,exact:true}).click();
  await expect.poll(()=>writes.length).toBe(1);
  await expect(dialog.getByLabel(copy.scope,{exact:true})).toBeDisabled();
  await expect(dialog.getByRole('button',{name:copy.cancel,exact:true})).toBeDisabled();
  await expect(dialog.getByRole('button',{name:copy.confirmLeave,exact:true})).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  expect(writes[0]).toMatchObject({id:item.id,version:7,occurrenceDate:'2026-11-14',scope:'following',action:'leave'});
  release();
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByRole('button',{name:copy.cancel,exact:true})).toBeEnabled();
  await expect(dialog.getByRole('alert')).toBeInViewport();
  await page.screenshot({path:testInfo.outputPath('calendar-confirmation-failure.png')});
  await dialog.getByRole('button',{name:copy.cancel,exact:true}).click();
  dialog=page.getByRole('dialog',{name:item.title,exact:true});
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  expect(writes).toHaveLength(1);
  await dialog.getByRole('button',{name:copy.cancelEvent,exact:true}).click();
  dialog=page.getByRole('dialog',{name:copy.cancelEvent,exact:true});
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByRole('button',{name:copy.confirmedCancel,exact:true}).click();
  await expect.poll(()=>writes.length).toBe(2);
  expect(writes[1]).toMatchObject({id:item.id,version:7,occurrenceDate:'2026-11-14',scope:'instance',action:'cancel'});
  release();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button',{name:/Confirmation target/})).toHaveCount(0);
});


test('calendar date markers keep equal rows and event cards keep readable hierarchy',async({page},testInfo)=>{
  await setup(page);
  const event=(id,date,title,sourceKind='manual',allDay=false)=>({id,version:1,occurrenceDate:date,title,sourceKind,allDay,location:'Meeting room with a long location description',startAt:allDay?date+'T00:00:00+08:00':date+'T01:00:00Z',endAt:allDay?new Date(Date.parse(date+'T00:00:00+08:00')+86400000).toISOString():date+'T02:00:00Z'});
  const items=[event('one','2026-11-02','Short title'),event('long','2026-11-03','A longer calendar event title that wraps naturally across several lines without hiding its full meaning'),event('other','2026-11-03','Other source','venue_activity'),event('all-day','2026-11-03','All day event','manual',true)];
  let fail=false;
  await page.route('**/api/getCalendar',route=>route.fulfill({json:fail?{status:'error'}:{status:'success',items}}));
  await page.goto('/web/calendar?date=2026-11-03');
  const label=(date,count)=>copy.calendarDayLabel.replace('{date}',date).replace('{count}',String(count));
  await expect(page.getByRole('button',{name:label('2026-11-01',0),exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:label('2026-11-02',1),exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:label('2026-11-03',3),exact:true})).toBeVisible();
  await expect(page.locator('.calendar-count')).toHaveText(copy.scheduleCount.replace('{count}','3'));
  const boxes=await page.locator('.calendar-date').evaluateAll(nodes=>nodes.map(node=>({height:node.getBoundingClientRect().height,text:node.textContent.trim(),marker:node.querySelector('.calendar-marker-row').getBoundingClientRect().height})));
  expect(Math.max(...boxes.map(box=>box.height))-Math.min(...boxes.map(box=>box.height))).toBeLessThan(1);
  expect(Math.max(...boxes.map(box=>box.marker))-Math.min(...boxes.map(box=>box.marker))).toBeLessThan(1);
  expect(boxes.every(box=>/^\d{1,2}$/.test(box.text))).toBe(true);
  const heading=await page.locator('.calendar-heading').evaluate(node=>{
    const title=node.querySelector('h2'),button=node.querySelector('button'),box=node.getBoundingClientRect();
    return {titleHeight:title.getBoundingClientRect().height,titleLine:parseFloat(getComputedStyle(title).lineHeight),buttonWidth:button.getBoundingClientRect().width,width:box.width};
  });
  expect(heading.titleHeight).toBeLessThan(heading.titleLine*1.5);
  expect(heading.buttonWidth).toBeLessThan(heading.width/2);
  const inspectCards=async()=>{
    const rows=await page.locator('.calendar-event').evaluateAll(nodes=>nodes.map(node=>{
      const title=node.querySelector('.calendar-event-title'),meta=node.querySelector('.calendar-event-meta'),chip=node.querySelector('.chip');
      return {width:node.clientWidth,overflow:node.scrollWidth-node.clientWidth,titleSize:parseFloat(getComputedStyle(title).fontSize),metaSize:parseFloat(getComputedStyle(meta).fontSize),chipWidth:chip.getBoundingClientRect().width,titleY:title.getBoundingClientRect().top,metaY:meta.getBoundingClientRect().top};
    }));
    expect(rows.length).toBeGreaterThan(0);
    for(const row of rows){expect(row.overflow).toBeLessThanOrEqual(1);expect(row.titleSize).toBeGreaterThan(row.metaSize);expect(row.chipWidth).toBeLessThan(row.width);expect(row.metaY).toBeGreaterThan(row.titleY);}
  };
  await inspectCards();
  await page.locator('.calendar-grid').scrollIntoViewIfNeeded();
  await page.screenshot({path:testInfo.outputPath('calendar-month-cards.png'),fullPage:true});
  await page.getByLabel(copy.source,{exact:true}).selectOption('manual');
  await expect(page.getByRole('button',{name:label('2026-11-03',2),exact:true})).toBeVisible();
  await page.getByPlaceholder(copy.search).fill('longer');
  await expect(page.getByRole('button',{name:label('2026-11-03',1),exact:true})).toBeVisible();
  await expect(page.locator('.calendar-count')).toHaveText(copy.scheduleCount.replace('{count}','1'));
  await page.getByPlaceholder(copy.search).fill('');
  for(const mode of ['day','week','list']){
    await page.locator('.calendar-view-tabs').getByRole('button',{name:copy[mode],exact:true}).click();
    await expect(page.locator('.calendar-event').first()).toBeVisible();
    await inspectCards();
  }
  fail=true;
  await page.locator('.calendar-view-tabs').getByRole('button',{name:copy.month,exact:true}).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.calendar-count')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'2026-11-03',exact:true})).toBeVisible();
});


test('calendar viewing range adds readable events without edit powers and resets on revoked access',async({page},testInfo)=>{
  await setup(page);
  let canReadAll=true,includeExtra=true,holdDefault=false,release;
  const own={id:'own',version:1,occurrenceDate:'2026-11-03',title:'My participating event',sourceKind:'manual',startAt:'2026-11-03T01:00:00Z',endAt:'2026-11-03T02:00:00Z',attending:true,canUpdate:false,canCancel:false,visibility:'organization',participants:[]};
  const extra={...own,id:'readable',title:'Additional read only event',attending:false};
  const calls=[];
  await page.route('**/api/getCalendarConfiguration',route=>route.fulfill({json:{status:'success',permissions:{manage:canReadAll,rules:false},timezoneOffset:480}}));
  await page.route('**/api/getCalendar',async route=>{
    const body=route.request().postDataJSON();calls.push(body);
    if(holdDefault&&!body.managed)await new Promise(resolve=>{release=resolve;});
    await route.fulfill({json:{status:'success',items:body.managed&&includeExtra?[own,extra]:[own]}});
  });
  await page.goto('/web/calendar?date=2026-11-03');
  const scope=page.getByLabel(copy.viewingRange,{exact:true});
  await expect(scope).toHaveValue('false');
  await expect(page.getByRole('button',{name:/My participating event/})).toBeVisible();
  await expect(page.getByRole('button',{name:/Additional read only event/})).toHaveCount(0);
  await scope.selectOption({label:copy.readableScheduleScope});
  await expect(page.getByRole('button',{name:/Additional read only event/})).toBeVisible();
  expect(calls.at(-1).managed).toBe(true);
  await expect(page.getByRole('button',{name:/My participating event/})).toBeVisible();
  await page.locator('.calendar-filters').scrollIntoViewIfNeeded();
  await page.screenshot({path:testInfo.outputPath('calendar-viewing-range.png')});
  await page.getByRole('button',{name:/Additional read only event/}).click();
  const dialog=page.getByRole('dialog',{name:extra.title,exact:true});
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button',{name:copy.edit,exact:true})).toHaveCount(0);
  await expect(dialog.getByRole('button',{name:copy.cancelEvent,exact:true})).toHaveCount(0);
  await expect(dialog.getByRole('button',{name:copy.leave,exact:true})).toHaveCount(0);
  await dialog.locator('.dialog-footer').getByRole('button',{name:copy.close,exact:true}).click();
  includeExtra=false;
  await scope.selectOption({label:copy.ownScheduleScope});
  await expect(scope).toBeEnabled();
  await scope.selectOption({label:copy.readableScheduleScope});
  await expect(scope).toBeEnabled();
  await expect(page.locator('.calendar-event')).toHaveCount(1);
  includeExtra=true;
  await scope.selectOption({label:copy.ownScheduleScope});
  await expect(scope).toBeEnabled();
  await scope.selectOption({label:copy.readableScheduleScope});
  await expect(page.getByRole('button',{name:/Additional read only event/})).toBeVisible();
  const previousCalls=calls.length;
  canReadAll=false;holdDefault=true;
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await expect(scope).toHaveCount(0);
  await expect(page.locator('.calendar-event')).toHaveCount(0);
  await expect.poll(()=>calls.length).toBeGreaterThan(previousCalls);
  expect(calls.slice(previousCalls).every(call=>call.managed===false)).toBe(true);
  holdDefault=false;release();
  await expect(page.getByRole('button',{name:/My participating event/})).toBeVisible();
  await expect(page.getByRole('button',{name:/Additional read only event/})).toHaveCount(0);
});


test('calendar source editor cannot submit read only participant settings and can retry read errors',async({page},testInfo)=>{
  await setup(page);
  const reads=[],writes=[];
  let fail=false;
  await page.route('**/api/getCalendarParticipants',route=>{
    reads.push(route.request().postDataJSON());
    return route.fulfill({json:fail?{status:'error'}:{status:'success',canEdit:false,version:3,targets:[],participants:[]}});
  });
  await page.route('**/api/saveCalendarParticipants',route=>{writes.push(route.request().postDataJSON());return route.fulfill({json:{status:'success'}});});
  await page.goto('/web/calendar/edit?sourceKind=venue_activity&sourceId=activity');
  const editor=page.locator('.calendar-editor');
  await expect(editor.getByRole('status')).toHaveText(copy.participantSettingsReadOnly);
  await expect(editor.locator('form')).toHaveCount(0);
  await expect(editor.getByRole('button',{name:copy.save,exact:true})).toHaveCount(0);
  expect(reads[0]).toEqual({sourceKind:'venue_activity',sourceId:'activity',edit:true});
  await page.keyboard.press('Enter');
  expect(writes).toHaveLength(0);
  await page.screenshot({path:testInfo.outputPath('calendar-source-readonly.png')});
  await editor.getByRole('button',{name:copy.cancel,exact:true}).click();
  await expect(page).toHaveURL(/\/web\/calendar$/);
  fail=true;
  await page.goto('/web/calendar/edit?sourceKind=venue_activity&sourceId=activity');
  await expect(editor.getByRole('alert')).toBeVisible();
  await expect(editor.getByRole('status')).toHaveCount(0);
  await expect(editor.locator('form')).toHaveCount(0);
  fail=false;
  await editor.getByRole('button',{name:copy.retry,exact:true}).click();
  await expect(editor.getByRole('status')).toHaveText(copy.participantSettingsReadOnly);
  await expect(editor.getByRole('button',{name:copy.save,exact:true})).toHaveCount(0);
  await editor.getByRole('button',{name:copy.cancel,exact:true}).click();
  await expect(page).toHaveURL(/\/web\/calendar$/);
  expect(writes).toHaveLength(0);
});


test('calendar detail keeps leave and close aligned in the final action row',async({page},testInfo)=>{
  await setup(page);
  const item={id:'aligned-actions',version:1,occurrenceDate:'2026-11-03',title:'Aligned detail actions',sourceKind:'manual',startAt:'2026-11-03T01:00:00Z',endAt:'2026-11-03T02:00:00Z',visibility:'organization',attending:true,canUpdate:true,canCancel:true,participants:[]};
  await page.route('**/api/getCalendar',route=>route.fulfill({json:{status:'success',items:[item]}}));
  await page.goto('/web/calendar?date=2026-11-03');
  for(const [canUpdate,canCancel] of [[true,true],[true,false],[false,true],[false,false]]){
    Object.assign(item,{canUpdate,canCancel});
    await page.getByRole('button',{name:/Aligned detail actions/}).click();
    const dialog=page.getByRole('dialog',{name:item.title,exact:true});
    const footer=dialog.locator('.calendar-detail-footer');
    const rows=footer.locator('.calendar-detail-actions');
    const last=rows.last();
    await expect(last.getByRole('button')).toHaveText([copy.leave,copy.close]);
    await expect(dialog.locator('.dialog-body').getByRole('button',{name:copy.leave,exact:true})).toHaveCount(0);
    const geometry=await rows.evaluateAll(nodes=>nodes.map(node=>({width:node.getBoundingClientRect().width,buttons:[...node.querySelectorAll('button')].map(button=>{const rect=button.getBoundingClientRect();return {x:rect.x,y:rect.y,width:rect.width,height:rect.height,bottom:rect.bottom,minHeight:parseFloat(getComputedStyle(button).minHeight),viewport:innerHeight};})})));
    for(const row of geometry){
      expect(row.buttons.length).toBeLessThanOrEqual(2);
      for(const button of row.buttons){expect(button.height).toBeGreaterThanOrEqual(button.minHeight);expect(button.bottom).toBeLessThanOrEqual(button.viewport+1);}
      if(row.buttons.length===2){expect(Math.abs(row.buttons[0].y-row.buttons[1].y)).toBeLessThan(1);expect(Math.abs(row.buttons[0].height-row.buttons[1].height)).toBeLessThan(1);}
      else expect(Math.abs(row.buttons[0].width-row.width)).toBeLessThan(1);
    }
    if(canUpdate===canCancel)await page.screenshot({path:testInfo.outputPath(`calendar-detail-actions-${canUpdate?'all':'participation'}.png`)});
    await last.getByRole('button',{name:copy.leave,exact:true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await page.getByRole('dialog',{name:copy.leave,exact:true}).getByRole('button',{name:copy.cancel,exact:true}).click();
    await dialog.locator('.calendar-detail-footer').getByRole('button',{name:copy.close,exact:true}).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});


test('calendar uses a shared read only person table without merging names or clipping long roles',async({page},testInfo)=>{
  await setup(page);
  const people=[{name:'Same name',personReference:'first',positions:[{identityCategory:'Member',department:'Department A',workGroup:'Group A'},{identityCategory:'Second role',department:'An unusually long department name that must wrap without hiding its ending',workGroup:'Coordination work group'}]},{name:'Same name',personReference:'second',positions:[]},...Array.from({length:28},(_,index)=>({name:'Participant '+index,positions:[{identityCategory:'Member',department:'Department '+index,workGroup:'Group '+index}]}))];
  people[2].positionNotice='Historical role not verified';people[2].positions=[{label:'Do not show inferred role'}];
  people[3].positions=[{label:'Original work role display'}];
  const item={id:'roster-event',version:1,occurrenceDate:'2026-11-03',title:'Shared roster',sourceKind:'manual',startAt:'2026-11-03T01:00:00Z',endAt:'2026-11-03T02:00:00Z',visibility:'organization',attending:true,participants:people};
  await page.route('**/api/getCalendar',route=>route.fulfill({json:{status:'success',items:[item]}}));
  await page.route('**/api/resolvePersonLinks',route=>route.fulfill({json:{status:'success',links:[{ref:'reference:first',target:{kind:'contact',key:'contact-first'}}]}}));
  await page.goto('/web/calendar?date=2026-11-03');
  await page.getByRole('button',{name:/Shared roster/}).click();
  const dialog=page.getByRole('dialog',{name:item.title,exact:true});
  await expect(dialog.locator('.calendar-detail-body > p')).toHaveCount(0);
  await dialog.getByRole('button',{name:copy.participantsExpand,exact:true}).click();
  const table=dialog.locator('.readonly-person-table');
  await expect(table.getByRole('columnheader')).toHaveText([homeCopy.text.name,homeCopy.text.regularPosition]);
  await expect(table.locator('tbody tr')).toHaveCount(30);
  await expect(table.getByText('Historical role not verified',{exact:true})).toHaveCount(1);
  await expect(table.getByText('Do not show inferred role',{exact:true})).toHaveCount(0);
  await expect(table.getByText('Original work role display',{exact:true})).toHaveCount(1);
  await expect(table.getByText('Same name',{exact:true})).toHaveCount(2);
  await expect(table.locator('tbody tr').first().locator('.readonly-person-position')).toHaveCount(2);
  await expect(table.getByRole('link',{name:'Same name',exact:true})).toHaveAttribute('href',/contact-first/);
  await expect(table.getByText(copy.noPosition,{exact:true})).toBeVisible();
  const geometry=await table.evaluate(node=>{const tableBox=node.getBoundingClientRect(),nameBox=node.querySelector('th').getBoundingClientRect();return {width:tableBox.width,nameWidth:nameBox.width,overflow:node.scrollWidth-node.clientWidth,scroll:getComputedStyle(node).overflowY};});
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect(geometry.scroll).not.toBe('auto');
  if(page.viewportSize().width<520)expect(Math.abs(geometry.nameWidth/geometry.width-0.28)).toBeLessThan(0.02);
  else expect(geometry.nameWidth).toBeGreaterThanOrEqual(110);
  await page.screenshot({path:testInfo.outputPath('calendar-readonly-table-top.png')});
  await table.getByText('Participant 27',{exact:true}).scrollIntoViewIfNeeded();
  await expect(table.getByText('Participant 27',{exact:true})).toBeInViewport();
  const footer=dialog.locator('.calendar-detail-footer');
  await expect(footer.getByRole('button',{name:copy.close,exact:true})).toBeInViewport();
  await page.screenshot({path:testInfo.outputPath('calendar-readonly-table-bottom.png')});
  await footer.getByRole('button',{name:copy.close,exact:true}).click();
  item.participants=[];
  await page.getByRole('button',{name:/Shared roster/}).click();
  await expect(dialog.getByText(copy.noParticipants,{exact:true})).toBeVisible();
  await expect(dialog.locator('table')).toHaveCount(0);
});


test('calendar list clears the previous month when loading the new month fails',async({page})=>{
  await setup(page);
  await page.route('**/api/getCalendar',route=>route.fulfill({json:route.request().postDataJSON().start==='2026-12-01'
    ? {status:'error'} : {status:'success',items:[{id:'old-month',occurrenceDate:'2026-11-27',title:'November only',sourceKind:'manual',startAt:'2026-11-27T01:00:00Z',endAt:'2026-11-27T02:00:00Z'}]}}));
  await page.goto('/web/calendar?date=2026-11-27');
  await page.getByRole('button',{name:copy.list,exact:true}).click();
  await expect(page.getByRole('button',{name:/November only/})).toBeVisible();
  await page.getByRole('button',{name:copy.next,exact:true}).click();
  await expect(page.locator('.calendar-results-heading')).toContainText('2026-12');
  await expect(page.getByRole('button',{name:copy.retry,exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/November only/})).toHaveCount(0);
});

for (const saveScope of ['instance','following','series']) test('calendar scope drafts preserve unsaved fields and save only '+saveScope,async({page})=>{
  await setup(page);
  const recurrence={frequency:'daily',interval:1,weekdays:[],count:30};
  const item={id:'scope-event',version:4,occurrenceDate:'2026-11-14',visibility:'private',targets:[{type:'self'}],canUpdate:true,sourceKind:'manual',
    title:'Occurrence title',startAt:'2026-11-15T03:30:00.000Z',endAt:'2026-11-15T04:30:00.000Z',allDay:false,
    form:{title:'Occurrence title',location:'Occurrence room',description:'Occurrence detail',allDay:false,startDate:'2026-11-01',endDate:'2026-11-01',startTime:'09:00',endTime:'10:00',recurrence,reminders:[5]},
    seriesForm:{title:'Series title',location:'Series room',description:'Series detail',allDay:false,startDate:'2026-11-01',endDate:'2026-11-01',startTime:'09:00',endTime:'10:00',recurrence,reminders:[60]}};
  await page.route('**/api/getCalendar',route=>route.fulfill({json:{status:'success',items:[item]}}));
  let saved;
  await page.route('**/api/saveCalendarEvent',route=>{saved=route.request().postDataJSON();return route.fulfill({json:{status:'success',id:item.id,version:5}});});
  await page.goto('/web/calendar/edit?id=scope-event&date=2026-11-14');
  const scope=page.getByRole('combobox',{name:copy.scope,exact:true}),name=page.getByLabel(copy.name,{exact:true});
  await expect(name).toHaveValue('Occurrence title');
  await expect(page.getByLabel(copy.startDate,{exact:true})).toHaveValue('2026-11-15');
  await expect(page.getByLabel(copy.startTime,{exact:true})).toHaveValue('11:30');
  await name.fill('Unsaved occurrence');
  await page.getByLabel(copy.startTime,{exact:true}).fill('13:00');
  await page.getByLabel(copy.endTime,{exact:true}).fill('14:00');
  await page.getByLabel(copy.reminders,{exact:true}).selectOption('30');
  await scope.selectOption('series');
  await expect(name).toHaveValue('Series title');
  await expect(page.getByLabel(copy.startDate,{exact:true})).toHaveValue('2026-11-01');
  await expect(page.getByLabel(copy.startTime,{exact:true})).toHaveValue('09:00');
  await expect(page.getByLabel(copy.reminders,{exact:true})).toHaveValue('60');
  await name.fill('Unsaved series');
  await page.getByLabel(copy.allDay,{exact:true}).check();
  await page.getByRole('combobox',{name:copy.recurrence,exact:true}).selectOption('weekly');
  await page.getByLabel(copy.weekdays[0],{exact:true}).check();
  await page.getByLabel(copy.repeatEnd,{exact:true}).selectOption('none');
  await page.getByLabel(copy.reminders,{exact:true}).selectOption('1440');
  await scope.selectOption('following');
  await expect(name).toHaveValue('Unsaved occurrence');
  await expect(page.getByLabel(copy.startDate,{exact:true})).toHaveValue('2026-11-15');
  await expect(page.getByLabel(copy.startTime,{exact:true})).toHaveValue('13:00');
  await expect(page.getByLabel(copy.allDay,{exact:true})).not.toBeChecked();
  await expect(page.getByRole('combobox',{name:copy.recurrence,exact:true})).toHaveValue('daily');
  await expect(page.getByRole('combobox',{name:copy.recurrence,exact:true})).toBeDisabled();
  await expect(page.getByLabel(copy.repeatEnd,{exact:true})).toHaveValue('count');
  await expect(page.getByLabel(copy.reminders,{exact:true})).toHaveValue('30');
  await scope.selectOption('instance');
  await expect(name).toHaveValue('Unsaved occurrence');
  await scope.selectOption('series');
  await expect(name).toHaveValue('Unsaved series');
  await expect(page.getByLabel(copy.allDay,{exact:true})).toBeChecked();
  await expect(page.getByRole('combobox',{name:copy.recurrence,exact:true})).toHaveValue('weekly');
  await expect(page.getByLabel(copy.repeatEnd,{exact:true})).toHaveValue('none');
  await expect(page.getByLabel(copy.reminders,{exact:true})).toHaveValue('1440');
  await scope.selectOption(saveScope);
  await page.getByRole('button',{name:copy.save,exact:true}).click();
  await expect(page.locator('.calendar-editor')).toHaveCount(0);
  expect(saved).toMatchObject({id:item.id,version:4,occurrenceDate:'2026-11-14',scope:saveScope,targets:[{type:'self'}]});
  if(saveScope==='series'){
    expect(saved).toMatchObject({title:'Unsaved series',startDate:'2026-11-01',endDate:'2026-11-02',allDay:true,reminders:[1440],recurrence:{frequency:'weekly',weekdays:[1]}});
    expect(saved.recurrence.count).toBeUndefined();
  }else{
    expect(saved).toMatchObject({title:'Unsaved occurrence',startDate:'2026-11-15',startTime:'13:00',endTime:'14:00',allDay:false,reminders:[30],recurrence});
  }
  await page.goto('/web/calendar/edit?id=scope-event&date=2026-11-14');
  await expect(name).toHaveValue('Occurrence title');
  await expect(page.getByLabel(copy.startTime,{exact:true})).toHaveValue('11:30');
  await scope.selectOption('series');
  await expect(name).toHaveValue('Series title');
  await expect(page.getByLabel(copy.allDay,{exact:true})).not.toBeChecked();
  await expect(page.getByLabel(copy.reminders,{exact:true})).toHaveValue('60');
});
