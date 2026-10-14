<template>
  <section class="card signing-workspace">
    <div class="panel-head"><span class="section-title">{{ file.fileName || text.padTitle }}</span></div>
    <div class="tabs" role="tablist">
      <button v-for="value in modes" :key="value" class="tab" :class="{'tab-active': mode === value}" :aria-selected="mode === value" role="tab" @click="mode = value">{{ text[value] }}</button>
    </div>
    <div class="signing-toolbar signing-actions" role="toolbar" :aria-label="text.title">
      <button class="btn-quiet" :aria-label="text.undo" :title="text.undo" :disabled="!fileDraft.history.cursor || busy" @click="changeHistory(false)">↶</button>
      <button class="btn-quiet" :aria-label="text.redo" :title="text.redo" :disabled="fileDraft.history.cursor >= fileDraft.history.operations.length || busy" @click="changeHistory(true)">↷</button>
      <button class="btn-quiet" :aria-label="text.clear" :title="text.clear" :disabled="busy" @click="clearInk">⌫</button>
      <button class="btn-quiet" :aria-label="text.zoomOut" :title="text.zoomOut" :disabled="busy" @click="setZoom(zoom / 1.25)">−</button>
      <button class="btn-quiet" :aria-label="text.zoomIn" :title="text.zoomIn" :disabled="busy" @click="setZoom(zoom * 1.25)">+</button>
      <button class="btn-quiet" :aria-label="text.fit" :title="text.fit" :disabled="busy" @click="setZoom(1, true)">⊡</button>
    </div>
    <div v-if="mode === 'pen'" class="signing-toolbar signing-palette" role="toolbar" :aria-label="text.color">
      <button v-for="preset in presets" :key="preset.value" class="btn-quiet signing-color" :aria-label="text[preset.label]" :title="text[preset.label]" :aria-pressed="!erasing && color === preset.value" @click="color = preset.value; erasing = false"><span class="signing-swatch" :style="{backgroundColor:preset.value}"></span></button>
      <button class="btn-quiet signing-color" :aria-label="text.custom" :title="text.custom" :aria-expanded="custom" @click="custom = !custom">#</button>
      <button class="btn-quiet" :aria-pressed="erasing" @click="erasing = !erasing">{{ text.erase }}</button>
      <label class="field signing-width"><span class="field-label">{{ erasing ? text.eraserWidth : text.width }}</span><select v-model.number="penWidth" class="field-input"><option :value="1">{{ text.thin }}</option><option :value="2">{{ text.medium }}</option><option :value="3.5">{{ text.thick }}</option></select></label>
    </div>
    <div v-if="custom && mode === 'pen'" class="signing-color-panel">
      <label class="field"><span class="field-label">{{ text.hex }}</span><input v-model="colorInput" class="field-input" maxlength="7" @change="applyColor" /></label>
      <label v-for="(label,index) in channelLabels" :key="label" class="field"><span class="field-label">{{ label }}</span><input :value="channels[index]" type="range" min="0" max="255" @input="setChannel(index,$event.target.value)" /></label>
    </div>
    <div class="signing-toolbar" v-if="totalPages > 1"><button class="btn-quiet" :disabled="page <= 1 || busy" @click="loadPage(page - 1)">◀</button><span>{{ text.page }} {{ page }} / {{ totalPages }}</span><button class="btn-quiet" :disabled="page >= totalPages || busy" @click="loadPage(page + 1)">▶</button></div>
    <div class="signing-stage" ref="stageRef">
      <canvas ref="surfaceRef" :aria-label="text.title" @pointerdown="start" @pointermove="move" @pointerup="end" @pointercancel="cancelGesture" @lostpointercapture="end" @wheel.prevent="wheel"></canvas>
      <div v-if="busy || notice" class="signing-stage-state"><p>{{ busy ? text.loading : notice }}</p><button v-if="notice && !busy" class="btn-quiet" @click="loadPage(page)">{{ text.retry }}</button></div>
    </div>
    <div class="signing-toolbar signing-layer-toolbar">
      <label class="field"><span class="field-label">{{ text.layers }}</span><select :value="selectedLayer || layers[0]?.id || ''" :disabled="!layers.length || saving" class="field-input" @change="selectedLayer=$event.target.value"><option v-for="(layer,index) in layers" :key="layer.id" :value="layer.id">{{ layer.kind === 'draw' ? text.stroke : layer.material.stampName || text.signature }} {{ index + 1 }}</option></select></label>
      <button class="btn-quiet" :disabled="busy || saving || layers.findIndex(layer=>layer.id===(selectedLayer||layers[0]?.id))===layers.length-1" @click="reorderLayer(1)">{{ text.layerUp }}</button>
      <button class="btn-quiet" :disabled="busy || saving || layers.findIndex(layer=>layer.id===(selectedLayer||layers[0]?.id))<=0" @click="reorderLayer(-1)">{{ text.layerDown }}</button>
    </div>
    <div v-if="mode === 'move'" class="signing-objects">
      <span class="field-label">{{ text.objects }}</span>
      <button v-for="material in materials" :key="material._idx" class="btn-quiet" :aria-pressed="activeId === material._idx" @click="activeId = material._idx">{{ material.stampName || text.signature }} {{ materials.indexOf(material) + 1 }}</button>
      <label v-if="activeMaterial" class="field"><span class="field-label">{{ text.size }}</span><input type="range" min="50" max="220" step="5" :value="(activeMaterial.size || 1)*100" @input="resizeMaterial($event.target.value)" /></label>
      <label v-if="activeMaterial" class="field"><span class="field-label">{{ text.rotation }}</span><input type="range" min="-180" max="180" step="5" :value="activeMaterial.rotation || 0" @input="activeMaterial.rotation = Number($event.target.value); render()" /></label>
    </div>
    <p v-if="exportNotice" class="notice-line">{{ exportNotice }}</p>
    <div class="signing-footer"><button class="btn btn-secondary" :disabled="saving" @click="cancel">{{ text.cancel }}</button><button class="btn btn-primary" :disabled="busy || !!notice || saving" @click="confirm">{{ text.confirm }}</button></div>
    <canvas ref="inkRef" class="signing-export-canvas"></canvas>
  </section>
