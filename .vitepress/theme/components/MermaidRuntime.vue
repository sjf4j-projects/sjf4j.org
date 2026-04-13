<template>
  <div v-if="svg" v-html="svg" :class="klass"></div>
  <pre v-else class="mermaid-fallback">Loading diagram...</pre>
</template>

<script setup lang="ts">
import mermaid from 'mermaid'
import { computed, onMounted, onUnmounted, ref } from 'vue'

const props = defineProps<{
  graph: string
  id: string
  class?: string
}>()

const klass = computed(() => props.class || 'mermaid')
const svg = ref('')
let observer: MutationObserver | null = null
const decodedGraph = decodeURIComponent(props.graph)
const instanceSeed = Math.random().toString(36).slice(2)

function isDark() {
  return document.documentElement.classList.contains('dark')
}

async function renderChart() {
  try {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: isDark() ? 'dark' : 'default',
    })
    const renderId = `${props.id}-${instanceSeed}-${Date.now()}`
    const { svg: code } = await mermaid.render(renderId, decodedGraph)
    svg.value = code
  } catch (err) {
    console.error('[mermaid] render failed', err)
  }
}

onMounted(async () => {
  await renderChart()
  observer = new MutationObserver(async () => {
    await renderChart()
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
})

onUnmounted(() => {
  observer?.disconnect()
})
</script>

<style scoped>
.mermaid-fallback {
  margin: 0;
}

:deep(.nodeLabel p),
:deep(.edgeLabel p),
:deep(.cluster-label span p) {
  margin: 0;
  line-height: 1.3;
}
</style>
