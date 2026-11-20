<template>
  <section class="signing-workspace">
    <div class="signing-topbar">
    <div class="tabs" role="tablist">
      <button v-for="value in modes" :key="value" class="tab" :class="{'tab-active': mode === value}" :aria-selected="mode === value" role="tab" @click="mode = value">{{ text[value] }}</button>
    </div>
    <div class="signing-toolbar signing-actions" role="toolbar" :aria-label="text.title">
      <button class="btn-quiet" :disabled="!fileDraft.history.cursor || busy" @click="changeHistory(false)">{{ text.undo }}</button>
      <button class="btn-quiet" :disabled="fileDraft.history.cursor >= fileDraft.history.operations.length || busy" @click="changeHistory(true)">{{ text.redo }}</button>
      <button class="btn-quiet" :aria-label="text.clear" :title="text.clear" :disabled="busy" @click="clearInk"><UiIcon name="trash" /></button>
      <button class="btn-quiet" :aria-label="text.zoomOut" :title="text.zoomOut" :disabled="busy" @click="setZoom(zoom / 1.25)">−</button>
      <button class="btn-quiet" :aria-label="text.zoomIn" :title="text.zoomIn" :disabled="busy" @click="setZoom(zoom * 1.25)">+</button>
      <button class="btn-quiet signing-action-label" :disabled="busy" @click="setZoom(1, true)">{{ text.fit }}</button>
      <button class="btn-quiet signing-action-label" :class="{'btn-quiet-primary': toolsExpanded}" :aria-expanded="toolsExpanded" :disabled="mode === 'browse'" @click="toolsExpanded = !toolsExpanded; layersExpanded = false">{{ text.tools }}</button>
    </div>
    </div>
    <div class="signing-stage" ref="stageRef">
      <canvas ref="surfaceRef" :aria-label="pad ? text.padTitle : text.title" @pointerdown="start" @pointermove="move" @pointerup="end" @pointercancel="cancelGesture" @lostpointercapture="end" @wheel.prevent="wheel"></canvas>
      <div v-if="busy || notice" class="signing-stage-state"><AppLoading v-if="busy" :text="text.loading" /><p v-else>{{ notice }}</p><button v-if="notice && !busy" class="btn-quiet" @click="loadPage(page)">{{ text.retry }}</button></div>
    <section v-if="toolsExpanded && mode !== 'browse'" class="signing-panel signing-toolpanel" :aria-label="text.tools">
    <div class="signing-panel-heading"><strong>{{ text.tools }}</strong><button class="btn-quiet signing-panel-close" :aria-label="text.closeTools" @click="toolsExpanded = false"><UiIcon name="x" /></button></div>
    <div class="signing-panel-body">
    <div v-if="mode === 'pen' || mode === 'move'" class="signing-toolbar signing-palette" role="toolbar" :aria-label="text.color">
      <button v-for="preset in presets" :key="preset.value" class="btn-quiet signing-color" :aria-label="text[preset.label]" :title="text[preset.label]" :aria-pressed="!erasing && color === preset.value" @click="color = preset.value; erasing = false"><span class="signing-swatch" :style="{backgroundColor:preset.value}"></span></button>
      <button class="btn-quiet signing-custom-color" :class="{'btn-quiet-primary': custom}" :aria-expanded="custom" @click="custom = !custom">{{ text.custom }}</button>
    </div>
    <div v-if="mode === 'pen'" class="signing-pen-styles" :class="{'signing-pen-styles--single': erasing}" role="group" :aria-label="text.penStyle">
      <template v-if="!erasing"><button v-for="style in penStyles" :key="style.value" class="btn-quiet" :class="{'btn-quiet-primary': penStyle === style.value}" :aria-pressed="penStyle === style.value" @click="penStyle = style.value">{{ style.label }}</button></template>
      <button class="btn-quiet" :class="{'btn-quiet-primary': erasing}" :aria-pressed="erasing" @click="erasing = !erasing">{{ text.erase }}</button>
    </div>
    <div v-if="mode === 'pen'" class="signing-width-heading">{{ erasing ? text.eraserWidth : text.width }}</div>
    <div v-if="mode === 'pen'" class="signing-widths" role="radiogroup" :aria-label="erasing ? text.eraserWidth : text.width"><button v-for="option in widthOptions" :key="option.value" class="signing-width-option" :class="{'signing-width-option--active': penWidth === option.value}" :aria-pressed="penWidth === option.value" @click="penWidth = option.value"><span class="signing-width-stroke" :style="{height:option.height+'px'}"></span><span>{{ option.label }}</span></button></div>
    <div v-if="custom && (mode === 'pen' || mode === 'move')" class="signing-color-panel">
      <label class="field"><span class="field-label">{{ text.hex }}</span><input v-model="colorInput" class="field-input" maxlength="7" @change="applyColor" /></label>
      <label v-for="(label,index) in channelLabels" :key="label" class="field"><span class="field-label">{{ label }}</span><input :value="channels[index]" type="range" min="0" max="255" @input="setChannel(index,$event.target.value)" /></label>
    </div>
    <button v-if="currentLayerId && (!activeMaterial || activeMaterial.signatureType==='signature')" class="btn-quiet" :disabled="busy || saving" @click="recolorSelected">{{ text.recolor }}</button>
    </div>
    </section>
    <section v-if="layersExpanded && !busy && !notice" class="signing-panel signing-sidepanel" :aria-label="text.layers">
    <div class="signing-panel-heading">
      <div class="signing-layer-heading"><strong>{{ text.layers }}</strong><span v-if="layers.length">{{ text.pageLayerCount.replace('{0}', layers.length) }}</span></div>
      <button class="btn-quiet signing-panel-close" :aria-label="text.closeLayers" @click="layersExpanded = false"><UiIcon name="x" /></button>
    </div>
    <div class="signing-panel-body">
    <p v-if="!layers.length" class="muted">{{ text.layersEmpty }}</p>
    <template v-else>
    <div class="signing-layer-strip" role="listbox" :aria-label="text.layers">
      <div v-for="(layer,index) in displayLayers" :key="layer.id" class="signing-layer-item" role="option" :aria-selected="currentLayerId === layer.id" :aria-label="layerName(layer)" :tabindex="busy || saving ? -1 : 0" @click="chooseLayer(layer.id)" @keydown.enter.prevent="chooseLayer(layer.id)" @keydown.space.prevent="chooseLayer(layer.id)">
        <div class="signing-layer-preview"><div class="signing-layer-sheet"><UiIcon :name="layer.kind === 'draw' ? 'edit' : layer.material.signatureType === 'stamp' ? 'shield' : 'signature'" /></div><span class="signing-layer-rank">{{ index + 1 }}</span></div>
        <span class="signing-layer-name" :title="layerName(layer)">{{ layerName(layer) }}</span>
      </div>
    </div>
    <div class="signing-layer-toolbar">
      <button class="btn-quiet" :disabled="busy || saving || currentLayerIndex <= 0" @click="reorderLayer(1)">{{ text.layerUp }}</button>
      <button class="btn-quiet" :disabled="busy || saving || currentLayerIndex < 0 || currentLayerIndex >= displayLayers.length - 1" @click="reorderLayer(-1)">{{ text.layerDown }}</button>
      <button class="btn-quiet btn-quiet-danger" :disabled="busy || saving || currentLayerIndex < 0" @click="removeLayer">{{ text.removeLayer }}</button>
    </div>
    <div v-if="mode === 'move' && activeMaterial && currentLayerId === activeMaterial._idx" class="signing-adjustments">
      <strong class="signing-adjustment-heading">{{ text.layerAdjustments }}</strong>
      <label class="field"><span class="signing-adjustment-label"><span>{{ text.size }}</span><span>{{ Math.round(displayedSize*100) }}%</span></span><input :aria-label="text.size" type="range" min="50" max="220" step="5" :disabled="busy || saving" :value="displayedSize*100" @input="previewAdjustment('size',$event.target.value/100)" @pointercancel="cancelAdjustment" @change="resizeMaterial($event.target.value)" /></label>
      <label class="field"><span class="signing-adjustment-label"><span>{{ text.rotation }}</span><span>{{ displayedRotation }}°</span></span><input :aria-label="text.rotation" type="range" min="-180" max="180" step="5" :disabled="busy || saving" :value="displayedRotation" @input="previewAdjustment('rotation',$event.target.value)" @pointercancel="cancelAdjustment" @change="rotateMaterial($event.target.value)" /></label>
      <label class="field"><span class="signing-adjustment-label"><span>{{ text.horizontalPosition }}</span><span>{{ Math.round(displayedX*100) }}%</span></span><input :aria-label="text.horizontalPosition" type="range" min="0" max="100" step="1" :disabled="busy || saving" :value="displayedX*100" @input="previewAdjustment('positionX',$event.target.value/100)" @pointercancel="cancelAdjustment" @change="positionMaterial('x',$event.target.value)" /></label>
      <label class="field"><span class="signing-adjustment-label"><span>{{ text.verticalPosition }}</span><span>{{ Math.round(displayedY*100) }}%</span></span><input :aria-label="text.verticalPosition" type="range" min="0" max="100" step="1" :disabled="busy || saving" :value="displayedY*100" @input="previewAdjustment('positionY',$event.target.value/100)" @pointercancel="cancelAdjustment" @change="positionMaterial('y',$event.target.value)" /></label>
      <button class="btn btn-secondary signing-center-material" :disabled="busy || saving" @click="centerMaterial">{{ text.centerMaterial }}</button>
    </div>
    <p v-else-if="mode === 'move'" class="muted">{{ text.positionEmpty }}</p>
    </template>
    </div>
    </section>
    </div>
    <div class="signing-bottom-bar">
    <div class="signing-footer-tools">
    <button class="btn-quiet" :class="{'btn-quiet-primary':layersExpanded}" :aria-expanded="layersExpanded" :disabled="busy || !!notice || saving" @click="layersExpanded = !layersExpanded; toolsExpanded = false">{{ text.layers }}</button>
    <div class="signing-pages" v-if="totalPages > 1"><button class="btn-quiet" :aria-label="text.previousPage" :disabled="page <= 1 || busy || saving" @click="loadPage(page - 1)"><UiIcon name="chevron-left" /></button><span :aria-label="text.pagePosition.replace('{0}', page).replace('{1}', totalPages)">{{ page }} / {{ totalPages }}</span><button class="btn-quiet" :aria-label="text.nextPage" :disabled="page >= totalPages || busy || saving" @click="loadPage(page + 1)"><UiIcon name="chevron-right" /></button></div>
    <button v-if="submissionId && !pad" class="btn-quiet signing-help" @click="confirmHelp=true">{{ text.draftConfirmHelpAction }}</button>
    <label v-if="allowSaveTemplate" class="selection-option-card"><input type="checkbox" v-model="saveTemplate" :disabled="saving" />{{ text.saveToLibrary }}</label>
    </div>
    <p v-if="exportNotice" class="notice-line">{{ exportNotice }}</p>
    <div class="signing-footer"><button class="btn btn-secondary" :disabled="saving" @click="cancel">{{ text.cancel }}</button><button class="btn btn-primary" :disabled="busy || !!notice || saving" @click="confirm">{{ submissionId && !pad ? text.saveDraftAndReturn : text.confirm }}</button></div>
    </div>
    <canvas ref="inkRef" class="signing-export-canvas"></canvas>
  </section>
  <GlassDialog v-if="confirmHelp" :title="text.draftConfirmHelpTitle" @close="confirmHelp=false"><p>{{ text.draftConfirmHelp }}</p></GlassDialog>
