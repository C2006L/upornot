import transformerDirectives from '@unocss/transformer-directives'
import {
  defineConfig,
  presetAttributify,
  presetIcons,
  presetWind4,
} from 'unocss'

export default defineConfig({
  shortcuts: [
    {
      'bg-base': 'bg-white dark:bg-black',
      'border-base': 'border-gray-300 dark:border-gray-800',
      'border-focus-base': 'focus:border-teal-700',
      'border-hover-base': 'hover:border-teal-700 transition duration-200',
      'label': 'text-xs block font-semibold tracking-wide text-left mb-2 text-slate-600 dark:text-slate-300',
      'icon-btn': 'inline-flex items-center justify-center cursor-pointer select-none transition duration-200 text-slate-500 hover:text-teal-600 dark:text-slate-400 dark:hover:text-teal-300',
      'btn': 'px-4 py-2 rounded-xl inline-flex items-center justify-center bg-teal-600 text-white cursor-pointer hover:bg-teal-500 disabled:cursor-default disabled:bg-gray-600 disabled:opacity-50',
      'app-card': 'rounded-2xl border border-slate-200/80 bg-white/85 shadow-sm backdrop-blur dark:border-white/8 dark:bg-slate-950/70',
      'app-field': 'w-full rounded-xl border border-slate-200 bg-white/70 px-4 py-2.5 outline-none transition duration-200 placeholder:text-slate-400 hover:border-slate-300 focus:border-teal-500 focus:ring-3 focus:ring-teal-500/10 dark:border-white/10 dark:bg-white/4 dark:hover:border-white/20 dark:focus:border-teal-400',
      'soft-btn': 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-teal-300 hover:text-teal-700 dark:border-white/10 dark:bg-white/4 dark:text-slate-200 dark:hover:border-teal-500/50 dark:hover:text-teal-300',
      'eyebrow': 'text-xs font-bold uppercase tracking-[0.18em] text-teal-600 dark:text-teal-400',
    },
  ],
  theme: {
    colors: {
      black: '#121212',
    },
  },
  presets: [
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      warn: true,
    }),
    presetWind4(),
  ],
  transformers: [
    transformerDirectives(),
  ],
})
