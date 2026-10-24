<template>
  <section class="card signing-workspace">
    <div class="signing-main">
    <div class="signing-topbar">
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
      <button class="btn-quiet" :aria-label="text.tools" :aria-expanded="toolsExpanded" @click="toolsExpanded = !toolsExpanded; layersExpanded = false">✎</button>
    </div>
    </div>
    <div v-if="toolsExpanded" class="signing-toolpanel">
    <div class="signing-panel-heading"><span>{{ text.tools }}</span><button class="btn-quiet" :aria-label="text.closeTools" @click="toolsExpanded = false">×</button></div>
    <div v-if="mode === 'pen' || mode === 'move'" class="signing-toolbar signing-palette" role="toolbar" :aria-label="text.color">
      <button v-for="preset in presets" :key="preset.value" class="btn-quiet signing-color" :aria-label="text[preset.label]" :title="text[preset.label]" :aria-pressed="!erasing && color === preset.value" @click="color = preset.value; erasing = false"><span class="signing-swatch" :style="{backgroundColor:preset.value}"></span></button>
      <button class="btn-quiet signing-color" :aria-label="text.custom" :title="text.custom" :aria-expanded="custom" @click="custom = !custom">#</button>
      <button class="btn-quiet" :aria-pressed="erasing" @click="erasing = !erasing">{{ text.erase }}</button>
      <label class="field signing-width"><span class="field-label">{{ erasing ? text.eraserWidth : text.width }}</span><select v-model.number="penWidth" class="field-input"><option :value="1">{{ text.thin }}</option><option :value="2">{{ text.medium }}</option><option :value="3.5">{{ text.thick }}</option></select></label>
    </div>
    <div v-if="custom && (mode === 'pen' || mode === 'move')" class="signing-color-panel">
      <label class="field"><span class="field-label">{{ text.hex }}</span><input v-model="colorInput" class="field-input" maxlength="7" @change="applyColor" /></label>
      <label v-for="(label,index) in channelLabels" :key="label" class="field"><span class="field-label">{{ label }}</span><input :value="channels[index]" type="range" min="0" max="255" @input="setChannel(index,$event.target.value)" /></label>
    </div>
    <button v-if="activeId && (!activeMaterial || activeMaterial.signatureType==='signature')" class="btn-quiet" :disabled="busy || saving" @click="recolorSelected">{{ text.recolor }}</button>
    </div>
    <div class="signing-stage" ref="stageRef">
      <canvas ref="surfaceRef" :aria-label="text.title" @pointerdown="start" @pointermove="move" @pointerup="end" @pointercancel="cancelGesture" @lostpointercapture="end" @wheel.prevent="wheel"></canvas>
      <div v-if="busy || notice" class="signing-stage-state"><AppLoading v-if="busy" :text="text.loading" /><p v-else>{{ notice }}</p><button v-if="notice && !busy" class="btn-quiet" @click="loadPage(page)">{{ text.retry }}</button></div>
    </div>
    </div>
    <div v-if="layersExpanded" class="signing-sidepanel">
    <div class="signing-toolbar signing-layer-toolbar">
      <div class="signing-layer-heading">{{ text.layers }}<span class="muted">{{ layers.length }}</span></div>
      <button class="btn-quiet" :aria-label="text.layerUp" :title="text.layerUp" :disabled="busy || saving || displayLayers.findIndex(layer=>layer.id===(selectedLayer||displayLayers[0]?.id))<=0" @click="reorderLayer(1)">↑</button>
      <button class="btn-quiet" :aria-label="text.layerDown" :title="text.layerDown" :disabled="busy || saving || displayLayers.findIndex(layer=>layer.id===(selectedLayer||displayLayers[0]?.id))>=displayLayers.length-1" @click="reorderLayer(-1)">↓</button>
      <button class="btn-quiet btn-quiet-danger" :aria-label="text.remove" :disabled="busy || saving || !layers.length" @click="removeLayer">×</button>
    </div>
    <div class="signing-layer-strip" role="listbox" :aria-label="text.layers">
      <div v-for="(layer,index) in displayLayers" :key="layer.id" class="signing-layer-item" role="option" :aria-selected="(selectedLayer || displayLayers[0]?.id) === layer.id" :aria-label="layerName(layer)" :tabindex="busy || saving ? -1 : 0" @click="chooseLayer(layer.id)" @keydown.enter.prevent="chooseLayer(layer.id)" @keydown.space.prevent="chooseLayer(layer.id)">
        <div class="signing-layer-preview"><div class="signing-layer-sheet"><span>{{ layer.kind === 'draw' ? '✎' : '◎' }}</span></div><span class="signing-layer-rank">{{ index + 1 }}</span></div>
        <span class="signing-layer-name" :title="layerName(layer)">{{ layerName(layer) }}</span>
      </div>
    </div>
    <div v-if="mode === 'move' && activeMaterial" class="signing-adjustments">
      <label class="field"><span class="signing-adjustment-label"><span>{{ text.size }}</span><span>{{ Math.round(displayedSize*100) }}%</span></span><input :aria-label="text.size" type="range" min="50" max="220" step="5" :disabled="busy || saving" :value="displayedSize*100" @input="previewAdjustment('size',$event.target.value/100)" @pointercancel="cancelAdjustment" @change="resizeMaterial($event.target.value)" /></label>
      <label class="field"><span class="signing-adjustment-label"><span>{{ text.rotation }}</span><span>{{ displayedRotation }}°</span></span><input :aria-label="text.rotation" type="range" min="-180" max="180" step="5" :disabled="busy || saving" :value="displayedRotation" @input="previewAdjustment('rotation',$event.target.value)" @pointercancel="cancelAdjustment" @change="rotateMaterial($event.target.value)" /></label>
    </div>
    </div>
    <div class="signing-bottom-bar">
    <button class="btn-quiet" :aria-expanded="layersExpanded" @click="layersExpanded = !layersExpanded; toolsExpanded = false">{{ text.adjustLayers }} {{ layers.length }}</button>
    <div class="signing-toolbar" v-if="totalPages > 1"><button class="btn-quiet" :disabled="page <= 1 || busy" @click="loadPage(page - 1)">◀</button><span>{{ page }} / {{ totalPages }}</span><button class="btn-quiet" :disabled="page >= totalPages || busy" @click="loadPage(page + 1)">▶</button></div>
    <p v-if="exportNotice" class="notice-line">{{ exportNotice }}</p>
    <label v-if="allowSaveTemplate" class="selection-option-card"><input type="checkbox" v-model="saveTemplate" :disabled="saving" />{{ text.saveToLibrary }}</label>
    <div class="signing-footer"><button class="btn btn-secondary" :disabled="saving" @click="cancel">{{ text.cancel }}</button><button class="btn btn-primary" :disabled="busy || !!notice || saving" @click="confirm">{{ text.confirm }}</button></div>
    </div>
    <canvas ref="inkRef" class="signing-export-canvas"></canvas>
  </section>