</template>
<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, ref, reactive, watch } from 'vue';
import text from '@/locales/zh-CN/shared/auditSigning.js';
import { callApi, requireSuccess, errorText } from '@/runtime/api.js';
import GlassDialog from '@/components/GlassDialog.vue';
import UiIcon from '@/components/UiIcon.vue';
import { confirmAction } from '@/runtime/notify.js';
import { signingDrafts, restoreDraft } from '@/runtime/signingDrafts.js';
import { signingAssets } from '@/runtime/signingAssets.js';
import { nextLayerOrder, updateMaterial, deleteLayer, clone, normalizeColor, appendOperation, undo, redo, renderInk, renderViewportInk, surfaceSize, exportSize, penWidthRatio, alphaBounds, fitCamera, filePoint, pinchPan, clamp, signingLayers, moveLayer, renderStrokeLayer, renderViewportLayer, strokeExportRegion, inkExportGroups, groupExportRegion, renderExportGroup } from '@/shared/auditInk.js';
import { recolorLayer, blankPageSize, pageWidthMm, signatureWidthMm, withSignatureWidth, signatureWidthRatio } from '@/shared/auditInk.js';
import { signatureGeometry } from '@/shared/auditSignatureGeometry.js';
import { auditRequests } from '@/runtime/auditRequests.js';
const requests = auditRequests();
const props = defineProps({ draft: {type:Object,required:true}, file: {type:Object,required:true}, submissionId: String, initialMode: {type:String,default:'browse'}, active: {type:String,default:''}, pad: Boolean, allowSaveTemplate: Boolean, rollback: Object, initialPreview: Object });
const confirmHelp=ref(false);
const saveTemplate=ref(false);
const toolsExpanded=ref(false), layersExpanded=ref(false);
const emit = defineEmits(['confirm','cancel']);
const entryLayerId = 'entry_' + nextLayerOrder();
const saved = clone(props.rollback || props.draft), fileDraft = reactive(signingDrafts.file(props.draft, props.file.id));
const modes = ['browse','move','pen'], presets = [{label:'black',value:'#000000'},{label:'blue',value:'#0000ff'},{label:'red',value:'#ff0000'}];
const mode=ref(props.initialMode), color=ref('#000000'), colorInput=ref('#000000'), penWidth=ref(0.5), penStyle=ref('hard'), erasing=ref(false), custom=ref(false);
const penStyles=[{value:'hard',label:text.hardPen},{value:'soft',label:text.softPen}];
const widthOptions=[{value:0.15,label:text.widthHairline,height:1},{value:0.3,label:text.widthFine,height:2},
  {value:0.5,label:text.widthMedium,height:3},{value:0.8,label:text.widthBold,height:5},{value:1.2,label:text.widthHeavy,height:7}];
