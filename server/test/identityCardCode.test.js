'use strict';
const assert = require('node:assert/strict');
const axios = require('axios');
const { PNG } = require('pngjs');
const decode = require('jsqr');
async function main() {
  const original = axios.post;
  let tokenCalls=0, imageCalls=0, invalid=false, jpeg=false;
  axios.post = async (url, body, options) => {
    if (url.endsWith('/stable_token')) { tokenCalls++; await new Promise(resolve=>setTimeout(resolve,5)); return {data:{access_token:'test-token',expires_in:7200}}; }
    imageCalls++; assert.equal(body.scene.length,32); assert.equal(body.page,'subpackages/org/pages/identityCard/identityCard'); assert.equal(options.params.access_token,'test-token'); assert.equal(options.responseType,'arraybuffer');
    assert.equal(body.is_hyaline,true); assert.equal(body.auto_color,false); assert.deepEqual(body.line_color,{r:0,g:0,b:0}); assert.equal(body.width,1024);
    return {data:invalid?Buffer.from('{"errcode":40001}'):jpeg?Buffer.from([255,216,255,0]):Buffer.from([137,80,78,71,13,10,26,10])};
  };
  try {
    const codes=require('../src/core/services/identityCardCode');
    const verification = await codes.createVerificationImage('a'.repeat(32));
    const png = PNG.sync.read(Buffer.from(verification.split(',')[1], 'base64'));
    assert.equal(png.width, 1024);
    let transparent=0, opaque=0;
    for(let i=0;i<png.data.length;i+=4) {
      if(png.data[i+3]===0) transparent++;
      else { assert.equal(png.data[i+3],255); assert.deepEqual([...png.data.subarray(i,i+3)],[0,0,0]); opaque++; }
    }
    assert(transparent>0 && opaque>0); assert.equal(png.data[3],0);
    for(const size of [1024,256,240]) for(const background of [[255,255,255],[248,251,255],[239,246,255]]) {
      const pixels=new Uint8ClampedArray(size*size*4);
      for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
        const source=(Math.floor(y*1024/size)*1024+Math.floor(x*1024/size))*4, target=(y*size+x)*4;
        for(let c=0;c<3;c++) pixels[target+c]=png.data[source+3] ? png.data[source+c] : background[c];
        pixels[target+3]=255;
      }
      assert.equal(decode(pixels,size,size).data,'https://accumulation93.com/web/identity-card/verify?token='+'a'.repeat(32));
    }
    assert.equal(decode(new Uint8ClampedArray(png.data), png.width, png.height).data, 'https://accumulation93.com/web/identity-card/verify?token=' + 'a'.repeat(32));
    const small = new Uint8ClampedArray(256 * 256 * 4);
    for (let y=0;y<256;y++) for (let x=0;x<256;x++) for (let c=0;c<4;c++) small[(y*256+x)*4+c]=png.data[((y*4)*1024+x*4)*4+c];
    assert.equal(decode(small,256,256).data,'https://accumulation93.com/web/identity-card/verify?token='+'a'.repeat(32));
    await assert.rejects(codes.createVerificationImage('invalid'));
    const images=await Promise.all([codes.createImage('a'.repeat(32),'develop'),codes.createImage('b'.repeat(32),'trial')]);
    assert.equal(tokenCalls,1); assert.equal(imageCalls,2); assert(images.every(image=>image.startsWith('data:image/png;base64,')));
    jpeg=true; assert((await codes.createImage('c'.repeat(32))).startsWith('data:image/jpeg;base64,'));
    invalid=true; await assert.rejects(codes.createImage('d'.repeat(32)));
    await assert.rejects(codes.createImage('e'.repeat(32),'invalid')); assert.equal(tokenCalls,1);
    console.log('PASS 微信成图请求固定页面与版本、并发令牌合并、PNG/JPEG及JSON错误拒绝（测试替身）');
  } finally { axios.post=original; }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
