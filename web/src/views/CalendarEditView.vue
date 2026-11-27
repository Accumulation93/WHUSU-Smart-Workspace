<template>
  <main class="page page-narrow stack">
    <WorkspaceHero :page-name="copy.title" :person-name="session.context?.name || ''" :identity-name="session.context?.identityName || ''" :organization-name="session.context?.organizationName || ''" @switch="router.push({name:'workRole'})" />
    <CalendarEditor :options="route.query" @cancel="back" @saved="back" />
  </main>
</template>
<script setup>
import {useRoute,useRouter} from 'vue-router';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import CalendarEditor from '@/components/CalendarEditor.vue';
import copy from '@/locales/zh-CN/shared/calendar.js';
import {session} from '@/runtime/session.js';
const route=useRoute(),router=useRouter();
function back(){router.replace({name:'calendar'});}
</script>
