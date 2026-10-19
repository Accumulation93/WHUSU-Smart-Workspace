'use strict';
const copy=require('../../../../locales/zh-CN/calendar');
const directory=require('../../package-resources/utils/contactDirectoryView');
const dimensions=[{key:'departmentIds',same:'sameDepartment',label:'department',options:'departments'},{key:'identityCategoryIds',same:'sameIdentity',label:'identity',options:'identities'},{key:'workGroupIds',same:'sameWorkGroup',label:'workGroup',options:'workGroups'}];
Component({
  options:{styleIsolation:'apply-shared'},
  properties:{value:{type:Array,value:[]},metadata:{type:Object,value:{}},audience:Boolean,disabled:Boolean},
  data:{copy,rows:[],types:[],pickerVisible:false,people:[],selected:[]},
  observers:{'value,metadata,audience':function(){this.rebuild();}},
  pageLifetimes:{hide:function(){this.closePicker();}},
  methods:{
    rebuild:function(){
      const types=this.properties.audience ? ['people','scope'] : ['self','people','scope'];
      const people=directory.peopleOptions(this.properties.metadata.people);
      const rows=this.properties.value.map((clause,index)=>({index,type:clause.type,typeIndex:types.indexOf(clause.type),
        names:people.filter(person=>(clause.personIds||[]).includes(person.id)).map(person=>person.name).join(' / '),
        count:(clause.personIds||[]).length,dimensions:dimensions.map(dimension=>({key:dimension.key,same:dimension.same,label:copy[dimension.label],sameLabel:copy[dimension.same],
          checked:Boolean(clause[dimension.same]),expanded:Boolean(this._expanded && this._expanded[index+dimension.key]),
          count:(clause[dimension.key]||[]).length,options:(this.properties.metadata[dimension.options]||[]).map(option=>({id:option.id,name:option.name+(option.departmentId?' · '+((this.properties.metadata.departments||[]).find(item=>item.id===option.departmentId)||{}).name:''),
            selected:(clause[dimension.key]||[]).includes(option.id)}))}))}));
      this._types=types;this.setData({rows,people,types:types.map(type=>copy[type==='people'?'choosePeople':type==='scope'?'chooseScope':'self'])});
    },
    publish:function(list){if(!this.properties.disabled)this.triggerEvent('change',{value:list});},
    patch:function(index,work){const list=JSON.parse(JSON.stringify(this.properties.value));if(!list[index])return;work(list[index]);this.publish(list);},
    typeChange:function(e){const list=JSON.parse(JSON.stringify(this.properties.value));list[Number(e.currentTarget.dataset.index)]=directory.blankClause(this._types[Number(e.detail.value)]);this.publish(list);},
    add:function(){this.publish(this.properties.value.concat(directory.blankClause('scope')));},
    remove:function(e){if(this.properties.value.length>1)this.publish(this.properties.value.filter((_,i)=>i!==Number(e.currentTarget.dataset.index)));},
    expand:function(e){const key=e.currentTarget.dataset.index+e.currentTarget.dataset.key;this._expanded=this._expanded||{};this._expanded[key]=!this._expanded[key];this.rebuild();},
    toggle:function(e){const {index,key,id}=e.currentTarget.dataset;this.patch(Number(index),clause=>{const values=clause[key]||[];clause[key]=values.includes(id)?values.filter(value=>value!==id):values.concat(id);});},
    same:function(e){const {index,key,same}=e.currentTarget.dataset;this.patch(Number(index),clause=>{clause[same]=Boolean(e.detail.value);clause[key]=[];});},
    openPicker:function(e){if(this.properties.disabled)return;this._pickerIndex=Number(e.currentTarget.dataset.index);this.setData({pickerVisible:true,selected:this.properties.value[this._pickerIndex].personIds||[]});this.triggerEvent('pickerchange',{visible:true});},
    closePicker:function(){this.setData({pickerVisible:false,selected:[]});this.triggerEvent('pickerchange',{visible:false});},
    confirmPicker:function(e){this.patch(this._pickerIndex,clause=>{clause.personIds=e.detail.items.map(item=>item.personId||item.id);});this.closePicker();}
  }
});
