import { createSigningAssets } from '@/shared/auditSigningAssets.js';
import { auditRequests } from './auditRequests.js';
let requests = auditRequests();
const assets = createSigningAssets((name,data) => requests.call(name,data), src => new Promise((resolve,reject) => {
  const image = new Image(), timer = setTimeout(() => { image.onload = null; image.onerror = null; reject(new Error('image_timeout')); }, 15000);
  image.onload = () => { clearTimeout(timer); resolve(image); }; image.onerror = error => { clearTimeout(timer); reject(error); }; image.src = src;
}));

export const signingAssets = { ...assets, reset() { assets.reset(); requests.dispose(); requests = auditRequests(); } };
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.hidden) assets.pause(); else assets.resume(); });
