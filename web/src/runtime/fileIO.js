import { shallowRef } from 'vue';
import copy from '@/locales/zh-CN/shared/fileIO.js';
import { session } from './session.js';
import { showToast } from './notify.js';

export const fileDialog = shallowRef(null);
const scope = () => [session.status, session.user?.id, session.context?.contextId, session.context?.organizationId].join('|');
export function cancelFileDialog() { const dialog=fileDialog.value; fileDialog.value=null; dialog?.resolve({status:'cancelled'}); }
function selectMode(title, modes, perform) {
  cancelFileDialog();
  const expected=scope();
  return new Promise(resolve=>{fileDialog.value={title,modes,resolve,perform,expected};});
}
export function runFileMode(mode) {
  const dialog=fileDialog.value;
  if(!dialog)return;
  fileDialog.value=null;
  if(dialog.expected!==scope()){dialog.resolve({status:'cancelled'});return;}
  try { Promise.resolve(dialog.perform(mode)).then(dialog.resolve,error=>{const cancelled=error?.name==='AbortError';if(!cancelled)showToast(copy.failed);dialog.resolve({status:cancelled?'cancelled':'failed'});}); }
  catch(error){showToast(copy.failed);dialog.resolve({status:'failed'});}
}
export function inputFile(options={}) {
  if(options.files)return Promise.resolve({status:'success',files:Array.from(options.files)});
  const element=options.element;
  return selectMode(copy.input,options.image?['browse','album','camera']:['browse'],mode=>{
    if(!element||element.disabled)return {status:'cancelled'};
    element.accept=mode==='browse' ? options.accept||'' : 'image/*';
    if(mode==='camera')element.setAttribute('capture','environment');else element.removeAttribute('capture');
    element.value='';element.click();
    return {status:'selection_started'};
  });
}
export function outputFile({blob,fileName,modes=['preview','save','systemShare']}) {
  const safeName=String(fileName||'file').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_');
  const expected=scope();
  return selectMode(copy.output,modes,async mode=>{
    if(mode==='systemShare') {
      const files=[new File([blob],safeName,{type:blob.type})];
      if(!navigator.canShare?.({files})||!navigator.share){showToast(copy.unavailable);return {status:'unsupported'};}
      await navigator.share({files});return {status:'success',mode};
    }
    if(mode==='save'&&typeof window.showSaveFilePicker==='function') {
      const handle=await window.showSaveFilePicker({suggestedName:safeName});
      if(expected!==scope())return {status:'cancelled'};
      const stream=await handle.createWritable();
      try{await stream.write(blob);await stream.close();}catch(error){await stream.abort().catch(()=>{});throw error;}
      return {status:'success',mode};
    }
    if(mode==='preview'&&!/^(application\/pdf|image\/(png|jpeg|gif|webp|bmp))$/.test(blob.type)){showToast(copy.previewUnavailable);return {status:'unsupported'};}
    const url=URL.createObjectURL(blob);
    if(mode==='preview') {
      const opened=window.open(url,'_blank');
      if(opened)opened.opener=null;
      else {URL.revokeObjectURL(url);showToast(copy.unavailable);return {status:'failed'};}
    } else {
      const link=document.createElement('a');link.href=url;link.download=safeName;document.body.append(link);link.click();link.remove();showToast(copy.downloadStarted);
    }
    window.setTimeout(()=>URL.revokeObjectURL(url),60000);
    return {status:mode==='save'?'download_started':'success',mode};
  });
}
