const { createSigningAssets } = require('./auditSigningAssetsModel');
let surface = null;
const assets = createSigningAssets((name, data) => require('./api').callFunction({ name, data }), src => new Promise((resolve, reject) => {
  if (!surface) surface = wx.createOffscreenCanvas({ type: '2d', width: 1, height: 1 });
  const image = surface.createImage();
  const timer = setTimeout(() => { image.onload = null; image.onerror = null; reject(new Error('image_timeout')); }, 15000);
  image.onload = () => { clearTimeout(timer); resolve(image); };
  image.onerror = error => { clearTimeout(timer); reject(error); };
  try { image.src = src; } catch (error) { clearTimeout(timer); reject(error); }
}));
// 全应用唯一监听，不随页面重复注册；后台停止启动预取，前台恢复。
if (typeof wx !== 'undefined' && wx.onAppHide) { wx.onAppHide(assets.pause); wx.onAppShow(assets.resume); }
module.exports = assets;
