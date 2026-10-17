import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import copy from '../../src/locales/zh-CN/index.js';
import text from '../../src/locales/zh-CN/shared/auditSigning.js';
import { mockApi, submissionDetail, STORED_PASSPHRASE, STORED_STUDENT_ID } from './fixtures.js';

async function setup(page, options = {}) {
  await mockApi(page);
  const state = { detail: submissionDetail({ actionType: options.actionType || 'sign' }), calls: [], failRead: false, failPreview: options.failPreview || false, refused: false };
  if (options.twoFiles) state.detail.files.push({ ...state.detail.files[0], id: 'file-2', fileName: '第二附件.pdf', fileHash: 'hash-2' });
  await page.goto('/web/login');
  await page.getByLabel(copy.login.studentId).fill(STORED_STUDENT_ID);
  await page.getByLabel(copy.login.passphrase).fill(STORED_PASSPHRASE);
  await page.getByRole('button', { name: copy.login.loginAction }).click();
  await expect(page).toHaveURL(/portal$/);
  const preview = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 400;
    const context = canvas.getContext('2d'); context.fillStyle = '#ffffff'; context.fillRect(0, 0, 800, 400);
    return canvas.toDataURL().split(',')[1];
  });
  const mark = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 30;
    const context = canvas.getContext('2d'); context.fillStyle = '#000000'; context.fillRect(0, 0, 80, 30);
    return canvas.toDataURL();
  });
  await page.route('**/api/**', async route => {
    const name = new URL(route.request().url()).pathname.slice(5), body = route.request().postDataJSON();
    if (!['getSubmissionDetail', 'getAuditFilePreview', 'approveStep', 'listMyStamps', 'getMyStampImage', 'listMySignatures'].includes(name)) return route.fallback();
    state.calls.push({ name, body });
    let result;
    if (name === 'getSubmissionDetail') result = state.failRead ? { status: 'error' } : state.detail;
    if (name === 'getAuditFilePreview') result = state.failPreview ? { status: 'error' } : { status: 'success', previewMime: 'image/png', data: preview, pageWidth: 800, pageHeight: 400, totalPages: 2 };
    if (name === 'listMyStamps') result = { status: 'success', stamps: [{ id: 'stamp-1', name: '测试印章' }] };
    if (name === 'getMyStampImage') result = { status: 'success', imageData: mark };
    if (name === 'listMySignatures') result = { status: 'success', signatures: [{ id: 'template-a', name: '个人签名', imageData: mark }] };
    if (name === 'approveStep') { result = state.refused ? { status: 'forbidden', message: '本步骤暂不能处理' } : { status: 'success' }; if (!state.refused) state.detail.canApproveCurrentStep = false; }
    await route.fulfill({ json: result });
  });
  await page.goto('/web/audit/submission/submission-1');
  await expect(page.getByRole('button', { name: text.addInk }).first()).toBeVisible();
  return state;
}
async function enter(page, index = 0) {
  await page.getByRole('button', { name: text.addInk, exact: true }).nth(index).click();
  await expect(page).toHaveURL(/audit\/signing$/);
  await expect(page.getByRole('button', { name: text.confirm, exact: true })).toBeEnabled();
  await expect(page.locator('.signing-stage canvas')).toBeVisible();
}
async function stroke(page, y = 0.5, left = 0.2, right = 0.8) {
  await page.locator('.signing-stage canvas').scrollIntoViewIfNeeded();
  const box = await page.locator('.signing-stage canvas').boundingBox();
  const fileWidth = Math.min(box.width, box.height * 2), fileHeight = fileWidth / 2;
  const fileLeft = box.x + (box.width - fileWidth) / 2, fileTop = box.y + (box.height - fileHeight) / 2;
  await page.mouse.move(fileLeft + fileWidth * left, fileTop + fileHeight * y);
  await page.mouse.down();
  await page.mouse.move(fileLeft + fileWidth * right, fileTop + fileHeight * y, { steps: 30 });
  await page.mouse.up();
}
async function pixels(page) {
  return page.locator('.signing-export-canvas').evaluate(canvas => {
    const bytes = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const counts = { black: 0, blue: 0, red: 0, custom: 0, alpha: 0 };
    for (let i = 0; i < bytes.length; i += 4) {
      if (!bytes[i + 3]) continue; counts.alpha++;
      if (bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 0) counts.black++;
      if (bytes[i] === 0 && bytes[i + 1] === 0 && bytes[i + 2] === 255) counts.blue++;
      if (bytes[i] === 255 && bytes[i + 1] === 0 && bytes[i + 2] === 0) counts.red++;
      if (bytes[i] === 18 && bytes[i + 1] === 171 && bytes[i + 2] === 205) counts.custom++;
    }
    return counts;
  });
}
test('签署页以文件为主体，紧凑工具栏与底部操作完整可见', async ({ page }) => {
  await setup(page); await enter(page);
  const sizes = [{ width: 310, height: 650 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 720 }];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await expect.poll(() => page.locator('.signing-stage').evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThan((size.height - 44) * 0.35);
    const layout = await page.evaluate(() => {
      const footer = document.querySelector('.signing-footer').getBoundingClientRect(), stage = document.querySelector('.signing-stage').getBoundingClientRect();
      return { footer: footer.bottom, stage: stage.bottom, horizontalOverflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(layout.footer).toBeLessThanOrEqual(size.height + 1);
    expect(layout.stage).toBeLessThan(layout.footer);
    expect(layout.horizontalOverflow).toBe(false);
    await expect(page.locator('.signing-actions button')).toHaveCount(6);
  }
  await stroke(page); await page.getByRole('button', { name: text.undo, exact: true }).click();
  await expect.poll(async () => (await pixels(page)).alpha).toBe(0);
});
test('连续黑色笔画、三种预设与自定义颜色在画布和透明导出中一致', async ({ page }) => {
  const state = await setup(page); await enter(page); await stroke(page);
  await expect.poll(async () => (await pixels(page)).black).toBeGreaterThan(100);
  expect((await pixels(page)).blue).toBe(0);
  const continuity = await page.locator('.signing-export-canvas').evaluate(canvas => {
    const context = canvas.getContext('2d'), row = Math.floor(canvas.height / 2);
    let gaps = 0;
    const fileWidth = Math.min(canvas.width, canvas.height * 2), left = (canvas.width - fileWidth) / 2;
    for (let x = Math.ceil(left + fileWidth * 0.22); x < left + fileWidth * 0.78; x++) {
      const data = context.getImageData(x, row - 2, 1, 5).data;
      if (![3, 7, 11, 15, 19].some(i => data[i] > 0)) gaps++;
    }
    return gaps;
  });
  expect(continuity).toBe(0);
  await page.getByRole('button', { name: text.blue, exact: true }).click(); await stroke(page, 0.47);
  await page.getByRole('button', { name: text.red, exact: true }).click(); await stroke(page, 0.53);
  await page.getByRole('button', { name: text.custom, exact: true }).click();
  await page.getByLabel(text.hex).fill('#12abcd'); await page.getByLabel(text.hex).press('Tab'); await stroke(page, 0.56);
  await expect.poll(async () => (await pixels(page)).custom).toBeGreaterThan(50);
  const colored = await pixels(page); expect(colored.black).toBeGreaterThan(100); expect(colored.blue).toBeGreaterThan(100); expect(colored.red).toBeGreaterThan(100);
  await page.getByRole('button', { name: text.confirm, exact: true }).click();
  await expect(page).toHaveURL(/submission\/submission-1$/);
  expect(state.calls.filter(item => item.name === 'approveStep')).toHaveLength(0);
  await page.getByRole('button', { name: copy.audit.actionApprove, exact: true }).click();
  await expect.poll(() => state.calls.filter(item => item.name === 'approveStep').length).toBe(1);
  const material = state.calls.find(item => item.name === 'approveStep').body.signatures[0];
  if(process.env.SIGNING_FRONTEND_PARAMETERS)await writeFile(process.env.SIGNING_FRONTEND_PARAMETERS,JSON.stringify(state.calls.find(item=>item.name==='approveStep').body));
  expect(material.widthRatio).toBeGreaterThan(0.5); expect(material.imageData).toMatch(/^data:image\/png;base64,/);
  const result = await page.evaluate(async src => {
    const image = new Image(); image.src = src; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    return { width: image.width, hasTransparentPixel: context.getImageData(0, 0, image.width, image.height).data.some((value, index) => index % 4 === 3 && value === 0) };
  }, material.imageData);
  expect(result.hasTransparentPixel).toBe(true);
  expect(result.width).toBeGreaterThan(2000);
});

test('高密度画布与三档签字笔在四倍放大下保持清晰', async ({ page }) => {
  const state = await setup(page); await enter(page);
  expect(state.calls.find(item => item.name === 'getAuditFilePreview').body.previewMaxEdge).toBe(4096);
  const surface = page.locator('.signing-stage canvas');
  const dimensions = await surface.evaluate(canvas => ({ width: canvas.width, css: canvas.getBoundingClientRect().width, dpr: devicePixelRatio }));
  expect(Math.abs(dimensions.width - dimensions.css * dimensions.dpr)).toBeLessThanOrEqual(1);
  for (let i = 0; i < 7; i++) await page.getByRole('button', { name: text.zoomIn, exact: true }).click();
  const measured = [];
  for (const width of ['1', '2', '3.5']) {
    await page.getByRole('combobox', { name: text.width, exact: true }).selectOption(width);
    await stroke(page);
    const coverage = await page.locator('.signing-export-canvas').evaluate(canvas => {
      const data = canvas.getContext('2d').getImageData(Math.floor(canvas.width / 2), 0, 1, canvas.height).data;
      let total = 0; for (let i = 3; i < data.length; i += 4) total += data[i] / 255;
      return total / devicePixelRatio;
    });
    expect(Math.abs(coverage - Number(width))).toBeLessThan(0.6);
    measured.push(coverage);
    await page.getByRole('button', { name: text.undo, exact: true }).click();
    await expect.poll(async () => (await pixels(page)).alpha).toBe(0);
  }
  expect(measured[1]).toBeGreaterThan(measured[0] * 1.5);
  expect(measured[2]).toBeGreaterThan(measured[1] * 1.5);
});
test('确认返回不清历史，重进立即撤销与重做；跨页撤销自动定位', async ({ page }) => {
  await setup(page); await enter(page); await stroke(page);
  await page.getByRole('button', { name: '▶', exact: true }).click(); await expect(page.getByText(text.page + ' 2 / 2', { exact: true })).toBeVisible(); await stroke(page);
  await page.getByRole('button', { name: text.confirm, exact: true }).click(); await enter(page);
  await expect(page.getByRole('button', { name: text.undo, exact: true })).toBeEnabled();
  await page.getByRole('button', { name: text.undo, exact: true }).click(); await expect.poll(async () => (await pixels(page)).alpha).toBe(0);
  await page.getByRole('button', { name: text.undo, exact: true }).click(); await expect(page.getByText(text.page + ' 1 / 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: text.redo, exact: true }).click(); await expect.poll(async () => (await pixels(page)).black).toBeGreaterThan(100);
  await page.getByRole('button', { name: text.redo, exact: true }).click(); await expect(page.getByText(text.page + ' 2 / 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: text.confirm, exact: true }).click(); await expect(page).toHaveURL(/submission\/submission-1$/);
});
test('取消恢复进入前历史，清空覆盖附件所有页且撤销恢复', async ({ page }) => {
  await setup(page); await enter(page); await stroke(page);
  await page.getByRole('button', { name: text.confirm, exact: true }).click(); await enter(page);
  await stroke(page, 0.47); await page.getByRole('button', { name: text.cancel, exact: true }).click(); await enter(page);
  await page.getByRole('button', { name: text.undo, exact: true }).click(); await expect.poll(async () => (await pixels(page)).alpha).toBe(0);
  await expect(page.getByRole('button', { name: text.undo, exact: true })).toBeDisabled();
  await page.getByRole('button', { name: text.redo, exact: true }).click();
  await page.getByRole('button', { name: '▶', exact: true }).click(); await stroke(page);
  await page.getByRole('button', { name: text.clear, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: text.clear, exact: true }).click();
  await expect.poll(async () => (await pixels(page)).alpha).toBe(0);
  await page.getByRole('button', { name: '◀', exact: true }).click(); await expect.poll(async () => (await pixels(page)).alpha).toBe(0);
  await page.getByRole('button', { name: text.undo, exact: true }).click(); await expect(page.getByText(text.page + ' 2 / 2', { exact: true })).toBeVisible(); await expect.poll(async () => (await pixels(page)).black).toBeGreaterThan(100);
});
test('两个附件分别保留笔画历史，刷新后不保留登录内草稿', async ({ page }) => {
  await setup(page, { twoFiles: true }); await enter(page); await stroke(page);
  await page.getByRole('button', { name: text.confirm, exact: true }).click(); await enter(page, 1);
  await expect(page.getByRole('button', { name: text.undo, exact: true })).toBeDisabled(); await stroke(page);
  await page.getByRole('button', { name: text.confirm, exact: true }).click(); await enter(page);
  await expect.poll(async () => (await pixels(page)).black).toBeGreaterThan(100);
  await page.reload(); await expect(page.getByText(text.draftLost, { exact: true })).toBeVisible();
});
test('橡皮擦仅局部擦除本步骤笔画，重进仍可撤销擦除', async ({ page }) => {
  await setup(page); await enter(page); await stroke(page); const before = await pixels(page);
  await page.getByRole('button', { name: text.erase, exact: true }).click(); await stroke(page, 0.5, 0.45, 0.55);
  await expect.poll(async () => (await pixels(page)).black).toBeLessThan(before.black);
  expect((await pixels(page)).black).toBeGreaterThan(50);
  await page.getByRole('button', { name: text.confirm, exact: true }).click(); await enter(page);
  await page.getByRole('button', { name: text.undo, exact: true }).click(); await expect.poll(async () => (await pixels(page)).black).toBe(before.black);
});
test('重叠签章只移动明确选中的对象，拖动保持抓取位置并且取消新增回退', async ({ page }) => {
  const state = await setup(page, { actionType: 'both' });
  async function add() {
    await page.getByRole('button', { name: text.stamp, exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '测试印章', exact: true }).click();
    await expect(page.getByRole('button', { name: text.confirm, exact: true })).toBeEnabled();
    await page.getByRole('button', { name: text.confirm, exact: true }).click();
  }
  await add(); await add();
  await page.getByRole('button', { name: text.move, exact: true }).nth(0).click();
  await expect(page.getByRole('button', { name: text.confirm, exact: true })).toBeEnabled();
  await page.locator('.signing-stage canvas').scrollIntoViewIfNeeded();
  const box = await page.locator('.signing-stage canvas').boundingBox();
  const fileWidth = Math.min(box.width, box.height * 2), fileHeight = fileWidth / 2;
  await page.mouse.move(box.x + box.width / 2 + 4, box.y + box.height / 2 - fileHeight * 0.2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + fileWidth * 0.2 + 4, box.y + box.height / 2, { steps: 12 }); await page.mouse.up();
  await page.getByRole('button', { name: text.confirm, exact: true }).click();
  await enter(page); await stroke(page); await page.getByRole('button', { name: text.confirm, exact: true }).click();
  await page.getByRole('button', { name: copy.audit.actionApprove, exact: true }).click();
  await expect.poll(() => state.calls.filter(item => item.name === 'approveStep').length).toBe(1);
  const stamps = state.calls.find(item => item.name === 'approveStep').body.signatures.filter(item => item.signatureType === 'stamp');
  expect(stamps[0].positionX).toBe(0.5); expect(stamps[1].positionX).toBeCloseTo(0.7, 2);
  expect(state.calls.filter(item => item.name === 'listMyStamps').every(item => item.body.includeImageData === false)).toBe(true);
  expect(state.calls.filter(item => item.name === 'getMyStampImage')).toHaveLength(1);
});
test('文件加载失败时禁止确认和落笔，原地重试恢复', async ({ page }) => {
  const state = await setup(page, { failPreview: true }); await page.getByRole('button', { name: text.addInk, exact: true }).click();
  await expect(page.getByText(text.failed, { exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: text.confirm, exact: true })).toBeDisabled();
  await stroke(page); expect((await pixels(page)).alpha).toBe(0);
  state.failPreview = false; await page.getByRole('button', { name: text.retry, exact: true }).click();
  await expect(page.getByRole('button', { name: text.confirm, exact: true })).toBeEnabled(); await stroke(page); await expect.poll(async () => (await pixels(page)).black).toBeGreaterThan(100);
});
test('审批拒绝保留书写，成功后读取失败只重读且不能重复审批', async ({ page }) => {
  const state = await setup(page); await enter(page); await stroke(page); await page.getByRole('button', { name: text.confirm, exact: true }).click();
  state.refused = true; await page.getByRole('button', { name: copy.audit.actionApprove, exact: true }).click(); await expect(page.locator('.notice-line', { hasText: '本步骤暂不能处理' })).toBeVisible();
  await enter(page); await expect(page.getByRole('button', { name: text.undo, exact: true })).toBeEnabled(); await page.getByRole('button', { name: text.confirm, exact: true }).click();
  state.refused = false; state.failRead = true; await page.getByRole('button', { name: copy.audit.actionApprove, exact: true }).click();
  await expect(page.getByRole('button', { name: copy.audit.actionApprove, exact: true })).toBeDisabled();
  await expect(page.locator('.notice-line', { hasText: text.pendingRead })).toBeVisible();
  await expect(page.locator('.notice-line', { hasText: copy.audit.loadFailed })).toBeVisible();
  expect(state.calls.filter(item => item.name === 'approveStep')).toHaveLength(2);
  state.failRead = false; await page.getByRole('button', { name: text.retry, exact: true }).first().click();
  await expect(page.getByRole('button', { name: copy.audit.actionApprove, exact: true })).toHaveCount(0);
  expect(state.calls.filter(item => item.name === 'approveStep')).toHaveLength(2);
});


test('每次进入形成一个图层，排序与撤销在重进和导出保持一致', async ({ page }) => {
  const state = await setup(page); await enter(page);
  await stroke(page); await stroke(page, 0.48);
  await expect(page.locator('.signing-layer-strip [role=option]')).toHaveCount(1);
  await page.getByRole('button', { name: text.confirm, exact: true }).click(); await enter(page);
  await page.getByRole('button', { name: text.red, exact: true }).click(); await stroke(page);
  const layers = page.locator('.signing-layer-strip');
  await expect(layers.getByRole('option')).toHaveCount(2);
  await expect(layers.getByRole('option').first()).toHaveAttribute('aria-label', text.stroke + ' 2');
  await expect(layers.locator('.signing-layer-rank')).toHaveText(['1', '2']);
  await layers.getByRole('option').last().click();
  await expect(page.getByRole('button', { name: text.layerDown, exact: true })).toBeDisabled();
  await page.getByRole('button', { name: text.layerUp, exact: true }).click();
  await expect(layers.getByRole('option').first()).toHaveAttribute('aria-label', text.stroke + ' 1');
  await expect(page.getByRole('button', { name: text.layerUp, exact: true })).toBeDisabled();
  await page.getByRole('button', { name: text.undo, exact: true }).click();
  await expect(layers.getByRole('option').first()).toHaveAttribute('aria-label', text.stroke + ' 2');
  await page.getByRole('button', { name: text.redo, exact: true }).click();
  await expect(layers.getByRole('option').first()).toHaveAttribute('aria-label', text.stroke + ' 1');
  await expect.poll(() => page.locator('.signing-stage canvas').evaluate(canvas => Array.from(canvas.getContext('2d').getImageData(Math.floor(canvas.width/2),Math.floor(canvas.height/2),1,1).data))).toEqual([0,0,0,255]);
  await page.getByRole('button', { name: text.confirm, exact: true }).click();
  await enter(page); await expect(layers.getByRole('option')).toHaveCount(2);
  await page.getByRole('button', { name: text.confirm, exact: true }).click();
  await page.getByRole('button', { name: copy.audit.actionApprove, exact: true }).click();
  await expect.poll(() => state.calls.filter(item=>item.name==='approveStep').length).toBe(1);
  expect(state.calls.find(item=>item.name==='approveStep').body.signatures).toHaveLength(2);
});

test('撤回与驳回按轮次折叠，最后一轮撤回仍默认展开', async ({ page }) => {
  const state = await setup(page);
  state.detail.submission.status='withdrawn'; state.detail.canApproveCurrentStep=false;
  const step=state.detail.steps[0];
  state.detail.steps=[{...step,id:'step-r1',round:1,status:'approved'},{...step,id:'step-r2',round:2,status:'rejected'},{...step,id:'step-r3',round:3,status:'pending'}];
  state.detail.events=[{id:'event-r1',round:1,eventType:'withdraw'},{id:'event-r2',round:2,eventType:'reject'},{id:'event-r3',round:3,eventType:'withdraw'}];
  await page.reload();
  const headings=page.locator('.audit-round-heading');
  await expect(headings).toHaveCount(3);
  await expect(headings.nth(0)).toHaveAttribute('aria-expanded','false');
  await expect(headings.nth(1)).toHaveAttribute('aria-expanded','false');
  await expect(headings.nth(2)).toHaveAttribute('aria-expanded','true');
  await expect(headings.nth(0)).toContainText(text.roundStates.withdrawn);
  await expect(headings.nth(1)).toContainText(text.roundStates.rejected);
  await headings.nth(0).click(); await expect(headings.nth(0)).toHaveAttribute('aria-expanded','true');
});


test('详情先预取图片，重复签署不重新请求；移动旋转删除均可撤销重做', async ({ page }) => {
  const state=await setup(page,{actionType:'both'});
  await expect.poll(()=>state.calls.filter(item=>item.name==='getMyStampImage').length).toBe(1);
  await expect.poll(()=>state.calls.filter(item=>item.name==='getAuditFilePreview').length).toBe(1);
  await page.getByRole('button',{name:text.stamp,exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'测试印章',exact:true}).click();
  await expect(page.getByRole('button',{name:text.confirm,exact:true})).toBeEnabled();
  const canvas=page.locator('.signing-stage canvas'),box=await canvas.boundingBox();
  await page.mouse.click(box.x+box.width*0.7,box.y+box.height*0.5);
  await page.getByRole('button',{name:text.undo,exact:true}).click();
  await page.getByRole('button',{name:text.redo,exact:true}).click();
  const rotation=page.getByLabel(text.rotation,{exact:true});
  await rotation.fill('45');await rotation.dispatchEvent('change');
  await expect(rotation).toHaveValue('45');
  await page.getByRole('button',{name:text.undo,exact:true}).click();await expect(rotation).toHaveValue('0');
  await page.getByRole('button',{name:text.redo,exact:true}).click();await expect(rotation).toHaveValue('45');
  await page.getByRole('button',{name:text.remove,exact:true}).click();
  await expect(page.locator('.signing-layer-strip [role=option]')).toHaveCount(0);
  await page.getByRole('button',{name:text.undo,exact:true}).click();await expect(rotation).toHaveValue('45');
  await page.getByRole('button',{name:text.confirm,exact:true}).click();
  await enter(page);await stroke(page);await stroke(page,0.4);
  await expect(page.locator('.signing-layer-strip [role=option]')).toHaveCount(2);
  await page.getByRole('button',{name:text.confirm,exact:true}).click();await enter(page);
  await page.getByRole('button',{name:text.undo,exact:true}).click();await page.getByRole('button',{name:text.undo,exact:true}).click();
  await expect(page.locator('.signing-layer-strip [role=option]')).toHaveCount(1);
  await page.getByRole('button',{name:text.redo,exact:true}).click();
  await page.getByRole('button',{name:text.confirm,exact:true}).click();
  expect(state.calls.filter(item=>item.name==='getMyStampImage')).toHaveLength(1);
  expect(state.calls.filter(item=>item.name==='getAuditFilePreview')).toHaveLength(1);
});


test('调整滑条与底栏隔离，拖动实时预览且一次撤销，切换布局保持文件比例', async ({ page }, testInfo) => {
  await setup(page, { actionType: 'both' });
  await page.getByRole('button', { name: text.stamp, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '测试印章', exact: true }).click();
  await expect(page.getByRole('button', { name: text.confirm, exact: true })).toBeEnabled();
  const sizes = [{width:310,height:650},{width:390,height:844},{width:768,height:1024},{width:1280,height:720}];
  for (const size of sizes) {
    await page.setViewportSize(size);
    for (const mode of ['pen', 'browse', 'move']) {
      await page.getByRole('tab', {name:text[mode],exact:true}).click();
      await expect.poll(() => page.locator('.signing-stage canvas').evaluate(canvas => {
        const rect=canvas.getBoundingClientRect();
        return Math.max(Math.abs(canvas.width-rect.width*devicePixelRatio),Math.abs(canvas.height-rect.height*devicePixelRatio));
      })).toBeLessThanOrEqual(1);
      await expect.poll(() => page.locator('.signing-stage canvas').evaluate(canvas=>{
        const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
        let left=canvas.width,right=0,top=canvas.height,bottom=0;
        for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(data[(y*canvas.width+x)*4+3]>200){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
        return Math.abs((right-left+1)/(bottom-top+1)-2);
      })).toBeLessThan(0.025);
    }
    const slider=page.getByRole('slider',{name:text.size,exact:true});
    await slider.scrollIntoViewIfNeeded();
    const geometry=await slider.evaluate(node=>{
      const rect=node.getBoundingClientRect(),footer=document.querySelector('.signing-footer').getBoundingClientRect();
      return {height:rect.height,gap:footer.top-rect.bottom,hit:document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)===node};
    });
    expect(geometry.height).toBeGreaterThanOrEqual(48);expect(geometry.gap).toBeGreaterThanOrEqual(12);expect(geometry.hit).toBe(true);
    const old=await slider.inputValue(),box=await slider.boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
    await page.mouse.move(box.x+box.width*0.8,box.y+box.height/2,{steps:12});
    const preview=await slider.inputValue();expect(preview).not.toBe(old);
    await expect(page.locator('.signing-adjustment-label').first()).toContainText(preview+'%');
    await page.mouse.up();
    await page.getByRole('button',{name:text.undo,exact:true}).click();await expect(slider).toHaveValue(old);
    await page.getByRole('button',{name:text.redo,exact:true}).click();await expect(slider).toHaveValue(preview);
    await page.getByRole('button',{name:text.undo,exact:true}).click();
    await page.screenshot({path:testInfo.outputPath('signing-'+size.width+'.png'),fullPage:true});
  }
});

for(const mode of ['signature','stamp','both'])test('签名或盖章允许 '+mode+' 并拒绝空材料',async({page})=>{
  const state=await setup(page,{actionType:'either'});
  await page.getByRole('button',{name:copy.audit.actionApprove,exact:true}).click();
  await expect(page.locator('.notice-line')).toContainText(text.eitherRequired);
  expect(state.calls.filter(item=>item.name==='approveStep')).toHaveLength(0);
  if(mode!=='stamp'){await enter(page);await stroke(page);await page.getByRole('button',{name:text.confirm,exact:true}).click();}
  if(mode!=='signature'){
    await page.getByRole('button',{name:text.stamp,exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'测试印章',exact:true}).click();
    await expect(page.getByRole('button',{name:text.confirm,exact:true})).toBeEnabled();
    await page.getByRole('button',{name:text.confirm,exact:true}).click();
  }
  await page.getByRole('button',{name:copy.audit.actionApprove,exact:true}).click();
  await expect.poll(()=>state.calls.filter(item=>item.name==='approveStep').length).toBe(1);
  const materials=state.calls.find(item=>item.name==='approveStep').body.signatures;
  expect(materials.map(item=>item.signatureType).sort()).toEqual(mode==='both'?['signature','stamp']:[mode]);
});
