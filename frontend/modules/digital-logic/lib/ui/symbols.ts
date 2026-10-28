import and from './assets/ansi/and.svg?url'
import or from './assets/ansi/or.svg?url'
import not from './assets/ansi/not.svg?url'
import nand from './assets/ansi/nand.svg?url'
import nor from './assets/ansi/nor.svg?url'
import xor from './assets/ansi/xor.svg?url'
import xnor from './assets/ansi/xnor.svg?url'
import buf from './assets/ansi/buf.svg?url'
import hd44780 from './assets/hd44780.svg?url'

export const circuitSymbols: Readonly<Record<string, string>> = { and, or, not, nand, nor, xor, xnor, buf, hd44780 }

// Pin coordinates follow the 100 × 50 upstream SVGs, displayed at 2× scale.
export function circuitGeometry(id: string, inputs: readonly string[]) {
  const size = id === 'hd44780' ? { width: 600, height: 280 } : { width: 200, height: 100 }
  return { ...size, ports: circuitPorts(id, inputs) }
}

export function circuitPorts(id: string, inputs: readonly string[]) {
  if (id === 'hd44780') {
    // The 11 digital pins occupy pads 4–14; power, contrast and backlight are visual only.
    const pins = ['RS', 'R/W', 'E', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7']
    return {
      inputs: pins.filter(pin => inputs.includes(pin)).map(pin => ({ id: pin, x: 138 + 26 * pins.indexOf(pin), y: 22, side: 'top' as const })),
      output: null,
    }
  }
  if (id === 'input' || id === 'clock') return { inputs: [], output: { x: 190, y: 50 } }
  if (id === 'probe') return { inputs: [{ id: 'A', x: 10, y: 50 }], output: null }
  if (id === 'dff') return {
    inputs: [{ id: 'D', x: 10, y: 30 }, { id: 'CLK', x: 10, y: 70 }],
    output: { x: 190, y: 50 },
  }
  const single = inputs.length === 1
  const inputX = id === 'buf' ? 5.0434781 : id === 'not' ? 5.043478 : 5
  const outputX = id === 'buf' ? 95.085706 : 95
  return {
    inputs: inputs.map((port, index) => ({ id: port, x: inputX * 2, y: single ? 50 : 30 + index * 40 })),
    output: { x: outputX * 2, y: 50 },
  }
}