</template>
<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, ref, reactive, watch } from 'vue';
import text from '@/locales/zh-CN/shared/auditSigning.js';
import { callApi, requireSuccess } from '@/runtime/api.js';
import { confirmAction } from '@/runtime/notify.js';
import { signingDrafts, restoreDraft } from '@/runtime/signingDrafts.js';
import { signingAssets } from '@/runtime/signingAssets.js';
import { nextLayerOrder, updateMaterial, deleteLayer, clone, normalizeColor, appendOperation, undo, redo, renderInk, renderViewportInk, surfaceSize, exportSize, penWidthRatio, alphaBounds, fitCamera, filePoint, pinchPan, clamp, signingLayers, moveLayer, renderStrokeLayer, renderViewportLayer, strokeExportRegion, inkExportGroups, groupExportRegion, renderExportGroup } from '@/shared/auditInk.js';
import { recolorLayer, blankPageSize, pageWidthMm, signatureWidthMm, withSignatureWidth, signatureWidthRatio } from '@/shared/auditInk.js';
import { signatureGeometry } from '@/shared/auditSignatureGeometry.js';
import { auditRequests } from '@/runtime/auditRequests.js';
const requests = auditRequests();
const props = defineProps({ draft: {type:Object,required:true}, file: {type:Object,required:true}, initialMode: {type:String,default:'browse'}, active: {type:String,default:''}, pad: Boolean, allowSaveTemplate: Boolean, rollback: Object, initialPreview: Object });
const saveTemplate=ref(false);
const toolsExpanded=ref(false), layersExpanded=ref(false);
const emit = defineEmits(['confirm','cancel']);
const entryLayerId = 'entry_' + nextLayerOrder();
const saved = clone(props.rollback || props.draft), fileDraft = reactive(signingDrafts.file(props.draft, props.file.id));
const modes = ['browse','move','pen'], presets = [{label:'black',value:'#000000'},{label:'blue',value:'#0000ff'},{label:'red',value:'#ff0000'}];
const mode=ref(props.initialMode), color=ref('#000000'), colorInput=ref('#000000'), penWidth=ref(2), erasing=ref(false), custom=ref(false);
const zoom=ref(1), page=ref(fileDraft.currentPage), totalPages=ref(1), busy=ref(true), notice=ref(''), exportNotice=ref(''), saving=ref(false), activeId=ref(props.active);
const stageRef=ref(null), surfaceRef=ref(null), inkRef=ref(null);
const channels=computed(()=>[1,3,5].map(offset=>parseInt(normalizeColor(color.value).slice(offset,offset+2),16)));
const channelLabels=[text.redChannel,text.greenChannel,text.blueChannel];
const materials=computed(()=>props.draft.materials.filter(item=>item.fileId===props.file.id).sort((a,b)=>a.layerOrder-b.layerOrder));
const layers=computed(()=>signingLayers(fileDraft.history,materials.value,page.value));
const displayLayers=computed(()=>layers.value.slice().reverse());
const selectedLayer=ref(props.active);
const layerName=layer=>layer.kind==='draw'?text.stroke+' '+layer.number:layer.material.stampName||text.signature;
function chooseLayer(id){if(busy.value||saving.value)return;activeId.value=id;selectedLayer.value=id;}
function removeLayer(){if(busy.value||saving.value)return;const id=selectedLayer.value||displayLayers.value[0]?.id;deleteLayer(fileDraft.history,props.draft.materials,page.value,id);render();}
function reorderLayer(direction){if(busy.value||saving.value)return;const id=selectedLayer.value||displayLayers.value[0]?.id;if(moveLayer(fileDraft.history,materials.value,page.value,id,direction)){selectedLayer.value=id;render();}}
const adjustment=ref(null);
const displayedSize=computed(()=>adjustment.value?.values.size ?? activeMaterial.value?.size ?? 1);
const displayedRotation=computed(()=>adjustment.value?.values.rotation ?? activeMaterial.value?.rotation ?? 0);
function previewAdjustment(key,value){const material=activeMaterial.value;if(!material||busy.value||saving.value)return;const values={[key]:Number(value)};if(key==='size'&&material.widthRatio!=null)values.widthRatio=clamp(material.widthRatio*values.size/(material.size||1),0.00000001,1);adjustment.value={id:material._idx,values};render();}
function cancelAdjustment(){adjustment.value=null;render();}
const activeMaterial=computed(()=>materials.value.find(item=>item._idx===activeId.value));
async function recolorSelected(){
  if(busy.value||saving.value)return;
  if(recolorLayer(fileDraft.history,props.draft.materials,page.value,activeId.value,color.value)){render();return;}
  const material=activeMaterial.value;if(!material||material.signatureType!=='signature')return;
  saving.value=true;
  try {
    const image=await imageOf(material.previewSrc||material.imageData),canvas=document.createElement('canvas');
    canvas.width=image.width;canvas.height=image.height;
    const context=canvas.getContext('2d');context.drawImage(image,0,0);context.globalCompositeOperation='source-in';context.fillStyle=color.value;context.fillRect(0,0,canvas.width,canvas.height);
    const millimeters=signatureWidthMm(material.imageData);
    const raw=canvas.toDataURL('image/png'),imageData=millimeters===null?raw:withSignatureWidth(raw,millimeters);if(imageData.length>Math.ceil(2*1024*1024*4/3)+64)throw Error('too_large');
    await imageOf(imageData);if(!alive)return;
    updateMaterial(fileDraft.history,props.draft.materials,material._idx,{imageData,previewSrc:null});render();
  }catch(error){exportNotice.value=error.message==='too_large'?text.tooLarge:text.exportFailed;}
  finally{saving.value=false;}
}
const loadedImages=new Map(), pointers=new Map();
let alive=true, sequence=0, observer=null, frame=null, gesture=null, stroke=null, panX=0, panY=0, current=null, camera=null, finished=false;
function applyColor(){ if(!/^#[0-9a-f]{6}$/i.test(colorInput.value)){exportNotice.value=text.colorInvalid;return;} color.value=normalizeColor(colorInput.value); erasing.value=false; exportNotice.value=''; }
function setChannel(index,value){ const next=channels.value.slice();next[index]=Number(value);color.value='#'+next.map(channel=>channel.toString(16).padStart(2,'0')).join('');colorInput.value=color.value;erasing.value=false; }
function imageOf(src){return signingAssets.image(props.draft,src).then(image=>{loadedImages.set(src,image);return image;});}
async function pageData(number) {
  let value;
  if(props.pad){const size=blankPageSize(fileDraft,surfaceRef.value.getBoundingClientRect());const canvas=document.createElement('canvas');canvas.width=Math.ceil(size.width);canvas.height=Math.ceil(size.height);const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);value={image:await imageOf(canvas.toDataURL()),width:size.width,height:size.height,total:1};}
  else {const prepared=await signingAssets.preview(props.draft,props.file,number);const response=prepared.response;value={image:prepared.image,width:response.pageWidth,height:response.pageHeight,total:response.totalPages};}
  value.width=value.width||value.image.width;value.height=value.height||value.image.height;
  if(!alive)throw Error('closed');
  return value;
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
      const widthRatio=material.signatureType==='signature'?signatureWidthRatio(material.imageData,{width:value.width,height:value.height,pdf:props.file.mimeType==='application/pdf'},material.size):null;
      const box=signatureGeometry(widthRatio===null?material:{...material,widthRatio},value.width,value.height,image.width,image.height,props.file.mimeType==='application/pdf');
      material.widthRatio=box.width/value.width;
    }
  }catch(_){if(alive && request===sequence){notice.value=text.failed;current=null;}}
  finally{if(alive && request===sequence){busy.value=false;render();}}
}
function resize(){render();}
function render(){if(!alive || frame!==null)return;frame=requestAnimationFrame(()=>{frame=null;if(!current || !surfaceRef.value)return;const surface=surfaceRef.value,context=surface.getContext('2d'),ink=inkRef.value;const rect=surface.getBoundingClientRect();if(!(rect.width>0&&rect.height>0))return;if(props.pad&&!stroke){const blank=blankPageSize(fileDraft,rect);current.width=blank.width;current.height=blank.height;}const size=surfaceSize(rect.width,rect.height,window.devicePixelRatio),ratio=size.ratio;for(const canvas of [surface,ink]){if(canvas.width!==size.width)canvas.width=size.width;if(canvas.height!==size.height)canvas.height=size.height;}camera=fitCamera(rect.width,rect.height,current.width,current.height,zoom.value,panX,panY);context.clearRect(0,0,surface.width,surface.height);context.save();context.scale(ratio,ratio);context.translate(camera.left,camera.top);context.scale(camera.width/current.width,camera.height/current.height);context.drawImage(current.image,0,0,current.width,current.height);
  context.restore();
  ink.getContext('2d').clearRect(0,0,ink.width,ink.height);
  const hasMaterials=layers.value.some((layer,index)=>layer.kind==='material'||index>0&&layers.value[index-1].index>layer.index);
  if(!hasMaterials){renderViewportInk(ink.getContext('2d'),fileDraft.history,page.value,ink.width,ink.height,camera,ratio,stroke);context.drawImage(ink,0,0);return;}
  for(const layer of layers.value){if(layer.kind==='draw'){renderViewportLayer(ink.getContext('2d'),fileDraft.history,layer,ink.width,ink.height,camera,ratio,stroke);context.drawImage(ink,0,0);continue;}const material=adjustment.value?.id===layer.material._idx?{...layer.material,...adjustment.value.values}:layer.material;const image=loadedImages.get(material.previewSrc||material.imageData);if(!image)continue;const geometry=signatureGeometry(material,current.width,current.height,image.width,image.height,props.file.mimeType==='application/pdf');if(material.widthRatio!=null){const x=geometry.centerX/current.width,y=geometry.centerY/current.height;if(Math.abs(material.positionX-x)>1e-8)material.positionX=x;if(Math.abs(material.positionY-y)>1e-8)material.positionY=y;}context.save();context.scale(ratio,ratio);context.translate(camera.left,camera.top);context.scale(camera.width/current.width,camera.height/current.height);context.translate(geometry.centerX,geometry.centerY);context.rotate((material.rotation||0)*Math.PI/180);context.drawImage(image,-geometry.width/2,-geometry.height/2,geometry.width,geometry.height);if(activeId.value===material._idx && mode.value==='move'){context.strokeStyle='#2563eb';context.lineWidth=2*current.width/camera.width;context.strokeRect(-geometry.width/2,-geometry.height/2,geometry.width,geometry.height);}context.restore();}
  if(stroke&&stroke.type==='draw'&&!layers.value.some(layer=>layer.id===stroke.layerId)){renderViewportInk(ink.getContext('2d'),{operations:[],cursor:0},page.value,ink.width,ink.height,camera,ratio,stroke);context.drawImage(ink,0,0);}});}
