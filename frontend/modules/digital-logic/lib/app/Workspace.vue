<script setup lang="ts">
import { onScopeDispose } from 'vue'
import { useCircuitEditing } from '../features/circuit-editing'
import { useCircuitSimulation } from '../features/circuit-simulation'
import { LogicEditor, circuitPorts } from '../ui'
import { createDigitalLogicSession } from '../../../../platform/desktop'
import { useNotification } from '../../../../ui/theme'
import { useHelpDialog } from '../../../../features/help-dialog'
const editing = useCircuitEditing(circuitPorts)
const simulation = useCircuitSimulation({
  createSession: createDigitalLogicSession,
  scheduleTick(callback) { const timer = setTimeout(callback, 200); return () => clearTimeout(timer) },
})
onScopeDispose(simulation.pause)
const help = useHelpDialog()
const notification = useNotification()
function connect(source: string, target: string, port?: string) {
  const error = editing.connect(source, target, port)
  if (error) notification.warning(error)
}
</script>
<template>
  <LogicEditor :tools="editing.tools" :nodes="editing.circuit.nodes" :edges="editing.circuit.edges"
    :simulation="simulation.view.value" @simulation-toggle="simulation.toggleRunning" @simulation-step="simulation.step"
    @simulation-reset="simulation.reset" @input-toggle="simulation.toggleInput"
    :active-help-id="help.activeId.value" @help-open="help.setOpen"
    @add="editing.add" @move="editing.move" @connect="connect" @remove-node="editing.removeNode" @remove-edge="editing.removeEdge" />
</template>
