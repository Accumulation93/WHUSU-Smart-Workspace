<template>
  <p v-if="!people.length" class="muted">{{ emptyText }}</p>
  <div v-else class="readonly-person-table">
    <table>
      <colgroup><col class="readonly-person-name-column" /><col /></colgroup>
      <thead><tr><th scope="col">{{ home.text.name }}</th><th scope="col">{{ home.text.regularPosition }}</th></tr></thead>
      <tbody>
        <tr v-for="(person,index) in people" :key="index">
          <td class="readonly-person-name"><PersonLink :name="person.name" :reference="person.personReference" :assignment-id="person.assignmentId" :hr-id="person.hrId" :person-id="person.personId" /></td>
          <td>
            <div v-if="person.positionNotice" class="readonly-person-empty">{{ person.positionNotice }}</div>
            <div v-else-if="!person.positions?.length" class="readonly-person-empty">{{ positionEmptyText }}</div>
            <template v-else><div v-for="(position,positionIndex) in person.positions" :key="positionIndex" class="readonly-person-position">
              <span v-if="position.label" class="readonly-person-role">{{ position.label }}</span>
              <template v-else><span v-if="position.identityCategory" class="readonly-person-role">{{ position.identityCategory }}</span>
              <span v-if="position.department">{{ position.department }}</span>
              <span v-if="position.workGroup">{{ position.workGroup }}</span>
              <span v-if="!position.identityCategory && !position.department && !position.workGroup">{{ positionEmptyText }}</span></template>
            </div></template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
<script setup>
import PersonLink from './PersonLink.vue';
import home from '@/locales/zh-CN/shared/home.js';
defineProps({people:{type:Array,default:()=>[]},emptyText:{type:String,default:''},positionEmptyText:{type:String,default:''}});
</script>
<style scoped>
.readonly-person-table { min-width:0;border:var(--ui-result-label-border);border-radius:var(--ui-field-radius);background:var(--ui-result-label-bg);overflow:hidden; }
table { width:100%;table-layout:fixed;border-collapse:collapse;text-align:left;font-size:var(--ui-type-meta);line-height:var(--ui-leading-body); }
.readonly-person-name-column { width:28%; }
th,td { padding:var(--ui-list-padding-y) var(--ui-list-padding-x);vertical-align:top;overflow-wrap:anywhere; }
th { color:var(--ui-blue-900);font-weight:700;background:var(--ui-chip-blue-bg); }
td { border-top:1px solid var(--ui-line-blue);color:var(--ui-text-muted); }
.readonly-person-name { font-weight:700;color:var(--ui-text); }
.readonly-person-position { display:flex;flex-direction:column;gap:var(--ui-label-gap); }
.readonly-person-position + .readonly-person-position { margin-top:var(--ui-field-gap);padding-top:var(--ui-field-gap);border-top:1px solid var(--ui-line); }
.readonly-person-role { color:var(--ui-text); }
@media(min-width:520px){.readonly-person-name-column { width:calc(var(--ui-type-body) * 7.5); }}
</style>
