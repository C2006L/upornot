<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{
  maxSize?: number
}>(), {
  maxSize: 20,
})
const emit = defineEmits<{
  uploaded: [file: File]
  error: [message: string]
}>()

const modelValue = defineModel<File | string | null>()
const fileInput = ref<HTMLInputElement>()
const dragCounter = ref(0)
const isDragOver = computed(() => dragCounter.value > 0)

// 模式切换: 'file' 上传文件, 'url' 图片链接
const inputMode = ref<'file' | 'url'>('file')
const urlInput = ref('')

// 是否有值
const hasValue = computed(() => {
  if (inputMode.value === 'file')
    return modelValue.value instanceof File
  return typeof modelValue.value === 'string' && modelValue.value.length > 0
})

// 预览 URL
const previewUrl = ref<string>()

function handleInputChange(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    handleFileSelect(file)
  }
}

function handleFileSelect(file: File) {
  if (!file.type.startsWith('image/')) {
    emit('error', '请选择图片格式')
    return
  }

  const maxSizeInBytes = props.maxSize * 1024 * 1024
  if (file.size > maxSizeInBytes) {
    emit('error', `图片大小不能超过 ${props.maxSize}MB`)
    return
  }

  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
  }
  modelValue.value = file
  previewUrl.value = URL.createObjectURL(file)
  emit('uploaded', file)
}

function removeImage() {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = undefined
  }
  modelValue.value = null
  urlInput.value = ''
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

function handleClick() {
  if (inputMode.value === 'file')
    fileInput.value?.click()
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  dragCounter.value = 0
  if (inputMode.value !== 'file')
    return
  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    handleFileSelect(files[0])
  }
}

function handlePreview() {
  if (previewUrl.value) {
    const img = new window.Image()
    img.src = previewUrl.value
    img.alt = 'preview image'
    img.className = 'preview image-uploader'
    document.body.appendChild(img)
    img.click()
    document.body.removeChild(img)
  }
}

function confirmUrl() {
  const url = urlInput.value.trim()
  if (!url) {
    removeImage()
    return
  }
  try {
    // eslint-disable-next-line no-new
    new URL(url)
  }
  catch {
    emit('error', '链接格式不正确')
    return
  }
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
  }
  modelValue.value = url
  previewUrl.value = url
  // 预加载图片检查是否可访问
  const img = new window.Image()
  img.onload = () => {
    emit('uploaded', url as any)
  }
  img.onerror = () => {
    emit('error', '图片链接无法访问，请检查链接是否有效')
  }
  img.src = url
  // 收起键盘
  ;(document.activeElement as HTMLElement)?.blur()
}

function switchMode(mode: 'file' | 'url') {
  removeImage()
  inputMode.value = mode
}

function handleDragLeave() {
  dragCounter.value = Math.max(0, dragCounter.value - 1)
}
</script>

<template>
  <div>
    <!-- 模式切换 -->
    <div mb-4 flex="~ gap-1" p-1 rounded-xl bg-slate-100 w-fit class="dark:bg-white/5">
      <button
        px-3 py-1.5 rounded-lg text-xs font-semibold transition duration-200 cursor-pointer
        :class="inputMode === 'file'
          ? 'bg-white text-teal-700 shadow-sm dark:bg-white/10 dark:text-teal-300'
          : 'text-gray-600 dark:text-gray-300 hover:text-teal-600 dark:hover:text-teal-400'"
        @click="switchMode('file')"
      >
        图片文件
      </button>
      <button
        px-3 py-1.5 rounded-lg text-xs font-semibold transition duration-200 cursor-pointer
        :class="inputMode === 'url'
          ? 'bg-white text-teal-700 shadow-sm dark:bg-white/10 dark:text-teal-300'
          : 'text-gray-600 dark:text-gray-300 hover:text-teal-600 dark:hover:text-teal-400'"
        @click="switchMode('url')"
      >
        外部链接
      </button>
    </div>

    <!-- 文件上传模式 -->
    <div v-if="inputMode === 'file'" @drop="handleDrop" @dragleave.prevent.stop="handleDragLeave" @dragenter.prevent.stop="dragCounter++" @dragover.prevent.stop>
      <div
        border="2 slate-200 dark:white/10 rounded-2xl"
        :class="[
          !hasValue ? 'border-dashed' : 'border-solid',
          isDragOver ? '!border-teal-500 bg-teal-500/5 scale-[1.005]' : 'hover:border-teal-400/70',
        ]"
        min-h-64 w-full cursor-pointer relative overflow-hidden bg="slate-50/60 dark:white/2"
        transition duration-200
        @click="handleClick"
      >
        <input
          ref="fileInput" accept="image/*" type="file" hidden
          @change="handleInputChange"
        >

        <div
          v-show="!hasValue && !isDragOver"
          flex="~ col items-center justify-center"
          h-full min-h-64 text-slate-500 dark:text-slate-400
        >
          <span w-14 h-14 mb-4 rounded-2xl flex="~ items-center justify-center" bg="teal-500/10" text-teal-600 dark:text-teal-300>
            <div i-carbon-cloud-upload text-2xl />
          </span>
          <strong text-sm text-slate-700 dark:text-slate-200>拖入图片，或点击选择文件</strong>
          <span text-xs mt-2 op-55>支持 JPG、PNG、WebP，最大 {{ props.maxSize }}MB</span>
        </div>

        <div
          v-show="!hasValue && isDragOver"
          flex="~ col items-center justify-center"
          bg="light dark:dark"
          h-full min-h-64 transition duration-200 text-teal-600 dark:text-teal-300
        >
          <div i-carbon-document-add text-3xl mb-3 />
          <strong text-sm>松开即可上传</strong>
        </div>

        <div
          v-show="hasValue"
          flex="~ col items-center justify-center relative"
        >
          <img
            :src="previewUrl"
            class="preview"
            max-h-110 max-w-full object-contain block
          >
          <button
            absolute top-3 right-3 z-10 w-9 h-9
            rounded-xl flex="~ items-center justify-center" bg="black/55" text-white backdrop-blur transition
            class="hover:bg-black/75"
            cursor-pointer
            title="preview image"
            @click.stop="handlePreview"
          >
            <div i-stash-expand-diagonal-duotone text-lg />
          </button>
          <button
            absolute top-3 left-3 z-10 w-9 h-9
            rounded-xl flex="~ items-center justify-center" bg="black/55" text-white backdrop-blur transition
            hover:bg-red-500 cursor-pointer title="移除图片"
            @click.stop="removeImage"
          >
            <div i-carbon-trash-can />
          </button>
        </div>
      </div>
    </div>

    <!-- URL 模式 -->
    <div v-else flex="~ col gap-3">
      <div flex="~ col sm:row gap-2">
        <input
          v-model="urlInput" type="url" placeholder="粘贴图片链接"
          app-field flex-1 @keydown.enter="confirmUrl"
        >
        <button soft-btn whitespace-nowrap @click="confirmUrl">
          <div i-carbon-arrow-right />
          加载图片
        </button>
      </div>
      <div
        v-if="hasValue"
        border="~ slate-200 dark:white/10 rounded-2xl"
        min-h-64 w-full bg="slate-50/60 dark:white/2"
        flex flex-col items-center justify-center relative overflow-hidden
      >
        <img
          :src="previewUrl"
          class="preview"
          rounded max-h-100 max-w-full object-contain block p-2
        >
      </div>
    </div>
  </div>
</template>
