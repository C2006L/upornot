<script setup lang="ts">
import { watchEffect } from 'vue'

const props = defineProps<{
  options: { label: string, subLabel: string, value: string | number }[]
}>()

const modelValue = defineModel<string | number>()

watchEffect(() => {
  if (props.options && props.options.length > 0 && !modelValue.value) {
    modelValue.value = props.options[0].value
  }
})
</script>

<template>
  <div
    class="button-select"
    flex flex-wrap gap-3 w-full
    :class="props.options.length === 4 ? 'four-items' : ''"
  >
    <button
      v-for="option in props.options"
      :key="option.value"
      type="button"
      :class="[
        modelValue === option.value
          ? '!border-teal-600 shadow-[0_0_5px_0] shadow-teal-600'
          : '',
      ]"
      class="button-item"
      h-35 flex-1 min-w-0
      border="~ 1px rounded base hover-base" cursor-pointer @click="modelValue = option.value"
    >
      {{ option.label }}
      <span
        text-xs block mt-1 opacity-50
      >{{ option.subLabel }}</span>
    </button>
  </div>
</template>

<style scoped>
@media (max-width: 640px) {
  .four-items .button-item {
    flex-basis: calc(50% - 0.375rem);
    height: 7rem;
  }
}
</style>
