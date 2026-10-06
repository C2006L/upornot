<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  loading?: boolean
  disabled?: boolean
  loadingText?: string
  disabledText?: string
  disableOnLoading?: boolean
  variant?: 'primary' | 'danger'
}>()

const isDisabled = computed(() =>
  props.disabled || (props.disableOnLoading !== false && props.loading),
)

const variantClass = computed(() => {
  if (props.variant === 'danger') {
    return 'bg-red-500 hover:bg-red-400 disabled:bg-red-500 shadow-red-500/15'
  }
  return 'bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 disabled:from-slate-600 disabled:to-slate-600 shadow-teal-500/20'
})
</script>

<template>
  <button
    :disabled="isDisabled"
    text-white font-bold rounded-xl h-13 w-full shadow-lg
    transition duration-200 active:translate-y-0.5
    disabled:text-gray-400
    :class="[
      variantClass,
      props.loading
        ? 'cursor-wait'
        : isDisabled
          ? 'cursor-not-allowed'
          : 'cursor-pointer',
    ]"
  >
    <template v-if="props.loading && props.loadingText">
      <span flex="~ items-center justify-center gap-2">
        <span i-carbon-circle-dash animate-spin />
        {{ props.loadingText }}
      </span>
    </template>
    <template v-else-if="isDisabled && props.disabledText">
      {{ props.disabledText }}
    </template>
    <template v-else>
      <slot />
    </template>
  </button>
</template>
