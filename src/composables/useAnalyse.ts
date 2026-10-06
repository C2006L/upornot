import type { FavoriteResult, ProviderConfig } from '~/types'
import { useStorage } from '@vueuse/core'
import { computed, ref } from 'vue'
import { addAdditionalPreset, additionalPromptPresets, computeStringHash, favoriteResults, fileToBase64, generateContent, removeAdditionalPreset, saveImage } from '~/logic'

const DEFAULT_SYSTEM_INSTRUCTION = '你是一个图像理解与写作助手。请严格遵循用户给出的任务、格式、语言和篇幅要求，不要擅自简化任务。'
const MAX_CONTINUATION_ROUNDS = 3

function getRequestedMinLength(prompt: string): number | undefined {
  const matches = [...prompt.matchAll(/(?:不少于|至少|最低|最少|总字数(?:为|达到|不少于)?)\s*(\d{2,5})\s*字/g)]
  const lengths = matches.map(match => Number(match[1])).filter(Number.isFinite)
  return lengths.length > 0 ? Math.max(...lengths) : undefined
}

function countOutputCharacters(text: string): number {
  return text.replace(/\s/g, '').length
}

function buildTaskContract(taskPrompt: string, additionalPrompt: string, requestedMinLength?: number): string {
  const sections = [
    '## 执行协议',
    '下面的“用户任务”是本次输出的核心约束，不得弱化、概括、替换或擅自省略。写作前先在内部整理人物、场景、时间线、因果关系和需要覆盖的要求，但不要输出规划过程。正文必须沿一条清晰主线自然推进，避免无铺垫的场景跳转、身份变化和前后矛盾。',
    '## 用户任务',
    taskPrompt,
  ]
  if (additionalPrompt)
    sections.push('## 用户补充要求（与图片识别冲突时以此为准）', additionalPrompt)
  if (requestedMinLength)
    sections.push('## 篇幅硬约束', `正文不得少于 ${requestedMinLength} 字。在达到该长度前不要总结、收尾或提前结束，但也不得使用重复句子凑字数。`)
  sections.push('## 输出要求', '只输出最终正文，不要复述要求，不要展示提纲、分析或自我说明。')
  return sections.join('\n\n')
}

function removeContinuationOverlap(existingText: string, continuationText: string): string {
  const maxOverlap = Math.min(existingText.length, continuationText.length, 2000)
  for (let length = maxOverlap; length >= 12; length--) {
    if (existingText.endsWith(continuationText.slice(0, length)))
      return continuationText.slice(length).trimStart()
  }
  return continuationText
}

function removeConsecutiveDuplicateSentences(text: string): string {
  const sentences = text.match(/[^。！？!?]*[。！？!?]+|[^。！？!?]+$/g)
  if (!sentences)
    return text

  const result: string[] = []
  let previousKey = ''
  for (const sentence of sentences) {
    const key = sentence.replace(/\s/g, '').trim()
    if (key.length >= 8 && key === previousKey)
      continue
    result.push(sentence)
    previousKey = key
  }
  return result.join('')
}

