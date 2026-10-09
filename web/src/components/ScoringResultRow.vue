<template>
  <div class="result-rank-card" :class="`rank-${tone}`">
    <span class="result-rank-badge">{{ medals[rank - 1] || rank }}</span>
    <div class="result-member">
      <strong>{{ member.name }}</strong><span>{{ [member.identity, member.department, member.workGroup].filter(Boolean).join(' · ') }}</span>
    </div>
    <div class="result-score"><strong>{{ value }}</strong><span>{{ mode === 'grade' ? home.grade : home.earnedScore }}</span></div>
  </div>
</template>
<script setup>
import { computed } from 'vue';
import homeCopy from '@/locales/zh-CN/shared/home.js';
const props = defineProps({ member: { type: Object, required: true }, rank: Number, mode: String });
const home = homeCopy.text;
const medals = [home.rankMedalGold, home.rankMedalSilver, home.rankMedalBronze];
const tone = computed(() => ['gold', 'silver', 'bronze'][props.rank - 1] || 'normal');
const value = computed(() => props.mode === 'grade' ? props.member.grade || props.member.finalScore || home.unrated
  : typeof props.member.finalScore === 'number' ? props.member.finalScore.toFixed(3) : props.member.finalScore ?? '0.000');
</script>
<style scoped>
.result-rank-card { display: flex; align-items: center; gap: var(--ui-inline-gap); padding: var(--ui-list-padding-y) var(--ui-list-padding-x); border-radius: var(--ui-list-radius); background: var(--ui-list-bg); border: var(--ui-list-border); box-shadow: var(--ui-list-shadow); backdrop-filter: blur(12px); }
.rank-gold { background: var(--ui-rank-gold-bg); border-color: var(--ui-rank-gold-border); }
.rank-silver { background: var(--ui-rank-silver-bg); border-color: var(--ui-rank-silver-border); }
.rank-bronze { background: var(--ui-rank-bronze-bg); border-color: var(--ui-rank-bronze-border); }
.result-rank-badge { flex: none; width: var(--ui-rank-badge-size); height: var(--ui-rank-badge-size); border-radius: var(--ui-compact-radius); display: flex; align-items: center; justify-content: center; font-size: var(--ui-type-dialog); font-weight: 800; background: var(--ui-chip-blue-bg); color: var(--ui-chip-blue-text); }
.rank-gold .result-rank-badge { background: var(--ui-rank-gold-badge); }
.rank-silver .result-rank-badge { background: var(--ui-rank-silver-badge); }
.rank-bronze .result-rank-badge { background: var(--ui-rank-bronze-badge); }
.result-member { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--ui-label-gap); overflow-wrap: anywhere; }
.result-member strong { font-size: var(--ui-type-value); }
.result-member > span { color: var(--ui-text-muted); font-size: var(--ui-type-meta); }
.result-score { display: flex; flex-direction: column; align-items: flex-end; flex: none; max-width: 40%; overflow-wrap: anywhere; }
.result-score strong { color: var(--ui-blue-700); font-size: var(--ui-type-dialog); font-variant-numeric: tabular-nums; }
.result-score > span { color: var(--ui-text-soft); font-size: var(--ui-type-caption); }
</style>
