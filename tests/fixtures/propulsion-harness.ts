// Test-only host for the public module while the injector is unavailable in the app.
import { createApp, defineComponent, h, ref } from 'vue'
import { createPinia } from 'pinia'
import { PropulsionWorkspace } from '../../frontend/modules/propulsion'
import { AppTheme } from '../../frontend/ui/theme'

const Harness = defineComponent({
  setup() {
    const tool = ref<'injector' | 'nozzle'>('injector')
    return () => h(AppTheme, null, { default: () => [
      h('nav', { 'aria-label': '测试工具切换' }, [
        h('button', { onClick: () => { tool.value = 'nozzle' } }, '切换喷管'),
        h('button', { onClick: () => { tool.value = 'injector' } }, '切换喷注器'),
      ]),
      h(PropulsionWorkspace, { tool: tool.value, key: tool.value }),
    ] })
  },
})
createApp(Harness).use(createPinia()).mount('#app')
