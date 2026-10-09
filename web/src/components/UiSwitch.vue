<template>
  <input class="ui-switch" type="checkbox" role="switch" :aria-label="label" :checked="checked" :disabled="disabled"
    @change="$emit('change', $event)" />
</template>
<script setup>
defineProps({ label: { type: String, required: true }, checked: Boolean, disabled: Boolean });
defineEmits(['change']);
</script>
<style scoped>
.ui-switch { appearance: none; display: block; position: relative; flex: none; margin: 0; width: var(--ui-switch-width); height: var(--ui-switch-height); border: var(--ui-field-border); border-radius: var(--ui-switch-height); background: var(--ui-switch-off); cursor: pointer; }
.ui-switch::after { content: ''; position: absolute; left: var(--ui-switch-inset); top: var(--ui-switch-inset); width: var(--ui-switch-thumb); height: var(--ui-switch-thumb); border-radius: 50%; background: var(--ui-on-primary); box-shadow: var(--ui-field-shadow); }
.ui-switch:checked { background: var(--ui-blue-700); border-color: var(--ui-blue-700); }
.ui-switch:checked::after { left: auto; right: var(--ui-switch-inset); }
.ui-switch:disabled { cursor: default; opacity: var(--ui-disabled-opacity); }
.ui-switch:focus-visible { outline: 2px solid var(--ui-blue-400); outline-offset: 2px; }
</style>
