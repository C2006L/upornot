import type { FavoriteResult, ProviderConfig } from '~/types'
import { useStorage } from '@vueuse/core'
import { computed, ref } from 'vue'
import { addAdditionalPreset, additionalPromptPresets, computeStringHash, favoriteResults, fileToBase64, generateContent, removeAdditionalPreset, saveImage } from '~/logic'

const DEFAULT_SYSTEM_INSTRUCTION = '你是一个图像理解与长文写作助手。用户要求的优先级最高。请严格遵循任务、人物设定、称谓、叙述视角、事件顺序、格式、语言和篇幅，不得擅自简化或遗漏。写作时保持物理动作、空间位置、服装状态和前后因果连续。'
const PLANNING_SYSTEM_INSTRUCTION = '你是长文编辑与视觉分析助手。你的工作是把图片事实和用户要求整理成可执行的写作蓝图，不创作正文，不删减用户要求，不输出与任务无关的说明。'
const REVIEW_SYSTEM_INSTRUCTION = '你是严格的长文审稿助手。只检查正文对用户要求和写作蓝图的完成情况，指出尚未覆盖或前后不一致的事项，不改写正文。'
const MAX_CONTINUATION_ROUNDS = 8
const TARGET_SEGMENT_LENGTH = 1100
const MAX_PLANNED_SEGMENTS = 6

