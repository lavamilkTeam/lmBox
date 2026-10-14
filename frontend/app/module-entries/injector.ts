import { defineComponent, h } from 'vue'
import { PropulsionWorkspace } from '../../modules/propulsion'
export default defineComponent({ name: 'InjectorModule', setup: () => () => h(PropulsionWorkspace, { tool: 'injector' }) })
