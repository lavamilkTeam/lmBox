<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Button } from '../../shadcn'
import pigStill from './assets/pig-still.png'
import pigAnimation from './assets/pig.gif'
import './welcome.css'

defineEmits<{ continue: [] }>()

const stillImage = ref<HTMLImageElement>()
const ready = ref(false)
const landed = ref(false)
const gifLoaded = ref(false)
const reducedMotion = ref(false)
const playing = computed(() => landed.value && !reducedMotion.value)
let motionPreference: MediaQueryList | undefined
let disposed = false

function updateMotion() {
  reducedMotion.value = motionPreference?.matches ?? false
  if (reducedMotion.value) landed.value = true
}

function finishEntrance(event: AnimationEvent) {
  if (event.target === event.currentTarget && event.animationName === 'installer-pig-enter') {
    landed.value = true
  }
}

onMounted(async () => {
  motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
  updateMotion()
  motionPreference.addEventListener('change', updateMotion)
  // The GIF is mounted only after the static pig's entrance has finished.
  await Promise.allSettled([
    stillImage.value?.decode(),
    document.fonts.load('500 48px "LmBox Welcome Soft"', '让我们开始安装lmbox'),
  ])
  if (!disposed) ready.value = true
})

onUnmounted(() => {
  disposed = true
  motionPreference?.removeEventListener('change', updateMotion)
})
</script>

<template>
  <main class="installer-welcome" :class="{ 'is-ready': ready, 'is-reduced': reducedMotion }">
    <section class="installer-welcome__content" aria-labelledby="installer-heading">
      <div class="installer-welcome__pig" role="img" aria-label="猪猪" @animationend="finishEntrance">
        <img ref="stillImage" :src="pigStill" alt="" width="512" height="512" class="installer-welcome__still" :class="{ 'is-hidden': playing && gifLoaded }">
        <img v-if="playing" :src="pigAnimation" alt="" width="512" height="512" class="installer-welcome__animation" @load="gifLoaded = true">
      </div>
      <div class="installer-welcome__copy">
        <h1 id="installer-heading" class="installer-welcome__heading"><span>让我们开始安装</span><span class="installer-welcome__name">lmbox</span></h1>
        <div class="installer-welcome__action">
          <Button size="lg" type="button" class="installer-welcome__continue" :disabled="!ready" @click="$emit('continue')">
            继续
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </Button>
        </div>
      </div>
    </section>
  </main>
</template>
