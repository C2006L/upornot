<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{
  type?: 'text' | 'password'
  inputId?: string
}>(), {
  type: 'text',
})
const modelValue = defineModel<string>()

const isPasswordVisible = ref(false)

const inputType = computed(() => {
  if (props.type === 'password') {
    return isPasswordVisible.value ? 'text' : 'password'
  }
  return props.type
})

function togglePasswordVisibility() {
  isPasswordVisible.value = !isPasswordVisible.value
}
</script>

<template>
  <div relative w-full>
    <input
      :id="inputId"
      v-model="modelValue"
      :type="inputType"
      v-bind="$attrs"
      app-field
      :class="props.type === 'password' ? 'pr-11' : ''"
    >

    <button
      v-if="props.type === 'password'"
      type="button"
      w-10 h-full top-0
      hover:text-teal-700 text-slate-400 dark:text-slate-500
      transform transition-colors duration-200
      right-0 absolute
      @click="togglePasswordVisibility"
    >
      <div
        :class="[
          isPasswordVisible
            ? 'i-carbon-view-off'
            : 'i-carbon-view',
        ]"
        text-lg cursor-pointer
      />
    </button>
  </div>
</template>

<style scoped>
input {
  -webkit-text-security: none;
}

/* hide default eye icon */
input::-ms-reveal,
input::-ms-clear {
  display: none;
}

input[type='password']::-webkit-textfield-decoration-container {
  display: none;
}

input[type='password']::-webkit-credentials-auto-fill-button {
  display: none;
}

[relative]:has(button:hover) input {
  @apply border-teal-600 dark:border-teal-700;
}
</style>