export function useAnalyse() {
  const image = ref<File | string | null>(null)
  const base64Image = ref<string | null>(null)

  const selectedApiUrl = useStorage<string>('selected-api-url', 'http://localhost:11434')
  const selectedApiKey = useStorage<string>('selected-api-key', 'ollama')
  const selectedModelId = useStorage('selected-model', 'gemma3:4b')
  const selectedPromptText = useStorage<string>('selected-prompt-text', '分析这张图片')
  const generationTemperature = useStorage<number>('generation-temperature', 0.7)
  const generationMaxTokens = useStorage<number>('generation-max-tokens', 8192)
  const generationContextTokens = useStorage<number>('generation-context-tokens', 8192)
  const generationRepeatPenalty = useStorage<number>('generation-repeat-penalty', 1.15)
  const autoContinueLongText = useStorage<boolean>('auto-continue-long-text', true)
  const additionalPrompt = ref('')
  const result = ref('')
  const errorMsg = ref('')
  const analyseButtonLoading = ref(false)
  const saveButtonDisabled = ref(false)

  // 结果编辑
  const isEditingResult = ref(false)
  const editedResultText = ref('')

  const lastFavoriteResult = ref<FavoriteResult | null>(null)

  const analyseButtonDisabled = computed(() => {
    if (!selectedModelId.value || !selectedPromptText.value || !selectedApiUrl.value)
      return true
    if (typeof image.value === 'string')
      return !image.value
    return !image.value
  })

  // 额外提示词预设（标签栏模式）
  const selectedAdditionalPresetId = ref<string | null>(null)

  function handleSelectPreset(id: string) {
    if (selectedAdditionalPresetId.value === id) {
      selectedAdditionalPresetId.value = null
      return
    }
    selectedAdditionalPresetId.value = id
    const preset = additionalPromptPresets.value.find(p => p.id === id)
    if (preset)
      additionalPrompt.value = preset.content
  }

  function handleDeletePreset(id: string) {
    if (!window.confirm('确定要删除这个预设吗？')) {
      ;(document.activeElement as HTMLElement)?.blur()
      return
    }
    if (selectedAdditionalPresetId.value === id)
      selectedAdditionalPresetId.value = null
    removeAdditionalPreset(id)
  }

  function handleSaveAsPreset() {
    const content = additionalPrompt.value.trim()
    if (!content)
      return
    const name = window.prompt('输入预设标签名：', '')
    if (!name || !name.trim())
      return
    selectedAdditionalPresetId.value = addAdditionalPreset(name.trim(), content)
  }

  function handleStartEditResult() {
    editedResultText.value = result.value
    isEditingResult.value = true
  }

  function handleConfirmEditResult() {
    result.value = editedResultText.value
    if (lastFavoriteResult.value)
      lastFavoriteResult.value.result = editedResultText.value
    isEditingResult.value = false
  }

  function handleCancelEditResult() {
    isEditingResult.value = false
  }

  // 仅用于开发测试
  function handleFillTestResult() {
    errorMsg.value = ''
    isEditingResult.value = false
    saveButtonDisabled.value = false
    result.value = [
      '## 测试结果',
      '',
      '这是一段用于**开发测试**的模拟分析结果。',
      '',
      '- 列表项一',
      '- 列表项二',
      '- 列表项三',
      '',
      '> 引用：你可以点击「编辑结果」来测试编辑功能。',
      '',
      '```js',
      'console.log(\'hello fuck-or-not\')',
      '```',
    ].join('\n')
    lastFavoriteResult.value = {
      model: selectedModelId.value || 'test-model',
      mode: 'custom',
      imageHash: '',
      mimeType: 'image/png',
      time: Date.now(),
      result: result.value,
      prompt: selectedPromptText.value,
      additionalPrompt: additionalPrompt.value.trim(),
      _pendingBase64: '',
      _sourceUrl: undefined,
    } as any
  }

  async function urlToBase64(url: string): Promise<{ base64: string, mimeType: string }> {
    const res = await fetch(url)
    if (!res.ok)
      throw new Error(`无法获取图片: ${res.status} ${res.statusText}`)
    const blob = await res.blob()
    const mimeType = blob.type || 'image/jpeg'
    const arrayBuffer = await blob.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    let binary = ''
    for (let i = 0; i < bytes.byteLength; i++)
      binary += String.fromCharCode(bytes[i])
    return { base64: btoa(binary), mimeType }
  }

  async function handleAnalyseButtonClick() {
    const apiUrl = selectedApiUrl.value
    const apiKey = selectedApiKey.value

    if (!apiUrl) {
      errorMsg.value = '请先填写 API 地址。'
      return
    }

    if (!image.value) {
      errorMsg.value = '请先上传图片或输入图片链接。'
      return
    }
    if (image.value instanceof File && image.value.size > 20 * 1024 * 1024) {
      errorMsg.value = '图片大小不能超过 20MB，请选择较小的图片。'
      return
    }

    if (!selectedPromptText.value) {
      errorMsg.value = '请先填写 Prompt。'
      return
    }

    analyseButtonLoading.value = true
    errorMsg.value = ''
    result.value = ''

    try {
      const taskPrompt = selectedPromptText.value.trim()
      const additionalTaskPrompt = additionalPrompt.value.trim()
      const requestedMinLength = getRequestedMinLength(taskPrompt)
      const userText = buildTaskContract(taskPrompt, additionalTaskPrompt, requestedMinLength)

      let sourceUrl: string | undefined
      let mimeType: string
      if (typeof image.value === 'string') {
        sourceUrl = image.value
        const result = await urlToBase64(sourceUrl)
        base64Image.value = result.base64
        mimeType = result.mimeType
      }
      else {
        base64Image.value = await fileToBase64(image.value!)
        mimeType = image.value!.type
      }
      const contents: Parameters<typeof generateContent>[1] = [
        { text: userText },
        { inlineData: { data: base64Image.value, mimeType } },
      ]

      const provider: ProviderConfig = {
        id: 'direct-api',
        name: '当前 API',
        type: 'openai' as const,
        apiUrl,
        apiKey,
        models: [selectedModelId.value],
        generationConfig: {
          temperature: generationTemperature.value,
          maxTokens: generationMaxTokens.value,
          numCtx: generationContextTokens.value,
          repeatPenalty: generationRepeatPenalty.value,
          repeatLastN: 512,
        },
      }

      let response = await generateContent(
        selectedModelId.value,
        contents,
        DEFAULT_SYSTEM_INSTRUCTION,
        provider,
        (chunk) => {
          result.value += chunk
        },
      )

      let fullText = removeConsecutiveDuplicateSentences(response.text || '')
      if (autoContinueLongText.value && requestedMinLength) {
        for (let round = 0; round < MAX_CONTINUATION_ROUNDS && countOutputCharacters(fullText) < requestedMinLength; round++) {
          const currentLength = countOutputCharacters(fullText)
          const remainingLength = requestedMinLength - currentLength
          const previousEnding = fullText.slice(-1500)
          const continuationPrompt = [
            '你正在续写同一篇正文。原始用户任务与补充要求仍然全部有效，不能因为进入续写阶段而忽略。',
            userText,
            `当前正文约 ${currentLength} 字，还差约 ${remainingLength} 字。`,
            '严格保持已有的人物、场景、时间线、叙述视角和因果关系。从最后一句之后直接继续，不要重复前文，不要另起标题，不要重新开场。',
            `已有正文末尾：\n${previousEnding}`,
          ].join('\n\n')

          result.value += '\n\n'
          const continuation = await generateContent(
            selectedModelId.value,
            [{ text: continuationPrompt }],
            DEFAULT_SYSTEM_INSTRUCTION,
            provider,
            (chunk) => {
              result.value += chunk
            },
          )
          const continuationText = removeContinuationOverlap(fullText, continuation.text || '')
          if (!continuationText.trim())
            break
          const comparisonWindow = fullText.slice(-3000).replace(/\s/g, '')
          const continuationKey = continuationText.replace(/\s/g, '')
          if (continuationKey.length >= 20 && comparisonWindow.includes(continuationKey))
            break
          fullText += `\n\n${continuationText}`
          fullText = removeConsecutiveDuplicateSentences(fullText)
          response = continuation
        }
      }
      fullText = removeConsecutiveDuplicateSentences(fullText)
      const lastImage = base64Image.value

      console.log(response)
      if (!fullText) {
        if ((response.candidates && response.candidates[0]?.finishReason === 'PROHIBITED_CONTENT')
          || (response as any).promptFeedback?.blockReason) {
          errorMsg.value = '内容被安全过滤器阻止，请重试或更换模型。'
        }
        else {
          errorMsg.value = '发生未知错误，请稍后再试或检查控制台日志。'
        }
      }
      else {
        saveButtonDisabled.value = false
        result.value = fullText
        errorMsg.value = ''
        lastFavoriteResult.value = {
          model: selectedModelId.value,
          mode: 'custom',
          imageHash: '',
          mimeType,
          time: Date.now(),
          result: fullText,
          prompt: selectedPromptText.value,
          additionalPrompt: additionalPrompt.value.trim(),
          _pendingBase64: lastImage,
          _sourceUrl: sourceUrl,
        } as any
      }
    }
    catch (error) {
      console.error('[Analysis Error]', { error })
      errorMsg.value = `Error: ${(error as Error).message || String(error)}`
    }
    finally {
      analyseButtonLoading.value = false
    }
  }

  async function handleSaveButtonClick() {
    saveButtonDisabled.value = true
    const pending = lastFavoriteResult.value as any
    const base64 = pending._pendingBase64 as string
    const mimeType = pending.mimeType as string
    const sourceUrl = pending._sourceUrl as string | undefined

    let hash: string
    const item: FavoriteResult = {
      model: pending.model,
      mode: pending.mode,
      imageHash: '',
      mimeType,
      time: pending.time,
      result: pending.result,
      prompt: pending.prompt ?? '',
      additionalPrompt: pending.additionalPrompt ?? '',
    }

    if (sourceUrl) {
      hash = await computeStringHash(sourceUrl)
      item.imageHash = hash
      item.imageUrl = sourceUrl
    }
    else {
      hash = await saveImage(base64, mimeType)
      item.imageHash = hash
    }

    if (!favoriteResults.data.value)
      favoriteResults.data.value = []
    favoriteResults.data.value.unshift(item)
  }

  return {
    image,
    selectedApiUrl,
    selectedApiKey,
    selectedModelId,
    selectedPromptText,
    generationTemperature,
    generationMaxTokens,
    generationContextTokens,
    generationRepeatPenalty,
    autoContinueLongText,
    additionalPrompt,
    result,
    errorMsg,
    analyseButtonLoading,
    analyseButtonDisabled,
    saveButtonDisabled,
    additionalPromptPresets,
    selectedAdditionalPresetId,
    handleSelectPreset,
    handleDeletePreset,
    handleSaveAsPreset,
    handleAnalyseButtonClick,
    handleSaveButtonClick,
    isEditingResult,
    editedResultText,
    handleStartEditResult,
    handleConfirmEditResult,
    handleCancelEditResult,
    handleFillTestResult,
  }
}
