<script setup lang="ts">
import { computed } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import Button from '~/components/Button.vue'
import ImageUploader from '~/components/ImageUploader.vue'
import Input from '~/components/Input.vue'
import MarkdownRenderer from '~/components/MarkdownRenderer.vue'
import { useAnalyse } from '~/composables/useAnalyse'
import { version } from '../../package.json'

defineOptions({ name: 'IndexPage' })

const {
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
  mandatoryTerms,
  result,
  errorMsg,
  saveErrorMsg,
  resultWarningMsg,
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
} = useAnalyse()

const isDev = import.meta.env.DEV
const promptLength = computed(() => selectedPromptText.value.trim().length)
const resultLength = computed(() => result.value.replace(/\s/g, '').length)
const connectionReady = computed(() => Boolean(selectedApiUrl.value && selectedModelId.value))
const hasUnsavedWork = computed(() => analyseButtonLoading.value || (result.value !== '' && !saveButtonDisabled.value))

onBeforeRouteLeave(() => {
  if (!hasUnsavedWork.value)
    return true
  return window.confirm(analyseButtonLoading.value
    ? '正在生成结果，离开页面将中断本次分析，确定要离开吗？'
    : '当前结果尚未保存，离开页面后将丢失，确定要离开吗？')
})
</script>

<template>
  <section text-left mb-7 class="hero-panel">
    <div relative z-1 grid="~ cols-1 lg:cols-5 gap-6 items-end">
      <div lg:col-span-3>
        <div eyebrow mb-3>
          AI Visual Story Studio
        </div>
        <h1 text="4xl sm:5xl" font-black tracking-tight leading-tight text-slate-950 dark:text-white>
          从一张图片，开始一段故事。
        </h1>
        <p mt-4 max-w-2xl text="sm sm:base" leading-relaxed text-slate-600 dark:text-slate-400>
          连接你的本地或云端视觉模型，用可控 Prompt 完成图片理解、长文创作与结果整理。
        </p>
      </div>
      <div lg:col-span-2 flex="~ wrap lg:justify-end gap-2">
        <span class="status-pill" :class="connectionReady ? 'status-ready' : 'status-pending'">
          <span w-2 h-2 rounded-full :class="connectionReady ? 'bg-emerald-500' : 'bg-amber-500'" />
          {{ connectionReady ? '模型已配置' : '等待配置' }}
        </span>
        <span class="status-pill"><div i-carbon-code />v{{ version }}</span>
      </div>
    </div>
  </section>

  <div grid="~ cols-1 lg:cols-5 gap-5" text-left>
    <section app-card p="5 sm:6" lg:col-span-2>
      <div class="section-heading">
        <span class="step-badge">01</span>
        <div>
          <h2 text-lg font-bold>
            连接与模型
          </h2>
          <p text-xs mt-1 text-slate-500 dark:text-slate-400>
            配置兼容接口和本次使用的模型
          </p>
        </div>
      </div>

      <div space-y-4 mt-6>
        <div><span label>API 地址</span><Input v-model="selectedApiUrl" type="text" placeholder="http://localhost:11434" /></div>
        <div><span label>API 密钥</span><Input v-model="selectedApiKey" type="password" placeholder="Ollama 可填写 ollama" /></div>
        <div>
          <span label>当前模型</span>
          <Input v-model="selectedModelId" type="text" placeholder="llava-llama3:latest" />
          <p mt-2 text-xs text-slate-400>
            填写 Ollama 中完整的模型名称与标签
          </p>
        </div>
      </div>

      <details mt-5 class="advanced-panel">
        <summary flex="~ items-center justify-between gap-3" cursor-pointer text-sm font-semibold>
          <span flex="~ items-center gap-2"><div i-carbon-settings-adjust />高级生成设置</span>
          <div i-carbon-chevron-down class="details-arrow" />
        </summary>
        <div grid="~ cols-2 gap-3" mt-5>
          <label><span label>Temperature</span><input v-model.number="generationTemperature" app-field type="number" min="0" max="2" step="0.05"></label>
          <label><span label>重复惩罚</span><input v-model.number="generationRepeatPenalty" app-field type="number" min="1" max="2" step="0.01"></label>
          <label><span label>最大输出</span><input v-model.number="generationMaxTokens" app-field type="number" min="1" step="1"></label>
          <label><span label>上下文</span><input v-model.number="generationContextTokens" app-field type="number" min="2048" step="1024"></label>
          <label col-span-2><span label>目标字数（0 = 从 Prompt 自动识别）</span><input v-model.number="generationTargetLength" app-field type="number" min="0" max="30000" step="100"></label>
        </div>
        <label mt-4 flex="~ items-start gap-3" text-xs leading-relaxed cursor-pointer text-slate-500 dark:text-slate-400>
          <input v-model="autoContinueLongText" type="checkbox" mt-0.5 accent-teal-600>
          <span>识别“至少/不少于 N 字”并自动分段续写，必要时最多进行 8 轮。</span>
        </label>
        <label mt-3 flex="~ items-start gap-3" text-xs leading-relaxed cursor-pointer text-slate-500 dark:text-slate-400>
          <input v-model="enhancedWritingFlow" type="checkbox" mt-0.5 accent-teal-600>
          <span><strong text-slate-700 dark:text-slate-200>增强创作流程</strong>：先识图规划，再分段写作，并在末段前检查遗漏。逻辑更稳，但会增加等待时间。</span>
        </label>
        <p v-if="generationContextTokens < 12288 && enhancedWritingFlow" mt-3 text-xs leading-relaxed text-amber-600 dark:text-amber-300>
          当前上下文为 {{ generationContextTokens }}。复杂长文在显存允许时建议设为 12288–16384，避免后段遗忘设定。
        </p>
      </details>
    </section>

    <section app-card p="5 sm:6" lg:col-span-3>
      <div class="section-heading">
        <span class="step-badge step-purple">02</span>
        <div flex-1>
          <div flex="~ items-center justify-between gap-3">
            <h2 text-lg font-bold>
              核心 Prompt
            </h2>
            <span text-xs font-mono text-slate-400>{{ promptLength }} 字符</span>
          </div>
          <p text-xs mt-1 text-slate-500 dark:text-slate-400>
            定义任务、叙事方式、篇幅和必须遵守的约束
          </p>
        </div>
      </div>
      <textarea v-model="selectedPromptText" placeholder="写下完整的任务要求。越具体，模型越容易保持一致……" rows="15" app-field mt-6 resize-y leading-relaxed />
      <div mt-3 flex="~ items-start gap-2" text-xs text-slate-400>
        <div i-carbon-information mt-0.5 flex-shrink-0 />
        <span>建议明确人物称谓、叙述视角、场景顺序和禁止事项，减少长文中的设定漂移。</span>
      </div>
    </section>

    <section app-card p="5 sm:6" lg:col-span-3>
      <div class="section-heading">
        <span class="step-badge step-blue">03</span>
        <div>
          <h2 text-lg font-bold>
            参考图片
          </h2><p text-xs mt-1 text-slate-500 dark:text-slate-400>
            上传本地文件，或使用可公开访问的图片链接
          </p>
        </div>
      </div>
      <div mt-6>
        <ImageUploader v-model="image" />
      </div>
    </section>

    <section app-card p="5 sm:6" lg:col-span-2>
      <div class="section-heading">
        <span class="step-badge step-orange">04</span>
        <div>
          <h2 text-lg font-bold>
            图片补充
          </h2><p text-xs mt-1 text-slate-500 dark:text-slate-400>
            高优先级硬约束：会在每一段生成前重新核对
          </p>
        </div>
      </div>

      <div v-if="additionalPromptPresets.length > 0" flex="~ wrap" gap-2 mt-5>
        <span v-for="preset in additionalPromptPresets" :key="preset.id" flex="~ items-center">
          <button
            px-3 py-1.5 rounded-l-lg text-xs border="~ slate-200 dark:white/10" transition
            :class="selectedAdditionalPresetId === preset.id ? 'bg-orange-500/10 border-orange-400 text-orange-700 dark:text-orange-300' : 'bg-transparent hover:border-orange-300'"
            :title="preset.content" @click="handleSelectPreset(preset.id)"
          ><span max-w-32 truncate>{{ preset.name }}</span></button>
          <button
            w-7 self-stretch rounded-r-lg border="~ l-0 slate-200 dark:white/10" text-xs op-45 hover:op-100 hover:text-red-500 transition
            :title="`删除「${preset.name}」`" @click="handleDeletePreset(preset.id)"
          >×</button>
        </span>
      </div>

      <textarea v-model="additionalPrompt" placeholder="例如：人物实际穿着、饰品、称谓、动作顺序、环境细节。每条单独一行，模型会逐条作为硬约束执行……" rows="8" app-field mt-5 resize-y leading-relaxed />
      <p v-if="additionalPrompt.trim()" mt-2 text-xs leading-relaxed text-teal-700 dark:text-teal-300>
        已启用硬约束注入：补充内容会覆盖图片中的不确定推断，并在规划、每段生成和连续性核对时重复检查。
      </p>
      <label block mt-4>
        <span label>指定必须出现的词汇（可选）</span>
        <textarea v-model="mandatoryTerms" placeholder="用逗号或换行分隔，最多 12 个。例如：词语甲，词语乙" rows="3" app-field resize-y leading-relaxed />
      </label>
      <p text-xs mt-2 text-slate-400>
        程序会在最终结果中逐个核对；模型因自身训练拒绝的词无法由网页强制输出。
      </p>
      <div mt-3 flex="~ items-center justify-between gap-3">
        <span text-xs text-slate-400>{{ additionalPrompt.trim().length }} 字符</span>
        <button v-if="additionalPrompt.trim()" soft-btn px-3 py-1.5 text-xs @click="handleSaveAsPreset">
          <div i-carbon-bookmark-add />保存为预设
        </button>
      </div>
    </section>
  </div>

  <section app-card mt-5 p="4 sm:5" text-left>
    <div flex="~ col sm:row sm:items-center gap-4">
      <div flex-1>
        <div flex="~ items-center gap-2" font-semibold>
          <span w-2.5 h-2.5 rounded-full bg-teal-500 class="pulse-dot" />准备开始生成
        </div>
        <p text-xs mt-1 text-slate-500 dark:text-slate-400>
          {{ analyseButtonLoading && generationStage ? generationStage : '生成过程中请保持页面打开；长文可能自动进行多轮续写。' }}
        </p>
      </div>
      <div w-full sm:w-72>
        <Button :loading="analyseButtonLoading" :disabled="analyseButtonDisabled" :disable-on-loading="true" loading-text="正在生成…" @click="handleAnalyseButtonClick">
          <span flex="~ items-center justify-center gap-2"><div i-carbon-play-filled-alt />开始创作</span>
        </Button>
      </div>
    </div>
    <div v-if="isDev" flex justify-end mt-2>
      <button text-xs op-45 hover:op-100 transition @click="handleFillTestResult">
        填充测试结果
      </button>
    </div>
  </section>

  <section v-if="result !== '' || errorMsg !== ''" app-card mt-5 text-left overflow-hidden>
    <header p="4 sm:x-6 sm:y-5" border="b slate-200/80 dark:white/8" flex="~ items-center justify-between gap-3">
      <div flex="~ items-center gap-3">
        <span w-10 h-10 rounded-xl flex="~ items-center justify-center" :class="errorMsg ? 'bg-red-500/10 text-red-500' : 'bg-teal-500/10 text-teal-600 dark:text-teal-300'">
          <div :class="errorMsg ? 'i-carbon-warning-alt' : 'i-carbon-document'" />
        </span>
        <div>
          <h2 font-bold>
            {{ errorMsg ? '生成遇到问题' : '创作结果' }}
          </h2><p v-if="result" text-xs mt-0.5 text-slate-400>
            约 {{ resultLength }} 字符
          </p>
        </div>
      </div>
      <div v-if="result" flex="~ items-center gap-2">
        <template v-if="isEditingResult">
          <button soft-btn px-3 py-1.5 text-xs @click="handleConfirmEditResult">
            <div i-carbon-checkmark />确认
          </button>
          <button soft-btn px-3 py-1.5 text-xs hover:text-red-500 @click="handleCancelEditResult">
            <div i-carbon-close />取消
          </button>
        </template>
        <button v-else soft-btn px-3 py-1.5 text-xs @click="handleStartEditResult">
          <div i-carbon-edit />编辑
        </button>
      </div>
    </header>

    <div p="5 sm:6">
      <div v-if="errorMsg" p-4 rounded-xl whitespace-pre-wrap text-sm bg="red-500/10" text-red-700 dark:text-red-300 border="~ red-500/15">
        {{ errorMsg }}
      </div>
      <div v-if="resultWarningMsg" mb-4 p-4 rounded-xl whitespace-pre-wrap text-sm bg="amber-500/10" text-amber-800 dark:text-amber-200 border="~ amber-500/20">
        {{ resultWarningMsg }}
      </div>
      <textarea v-if="isEditingResult" v-model="editedResultText" rows="20" app-field resize-y leading-relaxed />
      <article v-else-if="result" select-text class="result-paper">
        <MarkdownRenderer :content="result" />
      </article>
    </div>

    <footer v-if="result" p="4 sm:x-6" border="t slate-200/80 dark:white/8" bg="slate-50/70 dark:white/2" flex="~ col sm:row sm:items-center sm:justify-between gap-3">
      <p v-if="saveErrorMsg" text-xs text-red-600 dark:text-red-300>
        {{ saveErrorMsg }}
      </p>
      <div v-else />
      <button :disabled="saveButtonDisabled" soft-btn min-w-34 self-end :class="saveButtonDisabled ? 'opacity-50 cursor-not-allowed' : ''" @click="handleSaveButtonClick">
        <div :class="saveButtonDisabled ? 'i-carbon-checkmark' : 'i-carbon-bookmark-add'" />{{ saveButtonDisabled ? '已保存' : '保存到收藏' }}
      </button>
    </footer>
  </section>
