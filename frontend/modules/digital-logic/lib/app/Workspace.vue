<script setup lang="ts">
import { useCircuitEditing } from '../features/circuit-editing'
import { LogicEditor, circuitPorts } from '../ui'
import { useNotification } from '../../../../ui/theme'
import { useHelpDialog } from '../../../../features/help-dialog'
const editing = useCircuitEditing(circuitPorts)
const help = useHelpDialog()
const notification = useNotification()
function connect(source: string, target: string, port?: string) {
  const error = editing.connect(source, target, port)
  if (error) notification.warning(error)
}
</script>
<template>
  <LogicEditor :tools="editing.tools" :nodes="editing.circuit.nodes" :edges="editing.circuit.edges"
    :active-help-id="help.activeId.value" @help-open="help.setOpen"
    @add="editing.add" @move="editing.move" @connect="connect" @remove-node="editing.removeNode" @remove-edge="editing.removeEdge" />
</template>