</template>
<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, ref, reactive, watch } from 'vue';
import text from '@/locales/zh-CN/shared/auditSigning.js';
import { callApi, requireSuccess } from '@/runtime/api.js';
import { confirmAction } from '@/runtime/notify.js';
import { signingDrafts, restoreDraft } from '@/runtime/signingDrafts.js';
import { clone, normalizeColor, appendOperation, undo, redo, renderInk, renderViewportInk, surfaceSize, exportSize, penWidthRatio, alphaBounds, fitCamera, filePoint, clamp, signingLayers, moveLayer, renderStrokeLayer, renderViewportLayer, strokeExportRegion, inkExportGroups, groupExportRegion, renderExportGroup } from '@/shared/auditInk.js';
import { signatureGeometry } from '@/shared/auditSignatureGeometry.js';
import { auditRequests } from '@/runtime/auditRequests.js';
const requests = auditRequests();
const props = defineProps({ draft: {type:Object,required:true}, file: {type:Object,required:true}, initialMode: {type:String,default:'browse'}, active: {type:String,default:''}, pad: Boolean, rollback: Object, initialPreview: Object });
const emit = defineEmits(['confirm','cancel']);
const saved = clone(props.rollback || props.draft), fileDraft = reactive(signingDrafts.file(props.draft, props.file.id));
const modes = ['browse','move','pen'], presets = [{label:'black',value:'#000000'},{label:'blue',value:'#0000ff'},{label:'red',value:'#ff0000'}];
const mode=ref(props.initialMode), color=ref('#000000'), colorInput=ref('#000000'), penWidth=ref(2), erasing=ref(false), custom=ref(false);
const zoom=ref(1), page=ref(fileDraft.currentPage), totalPages=ref(1), busy=ref(true), notice=ref(''), exportNotice=ref(''), saving=ref(false), activeId=ref(props.active);
const stageRef=ref(null), surfaceRef=ref(null), inkRef=ref(null);
const channels=computed(()=>[1,3,5].map(offset=>parseInt(normalizeColor(color.value).slice(offset,offset+2),16)));
const channelLabels=[text.redChannel,text.greenChannel,text.blueChannel];
const materials=computed(()=>props.draft.materials.filter(item=>item.fileId===props.file.id));
const layers=computed(()=>signingLayers(fileDraft.history,materials.value,page.value));
const selectedLayer=ref('');
function reorderLayer(direction){const id=selectedLayer.value||layers.value[0]?.id;if(moveLayer(fileDraft.history,materials.value,page.value,id,direction)){selectedLayer.value=id;render();}}
const activeMaterial=computed(()=>materials.value.find(item=>item._idx===activeId.value));
const cache=new Map(), images=new Map(), loadedImages=new Map(), pointers=new Map();
let initialPreview=props.initialPreview;
let alive=true, sequence=0, observer=null, frame=null, gesture=null, stroke=null, panX=0, panY=0, current=null, camera=null, finished=false;
function applyColor(){ if(!/^#[0-9a-f]{6}$/i.test(colorInput.value)){exportNotice.value=text.colorInvalid;return;} color.value=normalizeColor(colorInput.value); erasing.value=false; exportNotice.value=''; }
function setChannel(index,value){ const next=channels.value.slice();next[index]=Number(value);color.value='#'+next.map(channel=>channel.toString(16).padStart(2,'0')).join('');colorInput.value=color.value;erasing.value=false; }
function imageOf(src){if(images.has(src))return images.get(src);const promise=new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>{loadedImages.set(src,image);resolve(image);};image.onerror=error=>{images.delete(src);reject(error);};image.src=src;});images.set(src,promise);return promise;}
async function pageData(number) {
  if(cache.has(number)) return cache.get(number);
  let value;
  if(props.pad){const canvas=document.createElement('canvas');canvas.width=800;canvas.height=400;const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,800,400);value={image:await imageOf(canvas.toDataURL()),width:800,height:400,total:1};}
  else {const prepared=initialPreview;initialPreview=null;const response=requireSuccess(prepared&&prepared.page===number?await prepared.promise:await requests.call('getAuditFilePreview',{fileId:props.file.id,page:number,previewMaxEdge:4096,previewFormat:'webp'}));if(!response.data || !String(response.previewMime).startsWith('image/'))throw Error('preview_unavailable');value={image:await imageOf('data:'+response.previewMime+';base64,'+response.data),width:response.pageWidth,height:response.pageHeight,total:response.totalPages};}
  value.width=value.width||value.image.width;value.height=value.height||value.image.height;
  if(!alive)throw Error('closed');
  cache.set(number,value);return value;
}
async function loadPage(number){
  const request=++sequence;busy.value=true;notice.value='';stroke=null;gesture=null;pointers.clear();
  try {
    const value=await pageData(number);
    if(!alive || request!==sequence)return;
    current=value;page.value=number;fileDraft.currentPage=number;totalPages.value=value.total||1;panX=0;panY=0;zoom.value=1;
    await nextTick();resize();
    await Promise.all(materials.value.map(item=>imageOf(item.previewSrc||item.imageData)));
    for(const material of materials.value){
      if(material.widthRatio!=null)continue;
      const image=loadedImages.get(material.previewSrc||material.imageData);
      const box=signatureGeometry(material,value.width,value.height,image.width,image.height,props.file.mimeType==='application/pdf');
      material.widthRatio=box.width/value.width;
    }
  }catch(_){if(alive && request===sequence){notice.value=text.failed;current=null;}}
  finally{if(alive && request===sequence){busy.value=false;render();}}
}
function resize(){if(!current || !surfaceRef.value || !stageRef.value)return;const rect=stageRef.value.getBoundingClientRect();const size=surfaceSize(rect.width,rect.height,window.devicePixelRatio);surfaceRef.value.width=size.width;surfaceRef.value.height=size.height;inkRef.value.width=size.width;inkRef.value.height=size.height;render();}
function render(){if(!alive || frame!==null)return;frame=requestAnimationFrame(()=>{frame=null;if(!current || !surfaceRef.value)return;const surface=surfaceRef.value,context=surface.getContext('2d'),ink=inkRef.value;const rect=surface.getBoundingClientRect(),ratio=surface.width/rect.width;camera=fitCamera(rect.width,rect.height,current.width,current.height,zoom.value,panX,panY);context.clearRect(0,0,surface.width,surface.height);context.save();context.scale(ratio,ratio);context.translate(camera.left,camera.top);context.scale(camera.width/current.width,camera.height/current.height);context.drawImage(current.image,0,0,current.width,current.height);
  context.restore();
  ink.getContext('2d').clearRect(0,0,ink.width,ink.height);
  const hasMaterials=layers.value.some((layer,index)=>layer.kind==='material'||index>0&&layers.value[index-1].index>layer.index);
  if(!hasMaterials){renderViewportInk(ink.getContext('2d'),fileDraft.history,page.value,ink.width,ink.height,camera,ratio,stroke);context.drawImage(ink,0,0);return;}
  for(const layer of layers.value){if(layer.kind==='draw'){renderViewportLayer(ink.getContext('2d'),fileDraft.history,layer,ink.width,ink.height,camera,ratio,stroke);context.drawImage(ink,0,0);continue;}const material=layer.material;const image=loadedImages.get(material.previewSrc||material.imageData);if(!image)continue;const geometry=signatureGeometry(material,current.width,current.height,image.width,image.height,props.file.mimeType==='application/pdf');if(material.widthRatio!=null){const x=geometry.centerX/current.width,y=geometry.centerY/current.height;if(Math.abs(material.positionX-x)>1e-8)material.positionX=x;if(Math.abs(material.positionY-y)>1e-8)material.positionY=y;}context.save();context.scale(ratio,ratio);context.translate(camera.left,camera.top);context.scale(camera.width/current.width,camera.height/current.height);context.translate(geometry.centerX,geometry.centerY);context.rotate((material.rotation||0)*Math.PI/180);context.drawImage(image,-geometry.width/2,-geometry.height/2,geometry.width,geometry.height);if(activeId.value===material._idx && mode.value==='move'){context.strokeStyle='#2563eb';context.lineWidth=2*current.width/camera.width;context.strokeRect(-geometry.width/2,-geometry.height/2,geometry.width,geometry.height);}context.restore();}
  if(stroke&&stroke.type==='draw'){renderViewportInk(ink.getContext('2d'),{operations:[],cursor:0},page.value,ink.width,ink.height,camera,ratio,stroke);context.drawImage(ink,0,0);}});}
