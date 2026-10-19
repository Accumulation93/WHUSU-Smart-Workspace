'use strict';
const axios = require('axios');
const QRCode = require('qrcode');
const copy = require('../../locales/zh-CN/identityCard');
let cachedToken = null, pendingToken = null;
async function accessToken() {
  if (cachedToken && cachedToken.until > Date.now()) return cachedToken.value;
  if (pendingToken) return pendingToken;
  pendingToken = (async () => {
    const started = Date.now();
    const { data } = await axios.post('https://api.weixin.qq.com/cgi-bin/stable_token', {
      grant_type: 'client_credential', appid: process.env.WECHAT_APPID, secret: process.env.WECHAT_SECRET
    }, { timeout: 8000 });
    if (!data.access_token || !Number.isFinite(data.expires_in)) throw new Error(copy.qrFailure);
    cachedToken = { value: data.access_token, until: started + Math.max(0, data.expires_in - 120) * 1000 };
    return cachedToken.value;
  })();
  try { return await pendingToken; } finally { pendingToken = null; }
}
async function createImage(scene, envVersion = 'release') {
  if (!['release', 'trial', 'develop'].includes(envVersion)) throw new Error(copy.qrFailure);
  const token = await accessToken();
  const response = await axios.post('https://api.weixin.qq.com/wxa/getwxacodeunlimit', {
    scene, page: 'subpackages/org/pages/identityCard/identityCard', check_path: false,
    env_version: envVersion, width: 1024
  }, { params: { access_token: token }, responseType: 'arraybuffer', timeout: 8000, maxContentLength: 1024 * 1024 });
  const bytes = Buffer.from(response.data);
  const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!png && !jpeg) {
    cachedToken = null;
    throw new Error(copy.qrFailure);
  }
  return 'data:image/' + (png ? 'png' : 'jpeg') + ';base64,' + bytes.toString('base64');
}
async function createVerificationImage(scene) {
  if (!/^[a-f0-9]{32}$/.test(scene)) throw new Error(copy.qrFailure);
  return QRCode.toDataURL('https://accumulation93.com/web/identity-card/verify?token=' + scene,
    { width: 1024, margin: 4, errorCorrectionLevel: 'H', color: { dark: '#000000ff', light: '#ffffffff' } });
}
module.exports = { createImage, createVerificationImage };
