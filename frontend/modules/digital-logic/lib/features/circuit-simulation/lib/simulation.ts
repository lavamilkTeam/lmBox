import { computed, effectScope, ref, shallowRef, watch } from 'vue'
import type { LogicCommand, LogicRequest, LogicResponse } from '../../../../../../contracts'
import { useLogicCircuit } from '../../../domain/circuit'

interface Session {
  request(request: LogicRequest): Promise<LogicResponse>
  dispose(): void
}
interface Dependencies {
  createSession(): Session
  scheduleTick(callback: () => void): () => void
}
type Circuit = ReturnType<typeof useLogicCircuit>
const controllers = new WeakMap<Circuit, ReturnType<typeof createController>>()
const liveControllers = new Set<ReturnType<typeof createController>>()

export function useCircuitSimulation(dependencies: Dependencies) {
  const circuit = useLogicCircuit()
  let controller = controllers.get(circuit)
  if (!controller) {
    controller = createController(circuit, dependencies)
    controllers.set(circuit, controller)
    liveControllers.add(controller)
  }
  return controller
}

function createController(circuit: Circuit, dependencies: Dependencies) {
  const scope = effectScope(true)
  const busy = ref(false), running = ref(false), error = ref<string | null>(null)
  const result = shallowRef<LogicResponse | null>(null)
  let session: Session | null = null, cancelTick: (() => void) | null = null
  let revision = 0, pending = 0, runGeneration = 0, disposed = false, desiredTopology = ''
  let queue = Promise.resolve(false)

  function pause() { runGeneration++; running.value = false; cancelTick?.(); cancelTick = null }
  function topology() {
    return { nodes: circuit.nodes.map(node => ({ id: node.id, kind: node.gateId })), edges: circuit.edges.map(edge => ({ ...edge })) }
  }
  function submit(command: LogicCommand) {
    if (disposed) return Promise.resolve(false)
    const request: LogicRequest = {
      schemaVersion: 1, projectId: 'digital-logic', requestId: `logic-${++revision}`,
      inputRevision: revision, command,
    }
    const expectedRevision = revision
    pending++; busy.value = true; error.value = null
    if (command.type !== 'step') result.value = null
    const work = queue.then(async () => {
      if (disposed) return false
      try {
        // Editing topology and reset create a fresh Rust-owned simulation state.
        if (command.type === 'load') { session?.dispose(); session = dependencies.createSession() }
        if (!session) throw new Error('仿真核心尚未加载，请复位后重试')
        const response = await session.request(request)
        if (response.schemaVersion !== 1 || response.projectId !== request.projectId
          || response.requestId !== request.requestId || response.inputRevision !== request.inputRevision) {
          throw new Error('仿真响应与当前请求不匹配')
        }
        if (!disposed && expectedRevision === revision) result.value = response
        return true
      } catch (cause) {
        if (!disposed && expectedRevision === revision) {
          result.value = null
          error.value = cause instanceof Error ? cause.message : String(cause)
          pause()
        }
        return false
      } finally {
        pending = Math.max(0, pending - 1)
        if (!disposed) busy.value = pending > 0
      }
    })
    queue = work
    return work
  }
  function load() {
    pause()
    const graph = topology()
    desiredTopology = JSON.stringify(graph)
    const values = Object.fromEntries(graph.nodes.filter(node => node.kind === 'input')
      .map(node => [node.id, circuit.inputValues[node.id] ?? '0']))
    return submit({ type: 'load', ...graph, values })
  }
  function syncTopology() {
    if (JSON.stringify(topology()) !== desiredTopology) void load()
  }
  function toggleInput(id: string) {
    if (disposed || !circuit.nodes.some(node => node.id === id && node.gateId === 'input')) return Promise.resolve(false)
    syncTopology()
    const value = circuit.inputValues[id] === '1' ? '0' : '1'
    circuit.inputValues[id] = value
    return submit({ type: 'set_input', nodeId: id, value })
  }
  function step() {
    syncTopology()
    if (disposed || busy.value || error.value) return Promise.resolve(false)
    return submit({ type: 'step', ticks: 1 })
  }
  async function cycle(generation: number) {
    if (!running.value || disposed || generation !== runGeneration) return
    cancelTick = null
    if (!busy.value) await step()
    if (generation !== runGeneration) return
    if (running.value && !error.value && !disposed) cancelTick = dependencies.scheduleTick(() => { void cycle(generation) })
    else pause()
  }
  function toggleRunning() {
    if (running.value) { pause(); return }
    syncTopology()
    if (disposed || busy.value || error.value) return
    running.value = true
    void cycle(runGeneration)
  }
  function dispose() {
    if (disposed) return
    disposed = true; revision++; pause(); scope.stop(); session?.dispose(); session = null
    busy.value = false; result.value = null
    controllers.delete(circuit); liveControllers.delete(controller)
  }
  const view = computed(() => ({
    busy: busy.value, running: running.value, error: error.value, result: result.value,
    values: circuit.inputValues,
    status: error.value ? '计算失败' : running.value ? '运行中' : result.value ? '已暂停' : '未就绪',
  }))
  const controller = { view, toggleInput, step, toggleRunning, pause, reset: load, dispose }
  scope.run(() => watch(() => JSON.stringify(topology()), syncTopology, { immediate: true, flush: 'post' }))
  return controller
}

if (import.meta.hot) import.meta.hot.dispose(() => { for (const controller of liveControllers) controller.dispose() })
