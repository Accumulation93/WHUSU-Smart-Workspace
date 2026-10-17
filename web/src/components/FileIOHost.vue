<template>
  <GlassDialog v-if="fileDialog" :title="fileDialog.title" compact @close="cancelFileDialog">
    <div class="stack"><button v-for="mode in fileDialog.modes" :key="mode" type="button" class="btn btn-secondary" @click="runFileMode(mode)">{{ copy[mode] }}</button></div>
    <template #footer><button type="button" class="btn btn-secondary" @click="cancelFileDialog">{{ copy.cancel }}</button></template>
  </GlassDialog>
</template>
<script setup>
import { watch } from 'vue';
import { useRoute } from 'vue-router';
import { session } from '@/runtime/session.js';
import GlassDialog from './GlassDialog.vue';
import copy from '@/locales/zh-CN/shared/fileIO.js';
import { fileDialog, cancelFileDialog, runFileMode } from '@/runtime/fileIO.js';
const route=useRoute();
watch(()=>[route.fullPath,session.status,session.user?.id,session.context?.contextId],cancelFileDialog);
</script>
