import { expect, test } from '@playwright/test';
import { mockApi, CURRENT_CONTEXT } from './fixtures.js';
import copy from '../../src/locales/zh-CN/shared/identityCard.js';
import { createRequire } from 'node:module';
const verificationImage = await createRequire(import.meta.url)('../../../server/node_modules/qrcode').toDataURL('https://accumulation93.com/web/identity-card/verify?token=' + 'a'.repeat(32), {width:1024,margin:4,errorCorrectionLevel:'H',color:{dark:'#000000ff',light:'#ffffff00'}});
const card = {name:'Identity Example',organization:'Example organization',position:'Member · Department',state:copy.active,
  stateCode:'active',positionFacts:{assignmentLabel:'Member · Department',role:'user',hasAssignment:true}};
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jU1sAAAAASUVORK5CYII=';
test('hero opens identity card while work-role button keeps its action', async ({page}, info) => {
  await mockApi(page);
  await page.route('**/api/getMyIdentityCard',r=>r.fulfill({json:{status:'success',valid:true,card}}));
  await page.route('**/api/createMyIdentityCardCode',r=>r.fulfill({json:{status:'success',valid:true,card,image,verificationImage}}));
  await page.goto('/web/portal');
  await page.locator('.workspace-context-card').click();
  await expect(page).toHaveURL(/work-role/);
  await page.goto('/web/portal');
  await page.locator('.workspace-app-name').click();
  await expect(page).toHaveURL(/identity-card$/);
  await expect(page.getByRole('img',{name:copy.scanHint})).toBeVisible();
  await expect(page.locator('.workspace-hero .workspace-person-name')).toHaveText(card.name);
  await expect(page.locator('.identity-header')).toHaveCount(0);
  await expect(page.locator('.identity-image')).toHaveAttribute('src',verificationImage);
  const scanBackground = await page.locator('.identity-image').evaluate(el=>getComputedStyle(el).backgroundImage);
  expect(scanBackground).toBe('none');
  expect(await page.locator('.identity-image').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  const pixels = createRequire(import.meta.url)('../../../server/node_modules/pngjs').PNG.sync.read(await page.locator('.identity-image').screenshot({animations:'disabled'}));
  const decoded = createRequire(import.meta.url)('../../../server/node_modules/jsqr')(new Uint8ClampedArray(pixels.data),pixels.width,pixels.height);
  expect(decoded?.data).toBe('https://accumulation93.com/web/identity-card/verify?token='+'a'.repeat(32));
  await page.getByRole('button',{name:copy.miniProgramCode,exact:true}).click();
  await expect(page.locator('.identity-image')).toHaveAttribute('src',image);
  expect(await page.locator('.identity-image').evaluate(el=>getComputedStyle(el).backgroundImage)).toBe(scanBackground);
  await page.getByRole('button',{name:copy.verificationCode,exact:true}).click();
  await expect(page.getByRole('button',{name:copy.originalImage,exact:true})).toBeVisible();
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.screenshot({path:info.outputPath('identity-card.png'),fullPage:true,animations:'disabled'});
  const geometry = await page.evaluate(() => ({hero:document.querySelector('.workspace-hero').getBoundingClientRect().bottom, body:document.querySelector('.identity-card').getBoundingClientRect().top, overflow:document.documentElement.scrollWidth > innerWidth}));
  expect(geometry.body - geometry.hero).toBeGreaterThanOrEqual(8);
  expect(geometry.overflow).toBe(false);
  await page.locator('.workspace-context-card').click();
  await expect(page).toHaveURL(/work-role/);
});
test('anonymous verification reads only code and renders invalid state after refresh', async ({page}, info) => {
  await mockApi(page,{authenticated:false});
  await page.route('**/api/auth/contexts',r=>r.fulfill({status:401,json:{status:'unauthorized'}}));
  let valid = true, reads = 0;
  await page.route('**/api/verifyIdentityCard',r=>{
    reads++; expect(r.request().postDataJSON()).toEqual({token:'a'.repeat(32)});
    return r.fulfill({json:{status:'success',valid,...(valid?{card,checkedAt:'2026-10-23T08:00:00.000Z'}:{})}});
  });
  await page.goto('/web/identity-card/verify?token='+'a'.repeat(32));
  await expect(page.locator('.identity-name')).toHaveText(card.name);
  await expect(page.getByText(copy.verified,{exact:true})).toBeVisible();
  await expect(page.locator('.identity-time:not(.identity-live-time) .identity-time-value')).toHaveText('2026-10-23 16:00:00');
  await expect(page.locator('.identity-image')).toHaveCount(0);
  await expect(page.locator('.workspace-context-card')).toHaveCount(0);
  await expect(page.locator('.workspace-hero')).toBeVisible();
  await expect(page.locator('.workspace-hero .workspace-person-name')).toHaveCount(0);
  await expect(page.getByRole('button',{name:copy.retry,exact:true})).toHaveCount(0);
  await page.screenshot({path:info.outputPath('identity-verification.png'),fullPage:true,animations:'disabled'});
  valid=false;
  await page.getByRole('button',{name:copy.refreshVerification,exact:true}).click();
  await expect(page.getByText(copy.verificationUnavailable,{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:copy.retry,exact:true})).toBeVisible();
  await expect(page.locator('.identity-name')).toHaveCount(0);
  expect(reads).toBe(2);
});

for (const activeContextId of ['ctx-assignment', 'ctx-admin']) {
  test(`verification keeps viewer hero separate from subject for ${activeContextId}`, async ({ page }) => {
    await mockApi(page, { activeContextId });
    await page.route('**/api/verifyIdentityCard', r => r.fulfill({ json: { status: 'success', valid: true, card, checkedAt: '2026-10-23T08:00:00.000Z' } }));
    await page.goto('/web/identity-card/verify?token=' + 'a'.repeat(32));
    await expect(page.locator('.workspace-person-name')).toHaveText(CURRENT_CONTEXT.name);
    await expect(page.locator('.identity-name')).toHaveText(card.name);
    await expect(page.locator('.workspace-hero')).not.toContainText(card.name);
    await expect(page.locator('.workspace-hero-admin')).toHaveCount(activeContextId === 'ctx-admin' ? 1 : 0);
    const gap = await page.evaluate(() => document.querySelector('.identity-card').getBoundingClientRect().top - document.querySelector('.workspace-hero').getBoundingClientRect().bottom);
    expect(gap).toBeGreaterThanOrEqual(8);
    await page.locator('.workspace-context-card').click();
    await expect(page).toHaveURL(/work-role/);
  });
}
test('admin identity retains dark hero and clock advances without network polling', async ({page}) => {
  await mockApi(page,{activeContextId:'ctx-admin'});
  let reads=0;
  await page.route('**/api/getMyIdentityCard',r=>{reads++;return r.fulfill({json:{status:'success',valid:true,card}});});
  await page.route('**/api/createMyIdentityCardCode',r=>r.fulfill({json:{status:'success',valid:true,card,image,verificationImage}}));
  await page.goto('/web/identity-card');
  await expect(page.locator('.workspace-hero-admin')).toBeVisible();
  const first=await page.locator('.identity-time-value').innerText();
  await expect(page.locator('.identity-time-value')).not.toHaveText(first);
  expect(reads).toBe(1);
});

test('verification uses plain detail fields and shows no-position only once', async ({page}) => {
  await mockApi(page,{authenticated:false});
  const longCard = {...card,name:'Example member with a long display name',organization:'Example university organization '.repeat(10),stateCode:'no_position',positionFacts:{role:'user',hasAssignment:false}};
  await page.route('**/api/verifyIdentityCard',r=>r.fulfill({json:{status:'success',valid:true,card:longCard,checkedAt:'2026-11-10T08:00:00.000Z'}}));
  await page.goto('/web/identity-card/verify?token='+'a'.repeat(32));
  await expect(page.getByText(copy.noPosition,{exact:true})).toHaveCount(1);
  const presentation = await page.evaluate(() => ({
    header:getComputedStyle(document.querySelector('.identity-header')).backgroundImage,
    gap:document.querySelector('.identity-body').getBoundingClientRect().top-document.querySelector('.identity-header').getBoundingClientRect().bottom,
    chips:document.querySelectorAll('.identity-verification .chip').length,
    fields:[...document.querySelectorAll('.identity-field')].map(el=>({border:getComputedStyle(el).borderTopWidth,background:getComputedStyle(el).backgroundImage})),
    overflow:document.documentElement.scrollWidth>innerWidth
  }));
  expect(presentation.header).toContain('linear-gradient');
  expect(presentation.gap).toBeGreaterThanOrEqual(8);
  expect(presentation.chips).toBe(0);
  expect(presentation.overflow).toBe(false);
  for (const field of presentation.fields) { expect(field.border).toBe('1px'); expect(field.background).toContain('linear-gradient'); }
});
test('code service failure retains basic identity and offers retry', async ({page}) => {
  await mockApi(page);
  await page.route('**/api/getMyIdentityCard',r=>r.fulfill({json:{status:'success',valid:true,card}}));
  await page.route('**/api/createMyIdentityCardCode',r=>r.fulfill({status:503,json:{status:'identity_card_unavailable'}}));
  await page.goto('/web/identity-card');
  await expect(page.getByText(copy.failure,{exact:true})).toBeVisible();
  await expect(page.locator('.workspace-person-name')).toHaveText(card.name);
  await expect(page.getByRole('button',{name:copy.refresh,exact:true})).toBeEnabled();
});

test('public identity exposes structured position cards and a local clock without revalidation', async ({page}) => {
  await mockApi(page,{authenticated:false});
  let reads=0;
  await page.route('**/api/verifyIdentityCard',r=>{ reads++; return r.fulfill({json:{status:'success',valid:true,checkedAt:'2026-11-10T08:00:00.000Z',card:{...card,positionFacts:{...card.positionFacts,department:'Department A',identityCategory:'Coordinator',workGroup:'Group A'}}}}); });
  await page.goto('/web/identity-card/verify?token='+'a'.repeat(32));
  await expect(page.locator('.identity-field')).toHaveCount(4);
  for (const value of ['Department A','Coordinator','Group A']) await expect(page.locator('.identity-field').getByText(value,{exact:true})).toBeVisible();
  const clock=page.locator('.identity-live-time .identity-time-value');
  const first=await clock.innerText(); await expect(clock).not.toHaveText(first);
  await expect(page.locator('.identity-time:not(.identity-live-time) .identity-time-value')).toHaveText('2026-11-10 16:00:00');
  expect(reads).toBe(1);
});
