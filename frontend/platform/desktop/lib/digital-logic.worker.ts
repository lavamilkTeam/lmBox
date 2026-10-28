import init, { DigitalLogicSimulator } from './generated/lmbox.js'
import wasmUrl from './generated/lmbox_bg.wasm?url'

// Initialization and Rust requests are serialized, including messages received during WASM loading.
let ready: Promise<DigitalLogicSimulator> | undefined
let pending = Promise.resolve()
self.onmessage = (event: MessageEvent<{ id: string; json: string }>) => {
  const { id, json } = event.data
  pending = pending.then(async () => {
    try {
      ready ??= init({ module_or_path: wasmUrl }).then(() => new DigitalLogicSimulator())
      const simulator = await ready
      self.postMessage({ id, result: simulator.request(json) })
    } catch (error) {
      const message = typeof error === 'string' ? error : error instanceof Error ? error.message : '数字逻辑计算失败。'
      self.postMessage({ id, error: message.slice(0, 4096) || '数字逻辑计算失败。' })
    }
  })
}
