import { defineStore } from 'pinia'
import { ref } from 'vue'

export const logicGates = [
  {
    id: 'and', label: '与门 AND', inputs: ['A', 'B'],
    description: '与门执行布尔代数中的“与”运算，可以理解为所有输入条件都满足时才通过。对于图中的双输入门，输入 A、B 都为 1 时输出 Y 才为 1，任何一个输入为 0 都会使输出变成 0。\n\n逻辑式写作 Y = A ∧ B，也常记为 Y = A · B。按二值大小比较，它的输出等于两个输入中的较小值；这与取较大值的或门相对应。\n\n实际门电路可以由 MOS 晶体管实现，7408 和 4081 都是包含四个双输入与门的集成电路。没有独立与门时，也可组合与非门或或非门得到同样的逻辑功能',
    source: { label: '中文维基百科：与门', url: 'https://zh.wikipedia.org/wiki/与门' },
  },
  {
    id: 'or', label: '或门 OR', inputs: ['A', 'B'],
    description: '或门执行布尔代数中的“或”运算，表示至少一个输入条件成立。双输入或门只有在 A、B 同时为 0 时才输出 0；只要出现一个 1，输出 Y 就为 1，两个输入都是 1 时也不例外。\n\n逻辑式可写为 Y = A ∨ B 或 Y = A + B，其中加号表示逻辑或，不是普通数值相加。把 0、1 看成数值时，输出相当于选取输入中的较大值。\n\n多个双输入或门可以组合出更多输入的或门，设计时需要考虑级联带来的传播延迟。常见实例包括 TTL 系列的 7432 和 CMOS 系列的 4071，二者均包含四个双输入或门',
    source: { label: '中文维基百科：或门', url: 'https://zh.wikipedia.org/wiki/或门' },
  },
  {
    id: 'not', label: '非门 NOT', inputs: ['A'],
    description: '非门也叫反相器，只有一个输入，用来将逻辑状态取反。输出 Y 与输入 A 相反：A 为 0 时得到 1，A 为 1 时得到 0，逻辑式写作 Y = ¬A。\n\n它是构成数字电路的基本单元，可参与译码器、数据选择器和状态机等电路的实现。反相器既可以采用晶体管和电阻组成，也可以使用互补的 MOS 晶体管构成 CMOS 电路。\n\n理想非门只描述 0 与 1 的互换；真实器件还具有输入电压门限、转换区和传播延迟。常见的 7404 芯片包含六个独立的反相器',
    source: { label: '中文维基百科：反相器', url: 'https://zh.wikipedia.org/wiki/反相器' },
  },
  {
    id: 'nand', label: '与非门 NAND', inputs: ['A', 'B'],
    description: '与非门可以看成与运算后再取反，逻辑式为 Y = ¬(A ∧ B)。对于双输入门，仅 A、B 同时为 1 的组合使输出为 0，其余三种组合的输出都为 1。\n\n这种规则也适用于多输入与非门：只要某个输入是 0，输出就保持为 1；必须全部输入为 1，输出才变成 0。\n\n与非门具有逻辑功能完备性，能够通过组合实现非、与、或及其他布尔运算，因此常用于构造加法器、数据选择器等电路。7400 和 4011 都提供四个独立的双输入与非门',
    source: { label: '中文维基百科：与非门', url: 'https://zh.wikipedia.org/wiki/与非门' },
  },
  {
    id: 'nor', label: '或非门 NOR', inputs: ['A', 'B'],
    description: '或非门把或运算的结果取反，逻辑式为 Y = ¬(A ∨ B)。双输入时，只有 A、B 都为 0 才输出 1；任意一个输入变成 1，输出就变成 0。\n\n与或门相比，它的四种输入组合完全相同，但每一行的输出都相反。或非门同样具有逻辑功能完备性，只使用这种门并进行适当连接，就能够实现其他布尔逻辑功能。\n\nTTL 与 CMOS 逻辑系列都包含或非门，例如 7402 和 4001 均包含四个双输入或非门。实际器件还可提供更多输入，便于组合不同规模的逻辑条件',
    source: { label: '中文维基百科：或非门', url: 'https://zh.wikipedia.org/wiki/或非门' },
  },
  {
    id: 'xor', label: '异或门 XOR', inputs: ['A', 'B'],
    description: '异或门判断两个二值输入是否不同，逻辑式为 Y = A ⊕ B。A、B 一为 0、一为 1 时输出 1；两者同为 0 或同为 1 时输出 0。它与或门的区别是，两个输入都为 1 时不会输出 1。\n\n双输入异或相当于不保留进位的二进制加法，因此能够与与门一起组成半加器：异或门给出和位，与门给出进位。\n\n把多个双输入异或门级联，可以判断输入中 1 的个数是否为奇数，用于奇偶校验。把一个输入作为控制端时，控制值为 0 会保留另一个输入，控制值为 1 则将其取反',
    source: { label: '中文维基百科：异或门', url: 'https://zh.wikipedia.org/wiki/异或门' },
  },
  {
    id: 'xnor', label: '同或门 XNOR', inputs: ['A', 'B'],
    description: '同或门也称异或非门，用来判断两个二值输入是否一致。A、B 同为 0 或同为 1 时输出 1，两者不同时输出 0，因此其结果正好是异或门输出的反值。\n\n逻辑式写作 Y = ¬(A ⊕ B)，也可展开为 Y = (A ∧ B) ∨ (¬A ∧ ¬B)。前一项对应两个输入都为 1，后一项对应两个输入都为 0。\n\n同或功能可由其他门组合得到，例如使用四个或非门或五个与非门。CMOS 系列的 4077 集成了四个独立的双输入同或门',
    source: { label: '中文维基百科：同或门', url: 'https://zh.wikipedia.org/wiki/同或门' },
  },
  {
    id: 'buf', label: '缓冲器 BUF', inputs: ['A'],
    description: '缓冲门是单输入、单输出的逻辑门，逻辑式为 Y = A。输入为 0 时输出 0，输入为 1 时输出 1；它保持信号的逻辑状态，与将信号取反的非门相对应。\n\n虽然逻辑值没有改变，真实缓冲门仍能提高信号的驱动能力，使前级输出能够带动更多后级输入，因此具有实际的电路用途，并不等同于一根导线。\n\n缓冲门也存在传播延迟，在某些电路中可用于延迟信号。将两个反相器串联可以获得同相的逻辑效果，常见的 4050 芯片包含六个同相缓冲器',
    source: { label: '中文维基百科：缓冲门', url: 'https://zh.wikipedia.org/wiki/緩衝閘' },
  },
] as const

interface CircuitNode { id: string; gateId: string; x: number; y: number }
interface CircuitEdge { id: string; source: string; target: string; targetPort: string }

export const useLogicCircuit = defineStore('digital-logic-circuit', () => {
  const nodes = ref<CircuitNode[]>([])
  const edges = ref<CircuitEdge[]>([])
  const nextId = ref(1)

  return { nodes, edges, nextId }
})
