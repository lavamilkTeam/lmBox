import and from './assets/ansi/and.svg?url'
import or from './assets/ansi/or.svg?url'
import not from './assets/ansi/not.svg?url'
import nand from './assets/ansi/nand.svg?url'
import nor from './assets/ansi/nor.svg?url'
import xor from './assets/ansi/xor.svg?url'
import xnor from './assets/ansi/xnor.svg?url'
import buf from './assets/ansi/buf.svg?url'

export const logicGateSymbols: Readonly<Record<string, string>> = { and, or, not, nand, nor, xor, xnor, buf }

// Pin coordinates follow the 100 × 50 upstream SVGs, displayed at 2× scale.
export function gateGeometry(id: string, inputs: readonly string[]) {
  const single = inputs.length === 1
  const inputX = id === 'buf' ? 5.0434781 : id === 'not' ? 5.043478 : 5
  const outputX = id === 'buf' ? 95.085706 : 95
  return {
    width: 200, height: 100,
    ports: {
      inputs: inputs.map((port, index) => ({ id: port, x: inputX * 2, y: single ? 50 : 30 + index * 40 })),
      output: { x: outputX * 2, y: 50 },
    },
  }
}