const zoom=ref(1), page=ref(fileDraft.currentPage), totalPages=ref(1), busy=ref(true), notice=ref(''), exportNotice=ref(''), saving=ref(false), activeId=ref(props.active);
const stageRef=ref(null), surfaceRef=ref(null), inkRef=ref(null);
const channels=computed(()=>[1,3,5].map(offset=>parseInt(normalizeColor(color.value).slice(offset,offset+2),16)));
const channelLabels=[text.redChannel,text.greenChannel,text.blueChannel];
const materials=computed(()=>props.draft.materials.filter(item=>item.fileId===props.file.id).sort((a,b)=>a.layerOrder-b.layerOrder));
const layers=computed(()=>signingLayers(fileDraft.history,materials.value,page.value));
const displayLayers=computed(()=>layers.value.slice().reverse());
const currentLayerIndex=computed(()=>displayLayers.value.findIndex(layer=>layer.id===activeId.value));
const currentLayerId=computed(()=>displayLayers.value[currentLayerIndex.value]?.id);
const layerName=layer=>layer.kind==='draw'?text.strokeLayerName.replace('{0}',layer.number):layer.material.stampName||(layer.material.signatureType==='stamp'?text.stamp:text.signature);
function chooseLayer(id){if(busy.value||saving.value)return;activeId.value=id;}
function removeLayer(){if(busy.value||saving.value||!currentLayerId.value)return;deleteLayer(fileDraft.history,props.draft.materials,page.value,currentLayerId.value);render();}
function reorderLayer(direction){if(busy.value||saving.value||!currentLayerId.value)return;if(moveLayer(fileDraft.history,materials.value,page.value,currentLayerId.value,direction))render();}
const adjustment=ref(null);
const displayedSize=computed(()=>adjustment.value?.values.size ?? activeMaterial.value?.size ?? 1);
const displayedRotation=computed(()=>adjustment.value?.values.rotation ?? activeMaterial.value?.rotation ?? 0);
const displayedX=computed(()=>adjustment.value?.values.positionX ?? activeMaterial.value?.positionX ?? 0.5);
const displayedY=computed(()=>adjustment.value?.values.positionY ?? activeMaterial.value?.positionY ?? 0.5);
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
async function pageData(number, options = {}) {
  let value;
  if(props.pad){const size=blankPageSize(fileDraft,surfaceRef.value.getBoundingClientRect());const canvas=document.createElement('canvas');canvas.width=Math.ceil(size.width);canvas.height=Math.ceil(size.height);const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);value={image:await imageOf(canvas.toDataURL()),width:size.width,height:size.height,total:1};}
  else {const prepared=await signingAssets.preview(props.draft,props.file,number,Boolean(options.background),{edge:options.edge||2048});const response=prepared.response;value={image:prepared.image,width:response.pageWidth,height:response.pageHeight,total:response.totalPages};}
  value.width=value.width||value.image.width;value.height=value.height||value.image.height;
  if(!alive)throw Error('closed');
  return value;
}
async function loadPage(number){
  const request=++sequence;busy.value=true;notice.value='';stroke=null;gesture=null;pointers.clear();
  try {
    const value=await pageData(number,{edge:2048});
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
    upgradePage(number,request);
  }catch(_){if(alive && request===sequence){notice.value=text.failed;current=null;}}
  finally{if(alive && request===sequence){busy.value=false;render();}}
}
async function upgradePage(number, request){
  try {
    const value=await pageData(number,{edge:4096,background:true});
    if(!alive || request!==sequence || page.value!==number)return;
    current={...current,image:value.image,width:value.width,height:value.height,total:value.total};
    render();
  }catch(_) {
    // 低清页已能准确浏览、定位和书写；高清升级失败不清空当前工作区。
  }
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
function start(event){if(busy.value||notice.value||saving.value||!camera)return;event.preventDefault();surfaceRef.value.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pointers.size>1){finishMove(false);stroke=null;gesture={kind:'pinch',distance:distance(),zoom:zoom.value,midX:midpoint().x,midY:midpoint().y,panX,panY};render();return;}const p=point(event);if(!p.inside)return;const material=activeMaterial.value;gesture={material:material?{id:material._idx,positionX:material.positionX,positionY:material.positionY}:null,kind:mode.value,x:event.clientX,y:event.clientY,panX,panY,point:p,moved:false,offsetX:material?p.x-material.positionX:0,offsetY:material?p.y-material.positionY:0};if(mode.value==='pen'){stroke={layerId:entryLayerId,page:page.value,type:erasing.value?'erase':'draw',color:color.value,penStyle:penStyle.value,width:penWidthRatio(penWidth.value,{width:current.width,height:current.height,pdf:props.file.mimeType==='application/pdf',pad:props.pad})*(erasing.value?5:1),points:[{x:p.x,y:p.y}]};render();}}
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
function positionMaterial(axis,value){adjustment.value=null;const material=activeMaterial.value;if(!material)return;commitMaterial(material,axis==='y'?{positionY:Number(value)/100}:{positionX:Number(value)/100});render();}
function centerMaterial(){adjustment.value=null;if(activeMaterial.value)commitMaterial(activeMaterial.value,{positionX:0.5,positionY:0.5});render();}
async function changeHistory(forward){if(busy.value||saving.value)return;const target=(forward?redo:undo)(fileDraft.history,props.draft.materials);if(target===null)return;if(target!==page.value)await loadPage(target);else render();}
async function clearInk(){if(busy.value||saving.value)return;if(await confirmAction({title:props.pad?text.clearPadTitle:text.clearTitle,body:props.pad?text.clearPadBody:text.clearBody,confirmText:text.clear,cancelText:text.cancel,danger:true})){if(!alive||busy.value||saving.value)return;appendOperation(fileDraft.history,{page:page.value,type:'clear'});render();}}
async function exportPages(){const exports=[];const pages=Array.from(new Set(fileDraft.history.operations.slice(0,fileDraft.history.cursor).map(operation=>operation.page)));for(const number of pages){const value=await pageData(number);for(const layer of (props.pad?[null]:inkExportGroups(fileDraft.history,props.draft.materials.filter(item=>item.fileId===props.file.id),number))){const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');const size=exportSize(value.width,value.height);const region=layer?groupExportRegion(layer,size.width,size.height):{left:0,top:0,width:size.width,height:size.height};canvas.width=region.width;canvas.height=region.height;if(layer)renderExportGroup(ctx,document.createElement('canvas'),fileDraft.history,layer,size.width,size.height,region);else renderInk(ctx,fileDraft.history,number,canvas.width,canvas.height);const bounds=alphaBounds(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);if(!bounds)continue;const crop=document.createElement('canvas');crop.width=bounds.width;crop.height=bounds.height;crop.getContext('2d').drawImage(canvas,bounds.left,bounds.top,bounds.width,bounds.height,0,0,bounds.width,bounds.height);const raw=crop.toDataURL('image/png'),imageData=props.pad?withSignatureWidth(raw,pageWidthMm({pad:true})*bounds.width/size.width):raw;if(imageData.length>Math.ceil(2*1024*1024*4/3)+64)throw Error('too_large');exports.push({_idx:'ink_'+props.file.id+'_'+(layer?layer.id+'_page_'+number:number),inkLayerId:layer?layer.id:'',layerOrder:layer?layer.order:0,fileId:props.file.id,signatureType:'signature',imageData,widthRatio:bounds.width/size.width,positionX:(region.left+bounds.left+bounds.width/2)/size.width,positionY:(region.top+bounds.top+bounds.height/2)/size.height,size:1,rotation:0,page:number});}}return exports;}
async function confirm(){saving.value=true;exportNotice.value='';let savingSignature=false;try{fileDraft.exports=await exportPages();if(props.pad&&!fileDraft.exports.length){exportNotice.value=text.empty;return;}if(props.allowSaveTemplate&&saveTemplate.value){savingSignature=true;requireSuccess(await requests.call('saveSignature',{id:'',name:text.signature,imageData:fileDraft.exports[0].imageData}),text.signatureSaveFailed);savingSignature=false;}if(!alive)return;finished=true;emit('confirm',fileDraft.exports);}catch(error){exportNotice.value=savingSignature?errorText(error):error.message==='too_large'?text.tooLarge:text.exportFailed;}finally{saving.value=false;}}
function cancel(){restoreDraft(props.draft,saved);finished=true;emit('cancel');}
onMounted(()=>{observer=new ResizeObserver(resize);observer.observe(stageRef.value);loadPage(page.value);});
watch([mode,activeId],()=>{if(mode.value==='browse')toolsExpanded.value=false;cancelAdjustment();cancelGesture();render();});
watch(materials,render,{deep:true});
watch(color,value=>{colorInput.value=value;});
onBeforeUnmount(()=>{alive=false;sequence+=1;requests.dispose();if(observer)observer.disconnect();if(frame!==null)cancelAnimationFrame(frame);if(!finished)restoreDraft(props.draft,saved);pointers.clear();});
</script>
<style scoped>
.signing-workspace {
  display: grid; flex: 1 1 0; min-height: 0;
  grid-template-rows: auto minmax(var(--ui-signing-stage-min-height),1fr) auto;
  gap: var(--ui-inline-gap);
}
.signing-topbar, .signing-bottom-bar, .signing-panel {
  border: var(--ui-result-label-border);
  border-radius: var(--ui-field-radius);
  background: var(--ui-field-bg);
  box-shadow: var(--ui-card-shadow);
}
.signing-topbar, .signing-bottom-bar { display: grid; gap: var(--ui-inline-gap); padding: var(--ui-inline-gap); }
.signing-workspace .tabs { margin: 0; min-height: 0; padding: 0; }
.signing-workspace .tab, .signing-workspace .btn-quiet, .signing-footer .btn {
  min-height: var(--ui-signing-tool-height); padding: var(--ui-signing-tool-gap) var(--ui-inline-gap);
  border-radius: var(--ui-compact-radius); font-size: var(--ui-type-meta); line-height: var(--ui-leading-control); white-space: nowrap;
}
.signing-actions { display: grid; grid-template-columns: repeat(2,minmax(max-content,1fr)) repeat(3,minmax(0,1fr)) repeat(2,minmax(max-content,1.65fr)); gap: var(--ui-signing-tool-gap); }
.signing-actions .btn-quiet { min-width: 0; padding-inline: var(--ui-signing-tool-gap); }
.signing-actions .signing-action-label { padding-inline: var(--ui-inline-gap); }
.signing-stage {
  position: relative; min-width: 0; min-height: 0; overflow: hidden;
  border: 1px solid var(--ui-line-blue); border-radius: var(--ui-field-radius); background: var(--ui-option-selected-bg);
}
.signing-stage canvas { position: absolute; inset: 0; display: block; width: 100%; height: 100%; touch-action: none; }
.signing-stage-state { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: var(--ui-inline-gap); background: var(--ui-field-bg); }
.signing-export-canvas { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }

.signing-panel {
  position: absolute; z-index: 2; display: grid; grid-template-rows: auto minmax(0,1fr);
  width: min(400px,calc(100% - 2 * var(--ui-inline-gap)));
  max-height: calc(100% - 2 * var(--ui-inline-gap)); overflow: hidden;
  box-sizing: border-box; backdrop-filter: blur(12px);
}
.signing-toolpanel { top: var(--ui-inline-gap); left: var(--ui-inline-gap); }
.signing-sidepanel { right: var(--ui-inline-gap); bottom: var(--ui-inline-gap); max-height: 65%; }
.signing-panel-heading {
  display: flex; align-items: center; justify-content: space-between; gap: var(--ui-inline-gap);
  padding: var(--ui-inline-gap) var(--ui-signing-control-gap); border-bottom: var(--ui-result-label-border);
  font-size: var(--ui-type-emphasis);
}
.signing-panel .signing-panel-close { flex: none; width: var(--ui-signing-tool-height); padding: 0; }
.signing-panel-body {
  display: grid; grid-template-columns: minmax(0,1fr); align-content: start; gap: var(--ui-signing-control-gap); min-height: 0;
  overflow: auto; overscroll-behavior: contain; padding: var(--ui-signing-control-gap);
}
.signing-panel-body > p { margin: 0; }
.signing-palette, .signing-pen-styles, .signing-widths, .signing-layer-toolbar { display: grid; gap: var(--ui-signing-tool-gap); }
.signing-palette { grid-template-columns: repeat(3,var(--ui-signing-tool-height)) minmax(0,1fr); }
.signing-swatch { width: var(--ui-signing-swatch-size); height: var(--ui-signing-swatch-size); border-radius: var(--ui-compact-radius); }
.signing-color[aria-pressed=true], .signing-width-option--active { border-color: var(--ui-blue-700); background: var(--ui-option-selected-bg); color: var(--ui-blue-700); }
.signing-pen-styles, .signing-layer-toolbar { grid-template-columns: repeat(3,minmax(0,1fr)); }
.signing-pen-styles--single { grid-template-columns: minmax(0,1fr); }
.signing-widths { grid-template-columns: repeat(5,minmax(0,1fr)); }
.signing-width-heading { margin-bottom: calc(-1 * var(--ui-signing-tool-gap)); font-size: var(--ui-type-meta); color: var(--ui-text-muted); }
.signing-width-option {
  display: flex; align-items: center; justify-content: center; flex-direction: column;
  gap: var(--ui-signing-tool-gap); min-width: 0; min-height: var(--ui-signing-tool-height); padding: var(--ui-signing-tool-gap);
  border: 1px solid var(--ui-line); border-radius: var(--ui-compact-radius); background: var(--ui-field-bg);
  color: var(--ui-text-muted); font-size: var(--ui-type-micro); line-height: var(--ui-leading-control); cursor: pointer;
}
.signing-width-option--active { border-color: var(--ui-blue-700); background: var(--ui-option-selected-bg); color: var(--ui-blue-700); }
.signing-width-stroke { display: block; width: 26px; min-height: 1px; border-radius: 999px; background: currentColor; }
.signing-color-panel { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: var(--ui-field-gap); }
.signing-color-panel .field { min-width: 0; }
.signing-color-panel .field-input { width: 100%; min-width: 0; }
.signing-layer-heading { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--ui-inline-gap); }
.signing-layer-heading > span { font-size: var(--ui-type-meta); color: var(--ui-text-muted); }
.signing-layer-strip { display: flex; gap: var(--ui-inline-gap); min-width: 0; overflow-x: auto; padding-bottom: var(--ui-signing-tool-gap); }
.signing-layer-item {
  flex: 0 0 auto; min-width: var(--ui-signing-layer-width); padding: var(--ui-signing-tool-gap) var(--ui-inline-gap);
  border: 1px solid var(--ui-line); border-radius: var(--ui-compact-radius); background: var(--ui-card-bg); cursor: pointer;
}
.signing-layer-item[aria-selected=true] { border-color: var(--ui-blue-700); background: var(--ui-option-selected-bg); }
.signing-layer-preview { position: relative; display: flex; justify-content: center; align-items: center; height: var(--ui-signing-preview-height); }
.signing-layer-sheet {
  display: grid; place-items: center; width: var(--ui-signing-sheet-width); height: var(--ui-signing-sheet-height);
  border: 1px solid var(--ui-line-blue); border-radius: var(--ui-signing-tool-gap); background: var(--ui-field-bg); box-shadow: var(--ui-signing-sheet-shadow);
}
.signing-layer-rank { position: absolute; right: 0; bottom: 0; font-size: var(--ui-type-micro); color: var(--ui-text-muted); font-variant-numeric: tabular-nums; }
.signing-layer-name { display: block; white-space: nowrap; text-align: center; font-size: var(--ui-type-meta); line-height: var(--ui-leading-body); }
.signing-adjustments {
  display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: var(--ui-inline-gap) var(--ui-signing-adjustment-gap);
  padding: var(--ui-signing-control-gap) 0 var(--ui-signing-tool-gap); border-top: var(--ui-result-label-border);
}
.signing-adjustments .field { min-width: 0; gap: 0; }
.signing-adjustment-heading, .signing-center-material { grid-column: 1/-1; }
.signing-adjustment-label { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--ui-signing-tool-gap); font-size: var(--ui-type-meta); }
.signing-panel input[type=range] {
  display: block; box-sizing: border-box; width: 100%; height: var(--ui-signing-slider-height); margin: 0;
  padding: 0 var(--ui-signing-control-gap); touch-action: pan-x; accent-color: var(--ui-blue-700);
}

.signing-bottom-bar { position: relative; }
.signing-footer-tools, .signing-pages { display: flex; align-items: center; gap: var(--ui-inline-gap); min-width: 0; }
.signing-pages, .signing-help { margin-left: auto; }
.signing-pages > span { min-width: 52px; text-align: center; white-space: nowrap; font-size: var(--ui-type-meta); font-variant-numeric: tabular-nums; }
.signing-pages .btn-quiet { width: var(--ui-signing-tool-height); padding: 0; }
.signing-footer-tools .selection-option-card { min-height: var(--ui-signing-tool-height); padding: var(--ui-signing-tool-gap) var(--ui-inline-gap); font-size: var(--ui-type-meta); }
.signing-footer { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: var(--ui-inline-gap); }
.signing-bottom-bar .notice-line { position: absolute; z-index: 3; bottom: calc(100% + var(--ui-inline-gap)); left: 0; right: 0; margin: 0; background: var(--ui-field-bg); }
@media (min-width: 650px) {
  .signing-topbar { grid-template-columns: minmax(0,3fr) minmax(0,7fr); }
  .signing-bottom-bar { grid-template-columns: minmax(0,1fr) auto; }
  .signing-pages, .signing-help { margin-left: 0; }
  .signing-footer { grid-template-columns: minmax(80px,auto) minmax(108px,auto); }
  .signing-sidepanel { max-height: calc(100% - 2 * var(--ui-inline-gap)); }
}
@media (min-width: 650px) and (max-height: 500px) {
  .signing-workspace { --ui-signing-tool-height: 34px; gap: var(--ui-signing-tool-gap); }
  .signing-topbar, .signing-bottom-bar { padding: var(--ui-signing-tool-gap); }
}
</style>