function point(event){return filePoint(event.clientX,event.clientY,surfaceRef.value.getBoundingClientRect(),camera);}
function distance(){const values=Array.from(pointers.values());return Math.hypot(values[0].x-values[1].x,values[0].y-values[1].y);}
function midpoint(){const values=Array.from(pointers.values());return{x:(values[0].x+values[1].x)/2,y:(values[0].y+values[1].y)/2};}
function start(event){if(busy.value||notice.value||saving.value||!camera)return;event.preventDefault();surfaceRef.value.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pointers.size>1){stroke=null;gesture={kind:'pinch',distance:distance(),zoom:zoom.value,mid:midpoint(),panX,panY};render();return;}const p=point(event);if(!p.inside)return;const material=activeMaterial.value;gesture={kind:mode.value,x:event.clientX,y:event.clientY,panX,panY,point:p,moved:false,offsetX:material?p.x-material.positionX:0,offsetY:material?p.y-material.positionY:0};if(mode.value==='pen'){stroke={page:page.value,type:erasing.value?'erase':'draw',color:color.value,width:penWidthRatio(erasing.value?penWidth.value*5:penWidth.value,camera),points:[{x:p.x,y:p.y}]};render();}}
function move(event){if(!pointers.has(event.pointerId)||!gesture)return;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pointers.size>1){const mid=midpoint();zoom.value=clamp(gesture.zoom*distance()/Math.max(1,gesture.distance),1,4);panX=gesture.panX+mid.x-gesture.mid.x;panY=gesture.panY+mid.y-gesture.mid.y;render();return;}const p=point(event),g=gesture;g.moved=g.moved||Math.hypot(event.clientX-g.x,event.clientY-g.y)>3;if(g.kind==='pen'&&stroke){stroke.points.push({x:p.x,y:p.y});}else if(g.kind==='browse'){panX=g.panX+event.clientX-g.x;panY=g.panY+event.clientY-g.y;}else if(g.kind==='move'&&activeMaterial.value&&g.moved){activeMaterial.value.positionX=clamp(p.x-g.offsetX,0,1);activeMaterial.value.positionY=clamp(p.y-g.offsetY,0,1);}render();}
function end(event){if(!pointers.has(event.pointerId))return;if(pointers.size===1&&gesture){if(stroke){const p=point(event);stroke.points.push({x:p.x,y:p.y});appendOperation(fileDraft.history,stroke);}else if(gesture.kind==='move'&&!gesture.moved&&activeMaterial.value){const p=point(event);activeMaterial.value.positionX=p.x;activeMaterial.value.positionY=p.y;}}pointers.delete(event.pointerId);stroke=null;gesture=null;render();}
function cancelGesture(){pointers.clear();stroke=null;gesture=null;render();}
function wheel(event){if(!busy.value&&!notice.value)setZoom(zoom.value*(event.deltaY<0?1.1:1/1.1));}
function setZoom(value,fit){zoom.value=clamp(value,1,4);if(fit){panX=0;panY=0;}render();}
function resizeMaterial(value){const material=activeMaterial.value;if(!material)return;const size=Number(value)/100;if(material.widthRatio!=null)material.widthRatio=clamp(material.widthRatio*size/(material.size||1),0.00000001,1);material.size=size;render();}
async function changeHistory(forward){const target=(forward?redo:undo)(fileDraft.history);if(target===null)return;if(target!==page.value)await loadPage(target);else render();}
async function clearInk(){if(await confirmAction({title:text.clearTitle,body:text.clearBody,confirmText:text.clear,cancelText:text.cancel,danger:true})){if(!alive)return;appendOperation(fileDraft.history,{page:page.value,type:'clear'});render();}}
async function exportPages(){const exports=[];const pages=Array.from(new Set(fileDraft.history.operations.slice(0,fileDraft.history.cursor).map(operation=>operation.page)));for(const number of pages){const value=await pageData(number);for(const layer of (props.pad?[null]:inkExportGroups(fileDraft.history,props.draft.materials.filter(item=>item.fileId===props.file.id),number))){const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');const size=exportSize(value.width,value.height);const region=layer?groupExportRegion(layer,size.width,size.height):{left:0,top:0,width:size.width,height:size.height};canvas.width=region.width;canvas.height=region.height;if(layer)renderExportGroup(ctx,document.createElement('canvas'),fileDraft.history,layer,size.width,size.height,region);else renderInk(ctx,fileDraft.history,number,canvas.width,canvas.height);const bounds=alphaBounds(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);if(!bounds)continue;const crop=document.createElement('canvas');crop.width=bounds.width;crop.height=bounds.height;crop.getContext('2d').drawImage(canvas,bounds.left,bounds.top,bounds.width,bounds.height,0,0,bounds.width,bounds.height);const imageData=crop.toDataURL('image/png');if(imageData.length>Math.ceil(2*1024*1024*4/3)+64)throw Error('too_large');exports.push({_idx:'ink_'+props.file.id+'_'+(layer?layer.id:number),layerOrder:layer?layer.order:0,fileId:props.file.id,signatureType:'signature',imageData,widthRatio:bounds.width/size.width,positionX:(region.left+bounds.left+bounds.width/2)/size.width,positionY:(region.top+bounds.top+bounds.height/2)/size.height,size:1,rotation:0,page:number});}}return exports;}
async function confirm(){saving.value=true;exportNotice.value='';try{fileDraft.exports=await exportPages();if(props.pad&&!fileDraft.exports.length){exportNotice.value=text.empty;return;}finished=true;emit('confirm',fileDraft.exports);}catch(error){exportNotice.value=error.message==='too_large'?text.tooLarge:text.exportFailed;}finally{saving.value=false;}}
function cancel(){restoreDraft(props.draft,saved);finished=true;emit('cancel');}
onMounted(()=>{observer=new ResizeObserver(resize);observer.observe(stageRef.value);loadPage(page.value);});
watch([mode,activeId],()=>{cancelGesture();render();});
watch(materials,render,{deep:true});
watch(color,value=>{colorInput.value=value;});
onBeforeUnmount(()=>{alive=false;sequence+=1;requests.dispose();if(observer)observer.disconnect();if(frame!==null)cancelAnimationFrame(frame);if(!finished)restoreDraft(props.draft,saved);pointers.clear();});
</script>
<style scoped>
.signing-layer-toolbar{flex-wrap:nowrap}
.signing-layer-toolbar .field{flex:1;min-width:0;flex-direction:row;align-items:center}
.signing-layer-toolbar .field-input{min-width:0;min-height:var(--ui-signing-tool-height);padding:var(--ui-signing-tool-gap)}
.signing-layer-toolbar .field-label,.signing-width .field-label{flex:none;white-space:nowrap}
.signing-workspace{display:flex;flex:1;min-height:0;flex-direction:column;gap:var(--ui-signing-tool-gap);padding:var(--ui-signing-tool-gap)}
.signing-workspace .panel-head{margin:0;flex:none}
.signing-workspace .tabs{margin:0;flex:none;min-height:0;padding:var(--ui-signing-tool-gap)}
.signing-workspace .tab{min-height:var(--ui-signing-tool-height);padding:var(--ui-signing-tool-gap);font-size:var(--ui-type-meta)}
.signing-toolbar,.signing-objects{display:flex;flex:none;align-items:center;flex-wrap:wrap;gap:var(--ui-signing-tool-gap)}
.signing-actions{display:grid;grid-template-columns:repeat(6,minmax(0,1fr))}
.signing-toolbar .btn-quiet{min-width:0;min-height:var(--ui-signing-tool-height);padding:var(--ui-signing-tool-gap);border-radius:var(--ui-compact-radius)}
.signing-palette{flex-wrap:nowrap}
.signing-color{flex:1}
.signing-swatch{width:var(--ui-signing-swatch-size);height:var(--ui-signing-swatch-size);border-radius:var(--ui-compact-radius)}
.signing-color[aria-pressed=true]{border-color:var(--ui-blue-700);background:var(--ui-option-selected-bg)}
.signing-width{display:flex;flex-direction:row;align-items:center;gap:var(--ui-signing-tool-gap)}
.signing-width .field-input{min-width:0;min-height:var(--ui-signing-tool-height);padding:var(--ui-signing-tool-gap)}
.signing-width{min-width:0;max-width:var(--ui-signing-width-control)}
.signing-stage{position:relative;flex:1;min-height:var(--ui-signing-stage-min-height);width:100%;overflow:hidden;border-radius:var(--ui-field-radius);background:var(--ui-field-bg)}
.signing-stage canvas{display:block;width:100%;height:100%;touch-action:none}
.signing-stage-state{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;background:var(--ui-field-bg)}
.signing-footer{display:grid;flex:none;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--ui-action-gap)}
.signing-export-canvas{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.signing-color-panel{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--ui-field-gap)}
</style>
