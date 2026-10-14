'use strict';
const assert = require('node:assert/strict');
const { PDFDocument, PDFName, PDFArray, PDFRawStream, decodePDFRawStream, rgb } = require('pdf-lib');

async function createDocument() {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Original document elements');
  const first = pdf.addPage([800, 400]);
  first.drawText('SEARCHABLE ORIGINAL TEXT', { x: 40, y: 350, size: 18 });
  first.drawRectangle({ x: 40, y: 200, width: 100, height: 80, color: rgb(0, 0.5, 1) });
  const second = pdf.addPage([800, 400]);
  second.drawText('SECOND PAGE ORIGINAL TEXT', { x: 40, y: 350, size: 18 });
  const form = pdf.getForm().createTextField('original-field');
  form.setText('Original form value'); form.addToPage(first, { x: 200, y: 200, width: 200, height: 40 });
  const link = pdf.context.register(pdf.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [40, 300, 200, 330],
    A: { Type: 'Action', S: 'URI', URI: require('pdf-lib').PDFString.of('https://example.com/original') } }));
  first.node.addAnnot(link);
  await pdf.attach(Buffer.from('original attachment bytes'), 'original.txt');
  return Buffer.from(await pdf.save());
}
function streams(pdf, page) {
  const contents = page.node.Contents();
  const list = contents instanceof PDFArray ? contents.asArray() : [contents];
  return list.map(ref => pdf.context.lookup(ref)).filter(value => value instanceof PDFRawStream)
    .map(value => Buffer.from(decodePDFRawStream(value).decode()));
}
async function assertPreserved(before, after) {
  const source = await PDFDocument.load(before), result = await PDFDocument.load(after);
  assert.equal(result.getPages().length, source.getPages().length);
  assert.equal(result.getTitle(), source.getTitle());
  for (let index = 0; index < source.getPageCount(); index++) {
    const a = source.getPage(index), b = result.getPage(index), finalStreams = streams(result, b);
    assert.deepEqual(b.getSize(), a.getSize());
    for (const bytes of streams(source, a)) assert(finalStreams.some(value => value.equals(bytes)), '原文字和矢量绘图指令必须逐字节保留');
    for (const ref of (a.node.Annots() ? a.node.Annots().asArray() : [])) {
      assert(b.node.Annots().asArray().some(value => value.toString() === ref.toString()), '保留原链接和表单注释');
      assert.equal(result.context.lookup(ref).toString(), source.context.lookup(ref).toString());
    }
    const fonts = a.node.Resources().lookup(PDFName.of('Font'));
    for (const key of fonts.keys()) assert.equal(b.node.Resources().lookup(PDFName.of('Font')).get(key).toString(), fonts.get(key).toString());
  }
  assert.equal(result.getForm().getTextField('original-field').getText(), 'Original form value');
  const names = PDFName.of('Names');
  assert.equal(result.catalog.lookup(names).toString(), source.catalog.lookup(names).toString(), '保留嵌入附件目录');
}
module.exports = { createDocument, assertPreserved };
