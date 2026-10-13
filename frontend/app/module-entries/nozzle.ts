import { defineComponent, h } from 'vue'
import { PropulsionWorkspace } from '../../modules/propulsion'
export default defineComponent({ name: 'NozzleModule', setup: () => () => h(PropulsionWorkspace, { tool: 'nozzle' }) })
