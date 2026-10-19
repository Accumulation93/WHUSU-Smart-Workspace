'use strict';
const assert = require('node:assert/strict');
const axios = require('axios');
async function main() {
  const original = axios.post;
  let tokenCalls=0, imageCalls=0, invalid=false, jpeg=false;
  axios.post = async (url, body, options) => {
    if (url.endsWith('/stable_token')) { tokenCalls++; await new Promise(resolve=>setTimeout(resolve,5)); return {data:{access_token:'test-token',expires_in:7200}}; }
    imageCalls++; assert.equal(body.scene.length,32); assert.equal(body.page,'subpackages/org/pages/identityCard/identityCard'); assert.equal(options.params.access_token,'test-token'); assert.equal(options.responseType,'arraybuffer');
    return {data:invalid?Buffer.from('{"errcode":40001}'):jpeg?Buffer.from([255,216,255,0]):Buffer.from([137,80,78,71,13,10,26,10])};
  };
  try {
    const codes=require('../src/core/services/identityCardCode');
    const images=await Promise.all([codes.createImage('a'.repeat(32),'develop'),codes.createImage('b'.repeat(32),'trial')]);
    assert.equal(tokenCalls,1); assert.equal(imageCalls,2); assert(images.every(image=>image.startsWith('data:image/png;base64,')));
    jpeg=true; assert((await codes.createImage('c'.repeat(32))).startsWith('data:image/jpeg;base64,'));
    invalid=true; await assert.rejects(codes.createImage('d'.repeat(32)));
    await assert.rejects(codes.createImage('e'.repeat(32),'invalid')); assert.equal(tokenCalls,1);
    console.log('PASS 微信成图请求固定页面与版本、并发令牌合并、PNG/JPEG及JSON错误拒绝（测试替身）');
  } finally { axios.post=original; }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