</template>

<style scoped>
.hero-panel {
  position: relative;
  overflow: hidden;
  padding: clamp(1.5rem, 4vw, 2.75rem);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 1.5rem;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.88), rgba(240, 253, 250, 0.72));
  box-shadow: 0 22px 60px rgba(15, 23, 42, 0.06);
}
.hero-panel::after {
  content: '';
  position: absolute;
  width: 22rem;
  height: 22rem;
  right: -8rem;
  top: -13rem;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(45, 212, 191, 0.24), rgba(99, 102, 241, 0.05) 55%, transparent 70%);
}
:global(.dark) .hero-panel {
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.86), rgba(8, 47, 73, 0.44));
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.26);
}
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.8rem;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 999px;
  color: rgb(100 116 139);
  background: rgba(255, 255, 255, 0.62);
  font-size: 0.75rem;
  font-weight: 600;
  backdrop-filter: blur(12px);
}
:global(.dark) .status-pill {
  color: rgb(148 163 184);
  background: rgba(255, 255, 255, 0.05);
}
.status-ready {
  color: rgb(5 150 105);
}
.status-pending {
  color: rgb(217 119 6);
}
.section-heading {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}
.step-badge {
  display: inline-flex;
  width: 2.5rem;
  height: 2.5rem;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 0.8rem;
  color: rgb(13 148 136);
  background: rgba(20, 184, 166, 0.11);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem;
  font-weight: 800;
}
.step-purple {
  color: rgb(124 58 237);
  background: rgba(139, 92, 246, 0.1);
}
.step-blue {
  color: rgb(37 99 235);
  background: rgba(59, 130, 246, 0.1);
}
.step-orange {
  color: rgb(234 88 12);
  background: rgba(249, 115, 22, 0.1);
}
.advanced-panel {
  border-top: 1px solid rgba(148, 163, 184, 0.18);
  padding-top: 1.1rem;
}
.advanced-panel[open] .details-arrow {
  transform: rotate(180deg);
}
.details-arrow {
  transition: transform 0.2s ease;
}
.result-paper {
  max-width: 52rem;
  margin: 0 auto;
  color: rgb(51 65 85);
  font-size: 1rem;
  line-height: 1.95;
}
:global(.dark) .result-paper {
  color: rgb(203 213 225);
}
.pulse-dot {
  box-shadow: 0 0 0 0 rgba(20, 184, 166, 0.35);
  animation: pulse-ring 2s infinite;
}
@keyframes pulse-ring {
  70% {
    box-shadow: 0 0 0 7px rgba(20, 184, 166, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(20, 184, 166, 0);
  }
}
</style>
