'use strict';
const assert = require('assert');
const ink = require('../../shared/auditInk');
const { presentAuditStep } = require('../../shared/auditStepView');
const { computeSignatureHashV2, computeSignatureHashV3 } = require('../src/modules/audit/utils/hashChain');
const { overlaySignaturesOnBuffer, overlayOnPdfBuffer } = require('../src/modules/audit/utils/signatureOverlay');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');

async function main() {
  const store = ink.createDraftStore(); store.bind('account-a|context-a');
  const draft = store.open('submission-a|step-a|round-1'), file = store.file(draft, 'attachment-a');
  const stroke = { type: 'draw', color: '#000000', width: 0.01, page: 1, points: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.2 }, { x: 0.5, y: 0.7 }] };
  ink.appendOperation(file.history, stroke);
  ink.appendOperation(file.history, { ...stroke, page: 2, color: '#0000ff' });
  assert.strictEqual(store.file(store.open('submission-a|step-a|round-1'), 'attachment-a').history, file.history);
  assert.strictEqual(ink.undo(file.history), 2, '再次进入仍可撤销上次书写');
  assert.strictEqual(ink.redo(file.history), 2);
  assert.strictEqual(store.file(draft, 'attachment-b').history.cursor, 0, '附件隔离');
  const snapshot = ink.clone(file.history);
  ink.appendOperation(file.history, { ...stroke, type: 'erase' });
  assert.strictEqual(ink.undo(file.history), 1, '擦除可撤销');
  assert.deepStrictEqual(file.history.operations.slice(0, file.history.cursor), snapshot.operations);
  ink.appendOperation(file.history, { ...stroke, color: '#12abcd' });
  assert.strictEqual(ink.redo(file.history), null, '新分支丢弃重做，不丢弃旧笔画');
  assert.strictEqual(file.history.operations[0].color, '#000000');
  store.bind('account-a|context-b'); assert.strictEqual(store.open('submission-a|step-a|round-1').materials.length, 0);
  assert.strictEqual(store.file(store.open('submission-a|step-a|round-1'), 'attachment-a').history.cursor, 0);
  const commands = [];
  const context = new Proxy({}, { get(target, key) { return target[key] || ((...args) => commands.push([key, args])); }, set(target, key, value) { target[key] = value; return true; } });
  ink.drawPath(context, stroke, 800, 1000);
  assert.strictEqual(commands.filter(item => item[0] === 'beginPath').length, 1);
  assert.strictEqual(commands.filter(item => item[0] === 'stroke').length, 1, '整笔曲线只有一次描边，禁止逐段描边');
  assert(commands.some(item => item[0] === 'quadraticCurveTo'));
  assert.deepStrictEqual(commands.find(item => item[0] === 'lineTo')[1], [400, 700], '抬笔末点保留');
  const camera = ink.fitCamera(800, 600, 1000, 1000, 2, 60, -30);
  const projected = ink.filePoint(100 + camera.left + camera.width * 0.37, 50 + camera.top + camera.height * 0.46,
    { left: 100, top: 50 }, camera);
  assert(Math.abs(projected.x - 0.37) < 1e-10 && Math.abs(projected.y - 0.46) < 1e-10);
  const submission = { status: 'in_progress', currentStepIndex: 2 };
  assert.strictEqual(presentAuditStep(submission, { id: 'step-1', sortOrder: 1, round: 1, status: 'pending' }, [], 1).state, 'future', '不能按序号猜测已完成');
  assert.strictEqual(presentAuditStep(submission, { id: 'step-2', sortOrder: 2, round: 1, status: 'pending' }, [], 1).state, 'active');
  assert.strictEqual(presentAuditStep({ ...submission, status: 'withdrawn' }, { sortOrder: 2, status: 'pending' }, []).state, 'stopped');
  assert.strictEqual(presentAuditStep(submission, { id: 'old', sortOrder: 2, round: 1, status: 'pending' }, [], 2).state, 'future');
  const processed = presentAuditStep(submission, { id: 'step-1', sortOrder: 1, status: 'approved', approverName: '未指定' },
    [{ eventType: 'approve', stepIndex: 1, round: 1, operatorName: '真实经办人' }]);
  assert.strictEqual(processed.actorName, '真实经办人');
  assert.strictEqual(presentAuditStep(submission, { status: 'approved', approverName: '未指定' }, []).hasActor, false);
  const hashParams = { id: 'material-a', stepId: 'step-a', signerHrId: 'hr-a', signatureType: 'signature',
    materialImageHash: 'a'.repeat(64), signerAssignmentId: 'assignment-a', signerContextSnapshot: null,
    positionX: 0.5, positionY: 0.5, page: 2, size: 1, rotation: 0, round: 1, documentHash: 'b'.repeat(64), signedAt: '2026-10-14T00:00:00.000Z', widthRatio: 0.6 };
  assert.notStrictEqual(computeSignatureHashV3(hashParams), computeSignatureHashV3({ ...hashParams, widthRatio: 0.61 }));
  assert.strictEqual(computeSignatureHashV2(hashParams), computeSignatureHashV2({ ...hashParams, widthRatio: 0.61 }), '旧材料哈希字节不变');
  const mark = await sharp({ create: { width: 60, height: 20, channels: 4, background: '#000000' } }).png().toBuffer();
  const material = { imageData: 'data:image/png;base64,' + mark.toString('base64'), signatureType: 'signature', widthRatio: 0.6, positionX: 0.8, positionY: 0.5, page: 1 };
  const original = await sharp({ create: { width: 1000, height: 1000, channels: 4, background: '#ffffff' } }).png().toBuffer();
  const result = await overlaySignaturesOnBuffer({ mime_type: 'image/png' }, original, [material]);
  const decoded = await sharp(result.buffer).raw().toBuffer({ resolveWithObject: true });
  const pixel = (x, y) => Array.from(decoded.data.subarray((y * 1000 + x) * 4, (y * 1000 + x) * 4 + 4));
  assert.deepStrictEqual(pixel(500, 500), [0, 0, 0, 255]); assert.deepStrictEqual(pixel(399, 500), [255, 255, 255, 255]);
  const pdf = await PDFDocument.create(); pdf.addPage([1000, 1000]); pdf.addPage([1000, 1000]);
  const signed = await overlayOnPdfBuffer(Buffer.from(await pdf.save()), [{ ...material, page: 2 }]);
  const loaded = await PDFDocument.load(signed); assert.strictEqual(loaded.getPages().length, 2);
  assert(loaded.getPages()[1].node.Contents(), '书写进入第二页');
  console.log('连续路径、步骤草稿、附件撤销、状态事实与实际图片/PDF 宽度测试通过');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
