<template><div class="page stack"><WorkspaceHero :tone="session.context?.role === 'admin' ? 'admin' : 'blue'" :page-name="ui.title" :person-name="session.context?.name || session.user?.name" :identity-name="roleLabelOf(session.context)" :organization-name="session.context?.organizationName" @switch="router.push({name:'workRole'})" /><AssignmentNatureEditor /></div></template>
<script setup>
import {useRouter} from 'vue-router';
import WorkspaceHero from '@/components/WorkspaceHero.vue';
import AssignmentNatureEditor from '@/components/AssignmentNatureEditor.vue';
import ui from '@/locales/zh-CN/shared/assignmentNatures.js';
import {session,roleLabelOf} from '@/runtime/session.js';
const router=useRouter();
</script>
