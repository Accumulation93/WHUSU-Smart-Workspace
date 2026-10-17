import { test, expect } from '@playwright/test';
import copy from '../../src/locales/zh-CN/index.js';
import files from '../../src/locales/zh-CN/shared/fileIO.js';
import { mockApi, STORED_PASSPHRASE, STORED_STUDENT_ID } from './fixtures.js';

async function login(page) {
  await mockApi(page);
  await page.goto('/web/login');
  await page.getByLabel(copy.login.studentId).fill(STORED_STUDENT_ID);
  await page.getByLabel(copy.login.passphrase).fill(STORED_PASSPHRASE);
  await page.getByRole('button',{name:copy.login.loginAction}).click();
  await expect(page).toHaveURL(/portal$/);
}
test('统一输入选择来源，取消不选择，系统浏览可选入原文件',async({page})=>{
  await login(page);await page.goto('/web/audit/create');
  await page.getByRole('button',{name:files.choose,exact:true}).click();
  const dialog=page.getByRole('dialog',{name:files.input});
  await expect(dialog.getByRole('button',{name:files.album,exact:true})).toHaveCount(0);
  await expect(dialog.getByRole('button',{name:files.browse,exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:files.cancel,exact:true}).click();await expect(dialog).toHaveCount(0);
  await page.getByRole('button',{name:files.choose,exact:true}).click();
  const chooser=page.waitForEvent('filechooser');await dialog.getByRole('button',{name:files.browse,exact:true}).click();
  await (await chooser).setFiles({name:'original.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 original')});
  await expect(page.getByText('original.pdf',{exact:true})).toBeVisible();
});
test('统一输出明确选择保存，取消不下载，下载保留原始字节',async({page})=>{
  await page.addInitScript(()=>{window.showSaveFilePicker=undefined;});
  await login(page);
  const bytes='%PDF-1.4 untouched original';
  await page.route('**/api/downloadAuditFile?**',route=>route.fulfill({body:bytes,contentType:'application/pdf'}));
  await page.goto('/web/audit/submission/submission-1');
  const button=page.getByRole('button',{name:copy.audit.actionDownload,exact:true});
  await button.first().click();
  const dialog=page.getByRole('dialog',{name:files.output});
  await expect(dialog).toBeVisible();
  let downloads=0;page.on('download',()=>downloads++);
  await dialog.getByRole('button',{name:files.cancel,exact:true}).click();expect(downloads).toBe(0);
  await button.first().click();
  const download=page.waitForEvent('download');await dialog.getByRole('button',{name:files.save,exact:true}).click();
  const saved=await download;const stream=await saved.createReadStream();const parts=[];for await(const chunk of stream)parts.push(chunk);
  expect(Buffer.concat(parts).toString()).toBe(bytes);expect(downloads).toBe(1);
});

for(const supported of [false,true]) {
  test(`输入输出仅展示已探测能力 ${supported}`,async({page})=>{
    await page.addInitScript(enabled=>{
      Object.defineProperty(navigator,'pdfViewerEnabled',{configurable:true,value:enabled});
      Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>enabled});
      Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{window.fileShareCalled=true;}});
      if(enabled)Object.defineProperty(HTMLInputElement.prototype,'capture',{configurable:true,writable:true,value:''});
      else delete HTMLInputElement.prototype.capture;
    },supported);
    await login(page);await page.goto('/web/audit/create');
    await page.getByRole('button',{name:files.choose,exact:true}).click();
    const input=page.getByRole('dialog',{name:files.input});
    await expect(input.getByRole('button',{name:files.camera,exact:true})).toHaveCount(supported?1:0);
    await expect(input.getByRole('button',{name:files.browse,exact:true})).toBeVisible();
    await input.getByRole('button',{name:files.cancel,exact:true}).click();
    await page.route('**/api/downloadAuditFile?**',route=>route.fulfill({body:'%PDF-1.4 original',contentType:'application/pdf'}));
    await page.goto('/web/audit/submission/submission-1');
    await page.getByRole('button',{name:copy.audit.actionDownload,exact:true}).first().click();
    const output=page.getByRole('dialog',{name:files.output});
    await expect(output.getByRole('button',{name:files.systemShare,exact:true})).toHaveCount(supported?1:0);
    await expect(output.getByRole('button',{name:files.preview,exact:true})).toHaveCount(supported?1:0);
    await expect(output.getByRole('button',{name:files.save,exact:true})).toBeVisible();
    if(supported){await output.getByRole('button',{name:files.systemShare,exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.fileShareCalled)).toBe(true);}
  });
}

test('文档类型不支持浏览器预览时隐藏预览',async({page})=>{
  await login(page);
  await page.route('**/api/downloadAuditFile?**',route=>route.fulfill({body:'original docx bytes',contentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));
  await page.goto('/web/audit/submission/submission-1');
  await page.getByRole('button',{name:copy.audit.actionDownload,exact:true}).first().click();
  const output=page.getByRole('dialog',{name:files.output});
  await expect(output.getByRole('button',{name:files.preview,exact:true})).toHaveCount(0);
  await expect(output.getByRole('button',{name:files.save,exact:true})).toBeVisible();
});
