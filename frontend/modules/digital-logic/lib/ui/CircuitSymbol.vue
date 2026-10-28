<script setup lang="ts">
import { Button } from '../../../../ui/shadcn'
import { circuitSymbols } from './symbols'
import type { CircuitDisplay, CircuitSignal } from './simulation-view'
defineProps<{
  gateId: string; label: string; signal?: CircuitSignal; inputValue?: '0' | '1'; display?: CircuitDisplay
}>()
const emit = defineEmits<{
  moveStart: [event: PointerEvent]; moveEnd: []; keyboardMove: [event: KeyboardEvent]; remove: []; inputToggle: []
}>()
const signalNames = { '0': '低电平 0', '1': '高电平 1', X: '未知 X', Z: '高阻或悬空 Z' }
function keydown(event: KeyboardEvent) {
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    event.stopPropagation()
    emit('remove')
  } else emit('keyboardMove', event)
}
</script>
<template>
  <div class="logic-symbol">
    <button type="button" class="logic-gate-symbol" :aria-label="`移动${label}`" :title="label"
      @pointerdown="emit('moveStart', $event)" @pointerup="emit('moveEnd')" @pointercancel="emit('moveEnd')"
      @lostpointercapture="emit('moveEnd')" @keydown="keydown">
      <img v-if="circuitSymbols[gateId]" :src="circuitSymbols[gateId]" :alt="gateId === 'hd44780' ? `${label}外观` : `${label}符号`" draggable="false" />
      <svg v-else viewBox="0 0 200 100" role="img" :aria-label="`${label}符号`" class="logic-native-symbol">
        <template v-if="gateId === 'input'">
          <rect x="40" y="20" width="105" height="60" rx="8" />
          <path d="M 145 50 H 190" />
          <text x="92.5" y="37">输入</text>
        </template>
        <template v-else-if="gateId === 'clock'">
          <rect x="40" y="20" width="120" height="60" rx="8" />
          <path d="M 160 50 H 190 M 60 65 H 74 V 49 H 88 V 65 H 102 V 49 H 116 V 65 H 140" />
          <text x="100" y="37">时钟</text>
        </template>
        <template v-else-if="gateId === 'dff'">
          <rect x="54" y="12" width="94" height="76" />
          <path d="M 10 30 H 54 M 10 70 H 54 M 54 64 L 62 70 L 54 76 M 148 50 H 190" />
          <text x="68" y="35">D</text><text x="128" y="55">Q</text>
          <text x="86" y="75" class="logic-clock-label">CLK</text>
        </template>
        <template v-else-if="gateId === 'probe'">
          <rect x="50" y="20" width="120" height="60" rx="8" />
          <path d="M 10 50 H 50" />
          <text x="110" y="37">探针</text>
        </template>
      </svg>
    </button>
    <Button v-if="gateId === 'input'" type="button" variant="outline" size="sm" class="logic-input-toggle"
      :aria-label="`切换${label}电平`" :aria-pressed="inputValue === '1'" @pointerdown.stop @click.stop="emit('inputToggle')">
      {{ inputValue ?? '—' }}
    </Button>
    <output v-if="gateId !== 'hd44780'" class="logic-signal" :class="{ 'is-probe': gateId === 'probe' }"
      :aria-label="`${label}${gateId === 'probe' ? '检测电平' : '输出电平'}`" :title="signal ? signalNames[signal] : '尚无结果'" :data-signal="signal">
      {{ signal ?? '—' }}
    </output>
    <div v-if="gateId === 'hd44780'" class="logic-lcd-screen" role="status" :aria-label="`${label}显示内容`" :data-display-on="display?.displayOn ?? false" :data-cursor="display?.displayOn ? display.cursor : undefined">
      <template v-if="display?.displayOn">
        <div v-for="(row, rowIndex) in display.rows" :key="rowIndex" class="logic-lcd-row">
          <span v-for="(character, column) in Array.from(row)" :key="column" class="logic-lcd-character">{{ character }}<span v-if="display.cursor === rowIndex * 16 + column" class="logic-lcd-cursor" role="img" :aria-label="`${label}光标，第${rowIndex + 1}行第${column + 1}列`" /></span>
        </div>
      </template>
    </div>
  </div>
</template>
<style scoped>
.logic-symbol { position:relative; width:100%; height:100%; }
.logic-gate-symbol { display: block; width: 100%; height: 100%; margin: 0; padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; cursor: grab; touch-action: none; user-select: none; }
.logic-gate-symbol:active { cursor: grabbing; }
.logic-gate-symbol:focus-visible { outline: none; filter: drop-shadow(0 0 2px #377663); }
.logic-gate-symbol img { display: block; width: 100%; height: 100%; pointer-events: none; }
.logic-native-symbol { display:block; width:100%; height:100%; pointer-events:none; color:var(--foreground); }
.logic-native-symbol rect { fill:var(--background); stroke:currentColor; stroke-width:2; }
.logic-native-symbol path { fill:none; stroke:currentColor; stroke-width:2; }
.logic-native-symbol text { fill:currentColor; text-anchor:middle; font-size:13px; font-family:inherit; }
.logic-native-symbol .logic-clock-label { font-size:11px; }
.logic-input-toggle { position:absolute; left:70px; top:44px; width:45px; height:28px; padding:0; font:600 17px/1 ui-monospace,monospace; }
.logic-signal { position:absolute; right:15px; top:66px; min-width:20px; text-align:center; font:600 15px/1.2 ui-monospace,monospace; color:var(--foreground); pointer-events:none; }
.logic-signal[data-signal='1'] { color:#267847; }
.logic-signal[data-signal='X'], .logic-signal[data-signal='Z'] { color:#986014; }
.logic-signal.is-probe { left:79px; top:44px; right:auto; width:62px; font-size:25px; }
.logic-lcd-screen { position:absolute; left:9.833333%; top:33.928571%; width:80.333333%; height:40.714286%; display:grid; grid-template-rows:repeat(2,minmax(0,1fr)); gap:5px; padding:13px 16px; color:#ddf6ff; pointer-events:none; overflow:hidden; }
.logic-lcd-row { display:grid; grid-template-columns:repeat(16,minmax(0,1fr)); align-items:center; font:500 29px/1 ui-monospace,monospace; }
.logic-lcd-character { position:relative; min-width:0; white-space:pre; text-align:center; }
.logic-lcd-cursor { position:absolute; left:15%; right:15%; bottom:-3px; border-bottom:2px solid currentColor; }
</style>
