<template>
  <article class="list-row stack">
    <div class="field"><span class="field-label">{{ copy.member }}</span><strong>{{ value.memberName }}</strong></div>
    <div class="field"><span class="field-label">{{ copy.sourceField }}</span><span>{{ value.sourceFieldLabel }}</span></div>
    <div class="field"><span class="field-label">{{ copy.targetField }}</span><span>{{ value.targetFieldLabel }}</span></div>
    <div v-if="value.hasOriginalValue" class="field"><span class="field-label">{{ copy.originalValue }}</span><span class="break-all">{{ value.rawValue }}</span></div>
    <div class="field"><span class="field-label">{{ copy.requirement }}</span><span>{{ value.requirement }}</span></div>
    <div v-if="value.allowedOptions.length" class="field"><span class="field-label">{{ copy.allowedOptions }}</span><span v-for="(option,index) in value.allowedOptions" :key="index">{{ option }}</span></div>
  </article>
</template>
<script setup>
import { computed } from 'vue';
import copy from '@/locales/zh-CN/shared/hrValueValidation.js';
import { detail } from '@/shared/hrValueValidation.js';
const props=defineProps({item:{type:Object,required:true}});
const value=computed(()=>detail(props.item,0,copy));
</script>
