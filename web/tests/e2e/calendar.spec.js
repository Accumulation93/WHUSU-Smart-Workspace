import {test,expect} from '@playwright/test';
import {mockApi} from './fixtures.js';
import copy from '../../src/locales/zh-CN/shared/calendar.js';

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
  const actions=await page.locator('.calendar-actions > button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {text:n.textContent,x:r.x,y:r.y,width:r.width,height:r.height};}));
  expect(actions[0].text).toBe(copy.create);expect(actions[1].text).toBe(copy.systemCalendar);
  expect(Math.abs(actions[0].y-actions[1].y)).toBeLessThan(1);
  expect(Math.abs(actions[0].width-actions[1].width)).toBeLessThan(1);
  expect(Math.abs(actions[0].height-actions[1].height)).toBeLessThan(1);
  expect(actions[2].width).toBeGreaterThan(actions[0].width*1.9);
  const controls=await page.locator('.calendar-navigation').evaluate(element=>Array.from(element.children).map(child=>child.getBoundingClientRect().top));
  expect(Math.max(...controls.slice(0,3))-Math.min(...controls.slice(0,3))).toBeLessThan(2);
  if(page.viewportSize().width<520)expect(controls[3]).toBeGreaterThan(controls[0]);
  else expect(Math.max(...controls)-Math.min(...controls)).toBeLessThan(2);
  const search=await page.locator('.search-field').evaluate(element=>{const icon=element.querySelector('svg,img'),input=element.querySelector('input');return icon ? Math.abs((icon.getBoundingClientRect().top+icon.getBoundingClientRect().height/2)-(input.getBoundingClientRect().top+input.getBoundingClientRect().height/2)) : 999;});
  expect(search).toBeLessThan(2);
  for(const mode of ['month','week','day','list']){
    await page.locator('.tabs').getByRole('button',{name:copy[mode],exact:true}).click();
    await expect(page.locator('.tabs .tab-active')).toHaveText(copy[mode]);
  }
  await expect(page.getByText(copy.empty,{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  expect(errors).toEqual([]);
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
  await expect(page.getByText('测试成员',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:copy.leave,exact:true}).click();
  await expect(page.getByText(copy.leaveConfirm,{exact:true})).toBeVisible();
  await expect(page.getByText('测试成员',{exact:true})).toHaveCount(0);
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
  await page.getByRole('button',{name:copy.delete+' · 1',exact:true}).click();
  await expect(page.getByText(copy.deleteRuleConfirm,{exact:true})).toBeVisible();
  await page.getByRole('button',{name:copy.cancel,exact:true}).click();expect(writes).toHaveLength(1);
});