function point(event){return filePoint(event.clientX,event.clientY,surfaceRef.value.getBoundingClientRect(),camera);}
function distance(){const values=Array.from(pointers.values());return Math.hypot(values[0].x-values[1].x,values[0].y-values[1].y);}
function midpoint(){const values=Array.from(pointers.values());return{x:(values[0].x+values[1].x)/2,y:(values[0].y+values[1].y)/2};}
function start(event){if(busy.value||notice.value||saving.value||!camera)return;event.preventDefault();surfaceRef.value.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pointers.size>1){finishMove(false);stroke=null;gesture={kind:'pinch',distance:distance(),zoom:zoom.value,midX:midpoint().x,midY:midpoint().y,panX,panY};render();return;}const p=point(event);if(!p.inside)return;const material=activeMaterial.value;gesture={material:material?{id:material._idx,positionX:material.positionX,positionY:material.positionY}:null,kind:mode.value,x:event.clientX,y:event.clientY,panX,panY,point:p,moved:false,offsetX:material?p.x-material.positionX:0,offsetY:material?p.y-material.positionY:0};if(mode.value==='pen'){stroke={layerId:entryLayerId,page:page.value,type:erasing.value?'erase':'draw',color:color.value,width:penWidthRatio(penWidth.value,{width:current.width,height:current.height,pdf:props.file.mimeType==='application/pdf',pad:props.pad})*(erasing.value?5:1),points:[{x:p.x,y:p.y}]};render();}}
function move(event){if(!pointers.has(event.pointerId)||!gesture)return;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pointers.size>1){const mid=midpoint();zoom.value=clamp(gesture.zoom*distance()/Math.max(1,gesture.distance),1,16);const pan=pinchPan(surfaceRef.value.getBoundingClientRect(),gesture,zoom.value,mid.x,mid.y);panX=pan.x;panY=pan.y;render();return;}const p=point(event),g=gesture;g.moved=g.moved||Math.hypot(event.clientX-g.x,event.clientY-g.y)>3;if(g.kind==='pen'&&stroke){stroke.points.push({x:p.x,y:p.y});}else if(g.kind==='browse'){panX=g.panX+event.clientX-g.x;panY=g.panY+event.clientY-g.y;}else if(g.kind==='move'&&activeMaterial.value&&g.moved){activeMaterial.value.positionX=clamp(p.x-g.offsetX,0,1);activeMaterial.value.positionY=clamp(p.y-g.offsetY,0,1);}render();}
function finishMove(commit){
  const old=gesture&&gesture.material, material=old&&props.draft.materials.find(item=>item._idx===old.id);
  if(!material||gesture.kind!=='move')return;
  const values={positionX:material.positionX,positionY:material.positionY,page:page.value};
  material.positionX=old.positionX;material.positionY=old.positionY;
  if(commit)commitMaterial(material,values);
}
function end(event){if(!pointers.has(event.pointerId))return;if(pointers.size===1&&gesture){if(stroke){const p=point(event);stroke.points.push({x:p.x,y:p.y});appendOperation(fileDraft.history,stroke);}else if(gesture.kind==='move'&&activeMaterial.value){if(!gesture.moved){const p=point(event);activeMaterial.value.positionX=p.x;activeMaterial.value.positionY=p.y;}finishMove(true);}}pointers.delete(event.pointerId);stroke=null;gesture=null;render();}
function cancelGesture(){finishMove(false);pointers.clear();stroke=null;gesture=null;render();}
function wheel(event){if(!busy.value&&!notice.value)setZoom(zoom.value*(event.deltaY<0?1.1:1/1.1));}
function setZoom(value,fit){zoom.value=clamp(value,1,16);if(fit){panX=0;panY=0;}render();}
function commitMaterial(material,values){
  const image=loadedImages.get(material.previewSrc||material.imageData);
  if(image&&current){const box=signatureGeometry({...material,...values},current.width,current.height,image.width,image.height,props.file.mimeType==='application/pdf');values.positionX=box.centerX/current.width;values.positionY=box.centerY/current.height;}
  updateMaterial(fileDraft.history,props.draft.materials,material._idx,values);
}
function resizeMaterial(value){adjustment.value=null;const material=activeMaterial.value;if(!material)return;const size=Number(value)/100,values={size};if(material.widthRatio!=null)values.widthRatio=clamp(material.widthRatio*size/(material.size||1),0.00000001,1);commitMaterial(material,values);render();}
function rotateMaterial(value){adjustment.value=null;if(activeMaterial.value)commitMaterial(activeMaterial.value,{rotation:Number(value)});render();}
async function changeHistory(forward){if(busy.value||saving.value)return;const target=(forward?redo:undo)(fileDraft.history,props.draft.materials);if(target===null)return;if(target!==page.value)await loadPage(target);else render();}
async function clearInk(){if(busy.value||saving.value)return;if(await confirmAction({title:text.clearTitle,body:text.clearBody,confirmText:text.clear,cancelText:text.cancel,danger:true})){if(!alive||busy.value||saving.value)return;appendOperation(fileDraft.history,{page:page.value,type:'clear'});render();}}
async function exportPages(){const exports=[];const pages=Array.from(new Set(fileDraft.history.operations.slice(0,fileDraft.history.cursor).map(operation=>operation.page)));for(const number of pages){const value=await pageData(number);for(const layer of (props.pad?[null]:inkExportGroups(fileDraft.history,props.draft.materials.filter(item=>item.fileId===props.file.id),number))){const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');const size=exportSize(value.width,value.height);const region=layer?groupExportRegion(layer,size.width,size.height):{left:0,top:0,width:size.width,height:size.height};canvas.width=region.width;canvas.height=region.height;if(layer)renderExportGroup(ctx,document.createElement('canvas'),fileDraft.history,layer,size.width,size.height,region);else renderInk(ctx,fileDraft.history,number,canvas.width,canvas.height);const bounds=alphaBounds(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);if(!bounds)continue;const crop=document.createElement('canvas');crop.width=bounds.width;crop.height=bounds.height;crop.getContext('2d').drawImage(canvas,bounds.left,bounds.top,bounds.width,bounds.height,0,0,bounds.width,bounds.height);const raw=crop.toDataURL('image/png'),imageData=props.pad?withSignatureWidth(raw,pageWidthMm({pad:true})*bounds.width/size.width):raw;if(imageData.length>Math.ceil(2*1024*1024*4/3)+64)throw Error('too_large');exports.push({_idx:'ink_'+props.file.id+'_'+(layer?layer.id+'_page_'+number:number),inkLayerId:layer?layer.id:'',layerOrder:layer?layer.order:0,fileId:props.file.id,signatureType:'signature',imageData,widthRatio:bounds.width/size.width,positionX:(region.left+bounds.left+bounds.width/2)/size.width,positionY:(region.top+bounds.top+bounds.height/2)/size.height,size:1,rotation:0,page:number});}}return exports;}
async function confirm(){saving.value=true;exportNotice.value='';try{fileDraft.exports=await exportPages();if(props.pad&&!fileDraft.exports.length){exportNotice.value=text.empty;return;}if(props.allowSaveTemplate&&saveTemplate.value)requireSuccess(await requests.call('saveSignature',{id:'',name:text.signature,imageData:fileDraft.exports[0].imageData}));if(!alive)return;finished=true;emit('confirm',fileDraft.exports);}catch(error){exportNotice.value=error.message==='too_large'?text.tooLarge:text.exportFailed;}finally{saving.value=false;}}
function cancel(){restoreDraft(props.draft,saved);finished=true;emit('cancel');}
onMounted(()=>{observer=new ResizeObserver(resize);observer.observe(stageRef.value);loadPage(page.value);});
watch([mode,activeId],()=>{cancelAdjustment();cancelGesture();render();});
watch(materials,render,{deep:true});
watch(displayLayers,value=>{if(!value.some(layer=>layer.id===selectedLayer.value))selectedLayer.value=value[0]?.id||'';});
watch(color,value=>{colorInput.value=value;});
onBeforeUnmount(()=>{alive=false;sequence+=1;requests.dispose();if(observer)observer.disconnect();if(frame!==null)cancelAnimationFrame(frame);if(!finished)restoreDraft(props.draft,saved);pointers.clear();});
</script>
<style scoped>
.signing-main{display:contents}
.signing-sidepanel{display:flex;flex:none;min-width:0;flex-direction:column;gap:var(--ui-signing-tool-gap)}
.signing-layer-toolbar{flex-wrap:nowrap}
.signing-layer-actions{display:flex;justify-content:flex-end;flex:none}
.signing-layer-toolbar .field{flex:1;min-width:0;flex-direction:row;align-items:center}
.signing-layer-toolbar .field-input{min-width:0;min-height:var(--ui-signing-tool-height);padding:var(--ui-signing-tool-gap)}
.signing-layer-toolbar .field-label,.signing-width .field-label{flex:none;white-space:nowrap}
.signing-workspace{position:relative;display:grid;flex:1 1 0;min-height:0;grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(120px,1fr) auto;gap:var(--ui-signing-tool-gap);padding:var(--ui-signing-tool-gap)}
.signing-workspace .panel-head{margin:0;flex:none}
.signing-workspace .tabs{margin:0;flex:none;min-height:0;padding:0}
.signing-workspace .tab{min-height:var(--ui-signing-tool-height);padding:var(--ui-signing-tool-gap);font-size:var(--ui-type-meta)}
.signing-toolbar,.signing-objects{display:flex;flex:none;align-items:center;flex-wrap:wrap;gap:var(--ui-signing-tool-gap)}
.signing-actions{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}
.signing-toolbar .btn-quiet{min-width:0;min-height:var(--ui-signing-tool-height);padding:var(--ui-signing-tool-gap);border-radius:var(--ui-compact-radius)}
.signing-palette{flex-wrap:nowrap}
.signing-color{flex:1}
.signing-swatch{width:var(--ui-signing-swatch-size);height:var(--ui-signing-swatch-size);border-radius:var(--ui-compact-radius)}
.signing-color[aria-pressed=true]{border-color:var(--ui-blue-700);background:var(--ui-option-selected-bg)}
.signing-width{display:flex;flex-direction:row;align-items:center;gap:var(--ui-signing-tool-gap)}
.signing-width .field-input{min-width:0;min-height:var(--ui-signing-tool-height);padding:var(--ui-signing-tool-gap)}
.signing-width{min-width:0;max-width:var(--ui-signing-width-control)}
.signing-stage{position:relative;flex:1 1 0;min-height:var(--ui-signing-stage-min-height);width:100%;overflow:hidden;border-radius:var(--ui-field-radius);background:var(--ui-option-selected-bg);box-shadow:inset 0 0 0 2px var(--ui-blue-500)}
.signing-stage canvas{position:absolute;inset:0;display:block;width:100%;height:100%;touch-action:none}
.signing-stage-state{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;background:var(--ui-field-bg)}
.signing-footer{padding-top:var(--ui-signing-control-gap);border-top:var(--ui-result-label-border);display:grid;flex:none;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--ui-action-gap)}
.signing-export-canvas{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.signing-color-panel{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--ui-field-gap)}
.signing-color-panel input[type=range]{height:var(--ui-signing-slider-height);margin:0;padding:0 var(--ui-signing-control-gap);touch-action:pan-x}
.signing-layer-toolbar .btn-quiet{min-width:var(--ui-control-height)}
.signing-layer-toolbar .btn-quiet,.signing-layer-toolbar .field-input{min-height:var(--ui-control-height)}
.signing-layer-heading{display:flex;flex:1;align-items:center;gap:var(--ui-inline-gap);font-size:var(--ui-type-label)}
.signing-layer-strip{display:flex;flex:none;gap:var(--ui-signing-control-gap);height:var(--ui-signing-layer-height);overflow-x:auto;overflow-y:hidden;padding:var(--ui-signing-tool-gap);box-sizing:border-box}
.signing-layer-item{flex:0 0 auto;min-width:var(--ui-signing-layer-width);padding:var(--ui-signing-tool-gap);box-sizing:border-box;border-bottom:2px solid transparent;cursor:pointer}
.signing-layer-item[aria-selected=true]{border-bottom-color:var(--ui-blue-700);background:var(--ui-option-selected-bg)}
.signing-layer-preview{position:relative;display:flex;justify-content:center;height:var(--ui-signing-preview-height)}
.signing-layer-sheet{display:flex;align-items:center;justify-content:center;width:var(--ui-signing-sheet-width);height:var(--ui-signing-sheet-height);border:var(--ui-result-label-border);background:var(--ui-field-bg);box-shadow:var(--ui-signing-sheet-shadow);color:var(--ui-text-muted);font-size:var(--ui-type-emphasis)}
.signing-layer-item[aria-selected=true] .signing-layer-sheet{border-color:var(--ui-blue-700);color:var(--ui-blue-700)}
.signing-layer-rank{position:absolute;right:0;bottom:0;font-size:var(--ui-type-micro);color:var(--ui-text-muted)}
.signing-layer-name{display:block;white-space:nowrap;text-align:center;font-size:var(--ui-type-meta);line-height:var(--ui-leading-body)}
.signing-adjustments{display:grid;flex:none;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--ui-signing-adjustment-gap);padding:var(--ui-signing-control-gap);border-top:var(--ui-result-label-border)}
.signing-adjustments .field{min-width:0;gap:0}
.signing-adjustment-label{display:flex;align-items:center;justify-content:space-between;gap:var(--ui-inline-gap);font-size:var(--ui-type-label)}
.signing-adjustments input[type=range]{display:block;box-sizing:border-box;width:100%;height:var(--ui-signing-slider-height);margin:0;padding:0 var(--ui-signing-control-gap);touch-action:pan-x;accent-color:var(--ui-blue-700)}
.signing-topbar{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,7fr);gap:var(--ui-signing-control-gap);flex:none}
.signing-stage,.signing-toolpanel,.signing-sidepanel{grid-column:1;grid-row:2;min-height:0}
.signing-topbar{grid-column:1;grid-row:1}
.signing-bottom-bar{grid-column:1;grid-row:3}
.signing-toolpanel,.signing-sidepanel{position:relative;z-index:4;width:min(360px,96%);overflow:auto;padding:var(--ui-signing-control-gap);box-sizing:border-box;background:var(--ui-card-bg);border:var(--ui-result-label-border);border-radius:var(--ui-field-radius);box-shadow:var(--ui-card-shadow);backdrop-filter:blur(12px)}
.signing-toolpanel{justify-self:start}
.signing-sidepanel{justify-self:end}
.signing-panel-heading{display:flex;align-items:center;justify-content:space-between;gap:var(--ui-signing-tool-gap);margin-bottom:var(--ui-signing-control-gap)}
.signing-bottom-bar{display:flex;align-items:center;flex:none;gap:var(--ui-signing-control-gap);flex-wrap:wrap}
.signing-bottom-bar .selection-option-card{padding:var(--ui-signing-tool-gap);min-height:var(--ui-signing-tool-height);font-size:var(--ui-type-meta)}
.signing-footer{margin-left:auto;padding:0;border:0;gap:var(--ui-signing-control-gap)}
.signing-footer .btn{min-height:var(--ui-signing-tool-height);padding:var(--ui-signing-tool-gap) var(--ui-signing-control-gap);font-size:var(--ui-type-meta)}
.signing-bottom-bar .notice-line{position:absolute;bottom:var(--ui-control-height);background:var(--ui-card-bg)}
@media(max-width:519px){.signing-topbar{grid-template-columns:minmax(0,1fr)}}
</style>
