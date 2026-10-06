<script setup lang="ts">
import MarkdownIt from 'markdown-it'
import { computed } from 'vue'

const props = defineProps<{
  content: string
}>()

const md = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: true,
  typographer: true,
})

const rendered = computed(() => {
  return md.render(props.content)
})
</script>

<template>
  <div class="markdown-body" v-html="rendered" />
</template>

<style scoped>
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  color: inherit;
  font-weight: 750;
  letter-spacing: -0.015em;
  margin: 1.35em 0 0.55em;
}
.markdown-body :deep(h1) {
  font-size: 1.5em;
}
.markdown-body :deep(h2) {
  font-size: 1.25em;
}
.markdown-body :deep(h3) {
  font-size: 1.1em;
}
.markdown-body :deep(p) {
  margin: 0.85em 0;
}
.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 1.5em;
  margin: 0.5em 0;
}
.markdown-body :deep(li) {
  margin: 0.25em 0;
}
.markdown-body :deep(code) {
  background: rgba(15, 118, 110, 0.1);
  padding: 0.15em 0.35em;
  border-radius: 0.35em;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.markdown-body :deep(pre) {
  background: rgba(15, 23, 42, 0.96);
  color: #e2e8f0;
  padding: 1em 1.1em;
  border-radius: 0.85em;
  overflow-x: auto;
  margin: 0.5em 0;
}
.markdown-body :deep(pre code) {
  background: none;
  padding: 0;
}
.markdown-body :deep(blockquote) {
  border-left: 3px solid #14b8a6;
  padding: 0.15em 0 0.15em 1em;
  margin: 1em 0;
  color: #64748b;
}
.markdown-body :deep(strong) {
  font-weight: bold;
}
.markdown-body :deep(em) {
  font-style: italic;
}
.markdown-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.5em 0;
}
.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid rgba(128, 128, 128, 0.3);
  padding: 0.5em 0.75em;
  text-align: left;
}
.markdown-body :deep(th) {
  background: rgba(128, 128, 128, 0.15);
  font-weight: bold;
}
.markdown-body :deep(tr:nth-child(even)) {
  background: rgba(128, 128, 128, 0.05);
}
.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid rgba(128, 128, 128, 0.3);
  margin: 1em 0;
}
.markdown-body :deep(a) {
  color: #14b8a6;
  text-decoration: underline;
}
.markdown-body :deep(a:hover) {
  opacity: 0.8;
}
.markdown-body :deep(s),
.markdown-body :deep(del) {
  text-decoration: line-through;
  opacity: 0.7;
}
.markdown-body :deep(mark) {
  background: rgba(255, 255, 0, 0.3);
  padding: 0.1em 0.2em;
  border-radius: 0.2em;
}
.markdown-body :deep(img) {
  max-width: 100%;
  border-radius: 0.5em;
}
.markdown-body :deep(input[type='checkbox']) {
  margin-right: 0.5em;
}
</style>