function getRequestedMinLength(prompt: string): number | undefined {
  const matches = [
    ...prompt.matchAll(/(?:不少于|至少|最低|最少|总字数(?:为|达到|不少于)?|字数(?:为|达到|不少于)?)\s*(\d{2,5})\s*字/g),
    ...prompt.matchAll(/(?:写|输出|生成|创作)(?:一篇|一段)?(?:约|大约)?\s*(\d{2,5})\s*字/g),
    ...prompt.matchAll(/(\d{2,5})\s*字(?:以上|起)/g),
  ]
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

function buildHardRequirements(additionalPrompt: string): string {
  if (!additionalPrompt)
    return ''
  return [
    '以下内容是用户已经确认的补充事实与不可违反要求，优先级高于图片中的不确定推断。',
    '必须逐条落实到正文；不能忽略、淡化、替换，也不能把它们原样列成清单或解释给读者。',
    additionalPrompt,
  ].join('\n')
}

function buildPlanningPrompt(taskContract: string, hardRequirements: string): string {
  return [
    '请结合图片，为下面的任务制作一份简洁但完整的内部写作蓝图。',
    '必须逐项输出以下栏目：',
    '1. 图片可见事实：人物数量、外观、服装、姿势、物品、环境；不确定的内容明确标为不确定，禁止把猜测写成事实。',
    '2. 固定设定：人物称谓、身份关系、叙述视角、时间、地点以及全文不得改变的状态。',
    '3. 情节推进：按因果顺序列出 6 至 10 个互不重复的连续节点，每个节点必须带来新的信息、动作或状态变化，并说明如何自然过渡到下一节点；禁止循环回到已经完成的场面。',
    '4. 要求清单：提取用户的每一项明确要求、禁止事项、格式和篇幅要求，不得合并遗漏。',
    '5. 一致性风险：列出容易出现的称谓混乱、动作跳跃、物品凭空出现、状态复原和内容重复问题。',
    '控制在 1600 字以内，只输出蓝图，不写正文。',
    '',
    taskContract,
    ...(hardRequirements ? ['## 最高优先级补充要求（必须逐条纳入蓝图）', hardRequirements] : []),
  ].join('\n')
}

function getPlannedSegmentCount(requestedMinLength?: number): number {
  if (!requestedMinLength)
    return 1
  return Math.min(MAX_PLANNED_SEGMENTS, Math.max(1, Math.ceil(requestedMinLength / TARGET_SEGMENT_LENGTH)))
}

function buildSegmentPrompt(options: {
  taskContract: string
  plan: string
  segmentIndex: number
  segmentCount: number
  targetLength: number
  existingLength: number
  completedDraft: string
  hardRequirements: string
  reviewNotes?: string
}): string {
  const { taskContract, plan, segmentIndex, segmentCount, targetLength, existingLength, completedDraft, hardRequirements, reviewNotes } = options
  const isFirst = segmentIndex === 1
  const isLast = segmentIndex === segmentCount
  const instructions = [
    `现在写正文的第 ${segmentIndex}/${segmentCount} 部分，本部分目标不少于 ${targetLength} 字。`,
    `当前正文已有约 ${existingLength} 字。必须沿写作蓝图的顺序推进，并覆盖与本部分进度对应的情节点和要求。`,
    isFirst
      ? '从正文开场直接写起，先稳定人物称谓、空间关系与叙述视角；不要输出标题、提纲或说明。'
      : '先在内部对照蓝图确认哪些节点已经完成，然后只写尚未完成的后续节点。从已有正文最后一句之后直接续写；不要重新开场、回顾前文、复述已经发生的对话、动作、感受或场面，也不要只是替换同义词重复表达。',
    isLast
      ? '这是最后一个计划段：优先补齐尚未完成的要求，完成主要因果链后自然收束，不要在结尾复述提示词或罗列设定。'
      : '这不是结尾：推进新的有效情节并为下一部分留下自然承接点，不要总结、收尾或提前结束。',
    '本部分至少推进两个新的信息、动作或因果节点，使人物位置、关系、目标或场景状态发生可辨认的变化。相同动作只有在原始任务明确要求时才可再次出现，而且必须具有新的原因、过程和结果。',
    '只输出可以直接拼接到已有内容之后的正文。每个动作必须有发起者、承受者和自然过渡，代词指向必须清楚；禁止复制“已完成正文”中的句子。',
  ]
  if (reviewNotes)
    instructions.push(`审稿发现的待补事项如下，最后一段必须自然完成，不能写成清单：\n${reviewNotes}`)

  return [
    '## 原始任务协议',
    taskContract,
    '## 内部写作蓝图',
    plan,
    ...(completedDraft ? ['## 已完成正文（这是已经发生且不可重写的历史，只能向后承接）', completedDraft] : []),
    '## 本轮写作指令',
    ...instructions,
    ...(hardRequirements
      ? ['## 最终硬约束核对（开始输出前在内部逐条确认；不得遗漏或复述为说明）', hardRequirements]
      : []),
  ].join('\n\n')
}

function buildReviewPrompt(taskContract: string, plan: string, draft: string, hardRequirements: string): string {
  return [
    '请对照原始任务和写作蓝图审查当前正文。',
    '只列出最后一部分必须补齐的内容：遗漏要求、尚未完成的情节节点、称谓或视角错误、动作和状态矛盾。',
    '已经完成的内容不要重复评价。若没有缺项，只输出“无”。控制在 600 字以内。',
    '## 原始任务协议',
    taskContract,
    '## 内部写作蓝图',
    plan,
    '## 当前正文',
    draft.slice(-10000),
    ...(hardRequirements ? ['## 最高优先级补充要求（必须逐条检查）', hardRequirements] : []),
  ].join('\n\n')
}

function withGenerationConfig(provider: ProviderConfig, overrides: ProviderConfig['generationConfig']): ProviderConfig {
  return {
    ...provider,
    generationConfig: {
      ...provider.generationConfig,
      ...overrides,
    },
  }
}

function buildContinuityContext(text: string, contextTokens: number): string {
  const maxCharacters = Math.max(2200, Math.min(7000, Math.floor(contextTokens * 0.42)))
  if (text.length <= maxCharacters)
    return text

  const openingLength = Math.min(900, Math.floor(maxCharacters * 0.2))
  const endingLength = maxCharacters - openingLength
  return [
    '【开头固定设定】',
    text.slice(0, openingLength),
    '【中段内容已经完成，此处因上下文容量省略；不得回到或复演中段情节】',
    '【最近正文】',
    text.slice(-endingLength),
  ].join('\n')
}

function removeContinuationOverlap(existingText: string, continuationText: string): string {
  const maxOverlap = Math.min(existingText.length, continuationText.length, 2000)
  for (let length = maxOverlap; length >= 12; length--) {
    if (existingText.endsWith(continuationText.slice(0, length)))
      return continuationText.slice(length).trimStart()
  }
  return continuationText
}

function normalizeForComparison(text: string): string {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
}

function getNgramSimilarity(left: string, right: string, size = 3): number {
  const a = normalizeForComparison(left)
  const b = normalizeForComparison(right)
  if (!a || !b)
    return 0
  if (a === b)
    return 1
  if (Math.min(a.length, b.length) >= 16 && (a.includes(b) || b.includes(a)))
    return Math.min(a.length, b.length) / Math.max(a.length, b.length)
  if (a.length < size || b.length < size)
    return 0

  const aGrams = new Set<string>()
  const bGrams = new Set<string>()
  for (let i = 0; i <= a.length - size; i++)
    aGrams.add(a.slice(i, i + size))
  for (let i = 0; i <= b.length - size; i++)
    bGrams.add(b.slice(i, i + size))
  let overlap = 0
  for (const gram of aGrams) {
    if (bGrams.has(gram))
      overlap++
  }
  return (2 * overlap) / (aGrams.size + bGrams.size)
}

function removeRepeatedPassages(text: string): string {
  const acceptedSentences: string[] = []
  const acceptedParagraphs: string[] = []
  const seenSentenceKeys = new Set<string>()
  const seenParagraphKeys = new Set<string>()
  const cleanedParagraphs: string[] = []

  for (const paragraph of text.split(/\n{2,}/)) {
    const sentences = paragraph.match(/[^。！？!?]*[。！？!?]+|[^。！？!?]+$/g) || [paragraph]
    const uniqueSentences: string[] = []
    for (const sentence of sentences) {
      const normalized = normalizeForComparison(sentence)
      const isDuplicate = normalized.length >= 18 && (
        seenSentenceKeys.has(normalized)
        || acceptedSentences.slice(-240).some(previous => getNgramSimilarity(sentence, previous) >= 0.9)
      )
      if (isDuplicate)
        continue
      uniqueSentences.push(sentence)
      if (normalized.length >= 18) {
        acceptedSentences.push(sentence)
        seenSentenceKeys.add(normalized)
      }
    }

    const cleanedParagraph = uniqueSentences.join('').trim()
    if (!cleanedParagraph)
      continue
    const normalizedParagraph = normalizeForComparison(cleanedParagraph)
    const isDuplicateParagraph = normalizedParagraph.length >= 60 && (
      seenParagraphKeys.has(normalizedParagraph)
      || acceptedParagraphs.slice(-80).some(previous => getNgramSimilarity(cleanedParagraph, previous, 4) >= 0.84)
    )
    if (isDuplicateParagraph)
      continue
    cleanedParagraphs.push(cleanedParagraph)
    if (normalizedParagraph.length >= 60) {
      acceptedParagraphs.push(cleanedParagraph)
      seenParagraphKeys.add(normalizedParagraph)
    }
  }

  return cleanedParagraphs.join('\n\n')
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
  const generationTargetLength = useStorage<number>('generation-target-length', 0)
  const generationRepeatPenalty = useStorage<number>('generation-repeat-penalty', 1.15)
  const autoContinueLongText = useStorage<boolean>('auto-continue-long-text', true)
  const enhancedWritingFlow = useStorage<boolean>('enhanced-writing-flow', true)
  const additionalPrompt = ref('')
  const result = ref('')
  const errorMsg = ref('')
  const generationStage = ref('')
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
    generationStage.value = '正在准备图片…'

    try {
      const taskPrompt = selectedPromptText.value.trim()
      const additionalTaskPrompt = additionalPrompt.value.trim()
      const requestedMinLength = generationTargetLength.value > 0
        ? Math.floor(generationTargetLength.value)
        : getRequestedMinLength(taskPrompt)
      const userText = buildTaskContract(taskPrompt, additionalTaskPrompt, requestedMinLength)
      const hardRequirements = buildHardRequirements(additionalTaskPrompt)
      const planningSource = [
        `## 用户任务\n${taskPrompt}`,
        ...(additionalTaskPrompt ? [`## 用户补充要求\n${additionalTaskPrompt}`] : []),
        ...(requestedMinLength ? [`## 最低篇幅\n${requestedMinLength} 字`] : []),
      ].join('\n\n')

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
          repeatLastN: Math.min(generationContextTokens.value, 2048),
        },
      }
      let response: Awaited<ReturnType<typeof generateContent>>
      let fullText = ''

      if (enhancedWritingFlow.value) {
        generationStage.value = '正在识别图片并规划全文…'
        const planningProvider = withGenerationConfig(provider, {
          temperature: Math.min(generationTemperature.value, 0.35),
          maxTokens: Math.min(generationMaxTokens.value, 2200),
          repeatPenalty: Math.max(generationRepeatPenalty.value, 1.08),
        })
        const planResponse = await generateContent(
          selectedModelId.value,
          [
            { text: buildPlanningPrompt(planningSource, hardRequirements) },
            { inlineData: { data: base64Image.value, mimeType } },
          ],
          PLANNING_SYSTEM_INSTRUCTION,
          planningProvider,
        )
        const writingPlan = planResponse.text.trim()
        if (!writingPlan)
          throw new Error('模型未能生成写作蓝图，请重试或暂时关闭“增强创作流程”。')

        const segmentCount = autoContinueLongText.value
          ? getPlannedSegmentCount(requestedMinLength)
          : 1
        let reviewNotes = ''
        response = planResponse

        for (let segmentIndex = 1; segmentIndex <= segmentCount; segmentIndex++) {
          if (segmentIndex === segmentCount && segmentCount > 1 && fullText) {
            generationStage.value = '正在对照要求检查缺项…'
            const reviewResponse = await generateContent(
              selectedModelId.value,
              [{ text: buildReviewPrompt(planningSource, writingPlan, fullText, hardRequirements) }],
              REVIEW_SYSTEM_INSTRUCTION,
              withGenerationConfig(provider, { temperature: 0.2, maxTokens: Math.min(generationMaxTokens.value, 900) }),
            )
            if (reviewResponse.text.trim() !== '无')
              reviewNotes = reviewResponse.text.trim()
          }

          const currentLength = countOutputCharacters(fullText)
          const remainingSegments = segmentCount - segmentIndex + 1
          const remainingLength = Math.max(0, (requestedMinLength || TARGET_SEGMENT_LENGTH) - currentLength)
          const segmentTarget = Math.max(700, Math.ceil(remainingLength / remainingSegments) + 120)
          const segmentPrompt = buildSegmentPrompt({
            taskContract: userText,
            plan: writingPlan,
            segmentIndex,
            segmentCount,
            targetLength: segmentTarget,
            existingLength: currentLength,
            completedDraft: buildContinuityContext(fullText, generationContextTokens.value),
            hardRequirements,
            reviewNotes: segmentIndex === segmentCount ? reviewNotes : undefined,
          })
          const segmentProvider = withGenerationConfig(provider, {
            maxTokens: Math.min(generationMaxTokens.value, Math.max(2048, Math.ceil(segmentTarget * 2.2))),
          })

          generationStage.value = `正在写第 ${segmentIndex}/${segmentCount} 部分…`
          if (fullText)
            result.value += '\n\n'
          response = await generateContent(
            selectedModelId.value,
            [{ text: segmentPrompt }],
            DEFAULT_SYSTEM_INSTRUCTION,
            segmentProvider,
            (chunk) => {
              result.value += chunk
            },
          )
          const segmentText = removeContinuationOverlap(fullText, response.text || '')
          if (!segmentText.trim())
            break
          const comparisonWindow = fullText.slice(-5000).replace(/\s/g, '')
          const segmentKey = segmentText.replace(/\s/g, '')
          if (segmentKey.length >= 20 && comparisonWindow.includes(segmentKey))
            break
          fullText = removeRepeatedPassages(`${fullText}${fullText ? '\n\n' : ''}${segmentText}`)
        }

        if (autoContinueLongText.value && requestedMinLength) {
          for (let round = segmentCount; round < MAX_CONTINUATION_ROUNDS; round++) {
            const currentLength = countOutputCharacters(fullText)
            if (currentLength >= requestedMinLength)
              break
            const remainingLength = requestedMinLength - currentLength
            generationStage.value = `正在补足篇幅（约 ${currentLength}/${requestedMinLength} 字）…`
            result.value += '\n\n'
            response = await generateContent(
              selectedModelId.value,
              [{
                text: buildSegmentPrompt({
                  taskContract: userText,
                  plan: writingPlan,
                  segmentIndex: round + 1,
                  segmentCount: round + 1,
                  targetLength: Math.max(700, remainingLength + 150),
                  existingLength: currentLength,
                  completedDraft: buildContinuityContext(fullText, generationContextTokens.value),
                  hardRequirements,
                }),
              }],
              DEFAULT_SYSTEM_INSTRUCTION,
              provider,
              (chunk) => {
                result.value += chunk
              },
            )
            const continuationText = removeContinuationOverlap(fullText, response.text || '')
            if (!continuationText.trim())
              break
            const comparisonWindow = fullText.slice(-5000).replace(/\s/g, '')
            const continuationKey = continuationText.replace(/\s/g, '')
            if (continuationKey.length >= 20 && comparisonWindow.includes(continuationKey))
              break
            fullText = removeRepeatedPassages(`${fullText}\n\n${continuationText}`)
          }
        }
      }
      else {
        generationStage.value = '正在生成正文…'
        const contents: Parameters<typeof generateContent>[1] = [
          { text: [userText, hardRequirements ? `## 最高优先级补充要求\n${hardRequirements}` : ''].filter(Boolean).join('\n\n') },
          { inlineData: { data: base64Image.value, mimeType } },
        ]
        response = await generateContent(
          selectedModelId.value,
          contents,
          DEFAULT_SYSTEM_INSTRUCTION,
          provider,
          (chunk) => {
            result.value += chunk
          },
        )
        fullText = removeRepeatedPassages(response.text || '')

        if (autoContinueLongText.value && requestedMinLength) {
          for (let round = 0; round < MAX_CONTINUATION_ROUNDS && countOutputCharacters(fullText) < requestedMinLength; round++) {
            const currentLength = countOutputCharacters(fullText)
            const remainingLength = requestedMinLength - currentLength
            generationStage.value = `正在续写（约 ${currentLength}/${requestedMinLength} 字）…`
            const continuationPrompt = [
              '你正在续写同一篇正文，原始用户任务与补充要求仍然全部有效。',
              userText,
              `当前正文约 ${currentLength} 字，还差约 ${remainingLength} 字。`,
              '保持已有的人物称谓、场景、时间线、叙述视角、物品状态和因果关系。从最后一句之后直接继续，不要重复前文、重新开场或另起标题。',
              `已完成正文（只能承接，严禁复述）：\n${buildContinuityContext(fullText, generationContextTokens.value)}`,
              ...(hardRequirements ? [`最高优先级补充要求（逐条落实，不得遗漏）：\n${hardRequirements}`] : []),
            ].join('\n\n')

            result.value += '\n\n'
            response = await generateContent(
              selectedModelId.value,
              [{ text: continuationPrompt }],
              DEFAULT_SYSTEM_INSTRUCTION,
              provider,
              (chunk) => {
                result.value += chunk
              },
            )
            const continuationText = removeContinuationOverlap(fullText, response.text || '')
            if (!continuationText.trim())
              break
            const comparisonWindow = fullText.slice(-3000).replace(/\s/g, '')
            const continuationKey = continuationText.replace(/\s/g, '')
            if (continuationKey.length >= 20 && comparisonWindow.includes(continuationKey))
              break
            fullText = removeRepeatedPassages(`${fullText}\n\n${continuationText}`)
          }
        }
      }

      fullText = removeRepeatedPassages(fullText)
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
      generationStage.value = ''
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
    generationTargetLength,
    generationRepeatPenalty,
    autoContinueLongText,
    enhancedWritingFlow,
    additionalPrompt,
    result,
    errorMsg,
    generationStage,
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
