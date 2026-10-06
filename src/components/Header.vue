<script setup lang="ts">
import { useRoute } from 'vue-router'
import { toggleDark } from '~/logic'

const route = useRoute()
</script>

<template>
  <header sticky top-0 z-50 w-full border="b slate-200/70 dark:white/8" bg="white/72 dark:#080b12/76" backdrop-blur-xl>
    <div m-auto max-w-300 h-16 px-4 sm:px-6 flex="~ items-center justify-between gap-4">
      <router-link
        to="/" flex="~ items-center gap-3" min-w-0
        aria-label="返回创作台"
      >
        <span w-9 h-9 rounded-xl flex="~ items-center justify-center" bg="teal-500/12 dark:teal-400/12" text-teal-600 dark:text-teal-300>
          <div i-carbon-image-copy text-xl />
        </span>
        <span text-left min-w-0>
          <strong block text-sm sm:text-base leading-tight tracking-tight>Up or Not</strong>
          <small hidden sm:block uppercase op-45 class="text-[10px] tracking-[0.18em]">Visual Story Studio</small>
        </span>
      </router-link>

      <nav flex="~ items-center gap-1" rounded-xl p-1 bg="slate-100/80 dark:white/5" aria-label="主导航">
        <router-link
          to="/" px-3 py-2 rounded-lg flex="~ items-center gap-2" text-sm transition
          :class="route.path === '/' ? 'bg-white text-teal-700 shadow-sm dark:bg-white/10 dark:text-teal-300' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'"
          title="创作台"
        >
          <div i-carbon-pen-fountain />
          <span hidden md:inline>创作</span>
        </router-link>

        <router-link
          to="/favorites" px-3 py-2 rounded-lg flex="~ items-center gap-2" text-sm transition
          :class="route.path === '/favorites' ? 'bg-white text-teal-700 shadow-sm dark:bg-white/10 dark:text-teal-300' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'"
          title="收藏"
        >
          <div i-carbon-bookmark />
          <span hidden md:inline>收藏</span>
        </router-link>

        <router-link
          to="/settings" px-3 py-2 rounded-lg flex="~ items-center gap-2" text-sm transition
          :class="route.path === '/settings' ? 'bg-white text-teal-700 shadow-sm dark:bg-white/10 dark:text-teal-300' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'"
          title="设置"
        >
          <div i-carbon-settings />
          <span hidden md:inline>设置</span>
        </router-link>

        <span w-px h-5 bg="slate-300 dark:white/10" mx-1 />

        <a
          href="https://github.com/C2006L/upornot" target="_blank" rel="noreferrer"
          w-9 h-9 rounded-lg icon-btn class="hover:bg-white dark:hover:bg-white/8"
          title="GitHub" aria-label="GitHub"
        >
          <div i-carbon-logo-github />
        </a>

        <button w-9 h-9 rounded-lg icon-btn class="hover:bg-white dark:hover:bg-white/8" title="切换主题" aria-label="切换主题" @click="toggleDark()">
          <div i-carbon-sun dark:i-carbon-moon />
        </button>
      </nav>
    </div>
  </header>
</template>
