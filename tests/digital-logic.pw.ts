import { test, expect, type Locator, type Page } from '@playwright/test'
import { selectWorkspace } from './workspace-navigation'

async function pinCenter(pin: Locator) {
  const bounds = (await pin.boundingBox())!
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
}

async function dragGate(page: Page, handle: Locator, dx: number, dy: number) {
  const start = await pinCenter(handle)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 8 })
  await page.mouse.up()
}

async function expectAttachedWire(wire: Locator, output: Locator, input: Locator, straight: boolean) {
  const from = await pinCenter(output), to = await pinCenter(input)
  const rendered = await wire.evaluate((element: SVGPathElement) => {
    const matrix = element.getScreenCTM()!
    const start = element.getPointAtLength(0).matrixTransform(matrix)
    const end = element.getPointAtLength(element.getTotalLength()).matrixTransform(matrix)
    return {
      start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y },
      commands: element.getAttribute('d')!.match(/[A-Za-z]/g),
    }
  })
  expect(rendered.start.x).toBeCloseTo(from.x, 0)
  expect(rendered.start.y).toBeCloseTo(from.y, 0)
  expect(rendered.end.x).toBeCloseTo(to.x, 0)
  expect(rendered.end.y).toBeCloseTo(to.y, 0)
  if (straight) {
    expect(to.y).toBeCloseTo(from.y, 0)
    expect(rendered.commands).toEqual(['M', 'H'])
  } else {
    expect(Math.abs(to.y - from.y)).toBeGreaterThan(1)
    expect(rendered.commands).toContain('V')
  }
}

test('logic page uses searchable gate library and real symbols with one or two input ports', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await selectWorkspace(page, '数字逻辑仿真')
  const library = page.getByRole('navigation', { name: '电路元件库' })
  await expect(library.getByRole('button', { name: /^添加/ })).toHaveCount(13)
  await page.getByRole('textbox', { name: '搜索电路元件' }).fill('xor')
  await expect(library.getByRole('button', { name: /^添加/ })).toHaveCount(1)
  await library.getByRole('button', { name: '添加异或门 XOR', exact: true }).click()
  await page.getByRole('textbox', { name: '搜索电路元件' }).fill('')
  await library.getByRole('button', { name: '添加非门 NOT', exact: true }).click()
  await library.getByRole('button', { name: '添加缓冲器 BUF', exact: true }).click()
  for (const label of ['异或门 XOR', '非门 NOT', '缓冲器 BUF']) {
    const node = page.getByRole('article', { name: label, exact: true })
    await expect(node).toBeVisible()
    await expect(node.getByRole('img')).toHaveAttribute('alt', `${label}符号`)
    expect(await node.getByRole('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
    await expect(node.getByRole('button', { name: `${label}输入端`, exact: false })).toHaveCount(label === '异或门 XOR' ? 2 : 1)
    await expect(node.getByRole('button', { name: `${label}输出端`, exact: true })).toHaveCount(1)
    await expect(node.getByRole('button', { name: `打开${label}` })).toHaveCount(0)
  }
  expect(errors).toEqual([])
})

test('gate help opens independently of adding gates and restores keyboard focus', async ({ page }) => {
  await page.goto('/')
  await selectWorkspace(page, '数字逻辑仿真')
  const library = page.getByRole('navigation', { name: '电路元件库' })
  await expect(library.getByRole('button', { name: /说明$/ })).toHaveCount(13)
  const andHelp = library.getByRole('button', { name: '与门 AND说明', exact: true })
  await andHelp.click()
  const dialog = page.getByRole('dialog', { name: '与门 AND', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('输入 A、B 都为 1')
  await expect(page.getByRole('article')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(andHelp).toBeFocused()

  await library.getByRole('button', { name: '添加与门 AND', exact: true }).click()
  const notHelp = library.getByRole('button', { name: '非门 NOT说明', exact: true })
  await notHelp.focus()
  await notHelp.press('Enter')
  const notDialog = page.getByRole('dialog', { name: '非门 NOT', exact: true })
  await expect(notDialog).toContainText('输出 Y 与输入 A 相反')
  await page.keyboard.press('Delete')
  // Modal focus stays inside the dialog; keyboard actions leave the circuit intact.
  await page.keyboard.press('Tab')
  expect(await notDialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
  await page.setViewportSize({ width: 390, height: 844 })
  const bounds = (await notDialog.boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390)
  await notDialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(notHelp).toBeFocused()
  await expect(page.getByRole('article')).toHaveCount(1)
})

test('gate help loads only the matching tutorial animation and removes it on close', async ({ page }) => {
  const requests: string[] = []
  page.on('request', request => {
    if (request.resourceType() === 'image' && request.url().includes('-truth-table')) requests.push(request.url())
  })
  await page.goto('/')
  await selectWorkspace(page, '数字逻辑仿真')
  expect(requests).toEqual([])
  const gates = [
    ['and', '与门 AND'], ['or', '或门 OR'], ['not', '非门 NOT'], ['nand', '与非门 NAND'],
    ['nor', '或非门 NOR'], ['xor', '异或门 XOR'], ['xnor', '同或门 XNOR'], ['buf', '缓冲器 BUF'],
  ]
  for (const [index, [id, label]] of gates.entries()) {
    await page.getByRole('button', { name: `${label}说明`, exact: true }).click()
    const dialog = page.getByRole('dialog', { name: label, exact: true })
    const image = dialog.getByRole('img', { name: `${label}真值表示意动画`, exact: true })
    await expect(image).toBeVisible()
    await expect(image).toHaveAttribute('src', new RegExp(`/${id}-truth-table\\.gif(?:\\?|$)`))
    await expect.poll(() => image.evaluate((element: HTMLImageElement) =>
      element.complete && element.naturalWidth === 800 && element.naturalHeight === 640)).toBe(true)
    expect(requests).toHaveLength(index + 1)
    expect(requests[index]).toMatch(new RegExp(`/${id}-truth-table\\.gif(?:\\?|$)`))
    await page.keyboard.press('Escape')
    await expect(image).toHaveCount(0)
  }
  expect(requests).toHaveLength(8)
  await expect(page.getByRole('article')).toHaveCount(0)
})

test('zoomed drag, named-input wiring, validation, keyboard movement and deletion edit one circuit', async ({ page }) => {
  await page.goto('/')
  await selectWorkspace(page, '数字逻辑仿真')
  await page.getByRole('button', { name: '添加非门 NOT', exact: true }).click()
  await page.getByRole('button', { name: '缩小画布' }).click()
  const canvas = page.getByLabel('逻辑电路画布', { exact: true })
  await page.getByRole('button', { name: '添加与门 AND', exact: true }).dragTo(canvas, { targetPosition: { x: 520, y: 250 } })
  const gate = page.getByRole('article', { name: '与门 AND', exact: true })
  await expect(gate).toBeVisible()
  const origin = (await canvas.boundingBox())!, box = (await gate.boundingBox())!
  expect(box.x - origin.x).toBeCloseTo(520 - 100 * 0.9, 0)
  const heading = gate.getByRole('button', { name: '移动与门 AND' })
  const before = (await heading.boundingBox())!
  await page.mouse.move(before.x + 50, before.y + 20)
  await page.mouse.down()
  await page.mouse.move(before.x + 122, before.y + 56, { steps: 6 })
  await page.mouse.up()
  const after = (await heading.boundingBox())!
  expect(after.x - before.x).toBeCloseTo(72, 0)
  await heading.press('ArrowDown')
  expect((await heading.boundingBox())!.y - after.y).toBeCloseTo(18, 0)
  for (const port of ['A', 'B']) {
    await page.getByRole('button', { name: '非门 NOT输出端', exact: true }).click()
    await gate.getByRole('button', { name: `与门 AND输入端 ${port}`, exact: true }).click()
    await expect(page.getByRole('button', { name: `连接：非门 NOT → 与门 AND ${port}`, exact: true })).toHaveCount(1)
  }
  await page.getByRole('button', { name: '非门 NOT输出端', exact: true }).click()
  await gate.getByRole('button', { name: '与门 AND输入端 A', exact: true }).click()
  await expect(page.getByText('该输入端已连接，请先删除原连线', { exact: true })).toBeVisible()
  const wire = page.getByRole('button', { name: '连接：非门 NOT → 与门 AND A', exact: true })
  await wire.focus()
  await wire.press('Delete')
  await expect(wire).toHaveCount(0)
  await heading.press('Delete')
  await expect(page.getByRole('button', { name: '连接：非门 NOT → 与门 AND B', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '非门 NOT输出端', exact: true }).press('Enter')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '非门 NOT输出端', exact: true })).toHaveAttribute('aria-pressed', 'false')
})

test('terminal dragging connects symbol pins and keeps wire ends attached after moving and zooming', async ({ page }) => {
  await page.goto('/')
  await selectWorkspace(page, '数字逻辑仿真')
  await page.getByRole('button', { name: '添加与门 AND', exact: true }).click()
  const canvas = page.getByLabel('逻辑电路画布', { exact: true })
  await page.getByRole('button', { name: '添加非门 NOT', exact: true }).dragTo(canvas, { targetPosition: { x: 600, y: 200 } })
  const a = page.getByRole('article', { name: '与门 AND', exact: true })
  const b = page.getByRole('article', { name: '非门 NOT', exact: true })
  const output = a.getByRole('button', { name: '与门 AND输出端', exact: true })
  const input = b.getByRole('button', { name: '非门 NOT输入端 A', exact: true })
  const start = (await output.boundingBox())!, end = (await input.boundingBox())!
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 12 })
  await page.mouse.up()
  const wire = page.getByRole('button', { name: '连接：与门 AND → 非门 NOT A', exact: true })
  await expect(wire).toHaveCount(1)
  for (const zoomed of [false, true]) {
    if (zoomed) {
      await b.getByRole('button', { name: '移动非门 NOT', exact: true }).press('ArrowDown')
      await page.getByRole('button', { name: '缩小画布' }).click()
    }
    // Check the endpoints in screen coordinates against the visible SVG pins,
    // independently of the canvas's node/port geometry implementation.
    const imageA = (await a.getByRole('img').boundingBox())!, imageB = (await b.getByRole('img').boundingBox())!
    const pinA = (await output.boundingBox())!, pinB = (await input.boundingBox())!
    const expectedStart = { x: imageA.x + imageA.width * 0.95, y: imageA.y + imageA.height * 0.5 }
    const expectedEnd = { x: imageB.x + imageB.width * 0.05043478, y: imageB.y + imageB.height * 0.5 }
    expect(pinA.x + pinA.width / 2).toBeCloseTo(expectedStart.x, 0)
    expect(pinB.x + pinB.width / 2).toBeCloseTo(expectedEnd.x, 0)
    const ends = await wire.evaluate((element: SVGPathElement) => {
      const matrix = element.getScreenCTM()!
      const start = element.getPointAtLength(0).matrixTransform(matrix)
      const end = element.getPointAtLength(element.getTotalLength()).matrixTransform(matrix)
      return { start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } }
    })
    expect(ends.start.x).toBeCloseTo(expectedStart.x, 0)
    expect(ends.start.y).toBeCloseTo(expectedStart.y, 0)
    expect(ends.end.x).toBeCloseTo(expectedEnd.x, 0)
    expect(ends.end.y).toBeCloseTo(expectedEnd.y, 0)
  }
  await page.screenshot({ path: test.info().outputPath('bare-gates-connected.png') })
  // A second drag to the already-driven input must keep the original wire.
  await output.click()
  await input.click()
  await expect(page.getByText('该输入端已连接，请先删除原连线', { exact: true })).toBeVisible()
  await expect(wire).toHaveCount(1)
})

test('connecting nearby pins aligns only the target and draws a short horizontal wire', async ({ page }) => {
  await page.goto('/')
  await selectWorkspace(page, '数字逻辑仿真')
  await page.getByRole('button', { name: '添加非门 NOT', exact: true }).click()
  await page.getByRole('button', { name: '添加与门 AND', exact: true }).click()
  const source = page.getByRole('article', { name: '非门 NOT', exact: true })
  const target = page.getByRole('article', { name: '与门 AND', exact: true })
  const output = source.getByRole('button', { name: '非门 NOT输出端', exact: true })
  const input = target.getByRole('button', { name: '与门 AND输入端 B', exact: true })
  const handle = target.getByRole('button', { name: '移动与门 AND', exact: true })
  const from = await pinCenter(output), before = await pinCenter(input)
  await dragGate(page, handle, from.x + 28 - before.x, from.y + 8 - before.y)
  const unconnected = await pinCenter(input)
  expect(unconnected.x - from.x).toBeCloseTo(28, 0)
  expect(unconnected.y - from.y).toBeCloseTo(8, 0)

  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(unconnected.x, unconnected.y, { steps: 12 })
  await page.mouse.up()
  const wire = page.getByRole('button', { name: '连接：非门 NOT → 与门 AND B', exact: true })
  await expect(wire).toHaveCount(1)
  const afterSource = await pinCenter(output), afterTarget = await pinCenter(input)
  expect(afterSource.x).toBeCloseTo(from.x, 0)
  expect(afterSource.y).toBeCloseTo(from.y, 0)
  expect(afterTarget.x).toBeCloseTo(unconnected.x, 0)
  expect(afterTarget.y - unconnected.y).toBeCloseTo(-8, 0)
  await expectAttachedWire(wire, output, input, true)
})

test('connected gates snap by canvas distance while dragging either end and remain movable at reduced zoom', async ({ page }) => {
  await page.goto('/')
  await selectWorkspace(page, '数字逻辑仿真')
  await page.getByRole('button', { name: '添加与门 AND', exact: true }).click()
  await page.getByRole('button', { name: '添加非门 NOT', exact: true }).click()
  const source = page.getByRole('article', { name: '与门 AND', exact: true })
  const target = page.getByRole('article', { name: '非门 NOT', exact: true })
  const output = source.getByRole('button', { name: '与门 AND输出端', exact: true })
  const input = target.getByRole('button', { name: '非门 NOT输入端 A', exact: true })
  const sourceHandle = source.getByRole('button', { name: '移动与门 AND', exact: true })
  const targetHandle = target.getByRole('button', { name: '移动非门 NOT', exact: true })
  const from = await pinCenter(output), before = await pinCenter(input)
  await dragGate(page, targetHandle, from.x + 180 - before.x, from.y + 60 - before.y)
  await output.click()
  await input.click()
  const wire = page.getByRole('button', { name: '连接：与门 AND → 非门 NOT A', exact: true })
  await expect(wire).toHaveCount(1)
  expect((await pinCenter(input)).y - (await pinCenter(output)).y).toBeCloseTo(60, 0)
  await expectAttachedWire(wire, output, input, false)

  await dragGate(page, targetHandle, 0, -52)
  expect((await pinCenter(output)).y).toBeCloseTo(from.y, 0)
  await expectAttachedWire(wire, output, input, true)
  await dragGate(page, targetHandle, 0, 24)
  expect((await pinCenter(input)).y - (await pinCenter(output)).y).toBeCloseTo(24, 0)
  await expectAttachedWire(wire, output, input, false)

  const fixedTarget = await pinCenter(input)
  await dragGate(page, sourceHandle, 0, 16)
  expect((await pinCenter(input)).y).toBeCloseTo(fixedTarget.y, 0)
  await expectAttachedWire(wire, output, input, true)
  await sourceHandle.press('ArrowUp')
  expect((await pinCenter(input)).y - (await pinCenter(output)).y).toBeCloseTo(20, 0)
  await expectAttachedWire(wire, output, input, false)

  for (let count = 0; count < 5; count++) await page.getByRole('button', { name: '缩小画布', exact: true }).click()
  // At 50%, an 8px gap is 16 canvas units and must remain free; 5px is inside the threshold.
  await dragGate(page, targetHandle, 0, -2)
  expect((await pinCenter(input)).y - (await pinCenter(output)).y).toBeCloseTo(8, 0)
  await expectAttachedWire(wire, output, input, false)
  await dragGate(page, targetHandle, 0, -3)
  await expectAttachedWire(wire, output, input, true)

  const zoomedTarget = await pinCenter(input)
  await dragGate(page, sourceHandle, 0, 8)
  expect((await pinCenter(output)).y - (await pinCenter(input)).y).toBeCloseTo(8, 0)
  await expectAttachedWire(wire, output, input, false)
  await dragGate(page, sourceHandle, 0, -3)
  expect((await pinCenter(input)).y).toBeCloseTo(zoomedTarget.y, 0)
  await expectAttachedWire(wire, output, input, true)
})

test('HD44780 exposes aligned digital inputs and keeps top-entry wires attached through move, zoom and deletion', async ({ page }) => {
  await page.goto('/')
  await selectWorkspace(page, '数字逻辑仿真')
  const label = '字符屏 HD44780'
  await page.getByRole('button', { name: '添加与门 AND', exact: true }).click()
  const canvas = page.getByLabel('逻辑电路画布', { exact: true })
  await page.getByRole('button', { name: `添加${label}`, exact: true }).dragTo(canvas, { targetPosition: { x: 360, y: 300 } })
  const lcd = page.getByRole('article', { name: label, exact: true })
  const image = lcd.getByRole('img', { name: `${label}外观`, exact: true })
  await expect.poll(() => image.evaluate((element: HTMLImageElement) =>
    element.complete && element.naturalWidth === 600 && element.naturalHeight === 280)).toBe(true)
  const pins = ['RS', 'R/W', 'E', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7']
  await expect(lcd.getByRole('button', { name: `${label}输入端`, exact: false })).toHaveCount(pins.length)
  await expect(lcd.getByRole('button', { name: `${label}输出端`, exact: true })).toHaveCount(0)
  for (const pin of ['VSS', 'VDD', 'V0', 'A', 'K']) {
    await expect(lcd.getByRole('button', { name: `${label}输入端 ${pin}`, exact: true })).toHaveCount(0)
  }

  const imageSrc = (await image.getAttribute('src'))!
  await page.getByRole('button', { name: `${label}说明`, exact: true }).click()
  const help = page.getByRole('dialog', { name: label, exact: true })
  await expect(help.getByRole('img', { name: `${label}引脚示意图`, exact: true })).toHaveAttribute('src', imageSrc)
  await expect(help).toContainText('支持 E 下降沿写入')
  await expect(help).toContainText('忙标志时序和自定义字形尚未实现')
  await page.keyboard.press('Escape')
  await expect(help).toBeHidden()

  const output = page.getByRole('button', { name: '与门 AND输出端', exact: true })
  for (const pin of ['E', 'D4']) {
    const from = await pinCenter(output), to = await pinCenter(lcd.getByRole('button', { name: `${label}输入端 ${pin}`, exact: true }))
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 12 })
    await page.mouse.up()
    await expect(page.getByRole('button', { name: `连接：与门 AND → ${label} ${pin}`, exact: true })).toHaveCount(1)
  }
  const handle = lcd.getByRole('button', { name: `移动${label}`, exact: true })
  for (const moved of [false, true]) {
    if (moved) {
      const before = await pinCenter(handle)
      await dragGate(page, handle, 40, 30)
      const after = await pinCenter(handle)
      expect(after.x - before.x).toBeCloseTo(40, 0)
      expect(after.y - before.y).toBeCloseTo(30, 0)
      await page.getByRole('button', { name: '缩小画布', exact: true }).click()
    }
    const bounds = (await image.boundingBox())!
    for (const [index, pin] of pins.entries()) {
      const center = await pinCenter(lcd.getByRole('button', { name: `${label}输入端 ${pin}`, exact: true }))
      expect(center.x).toBeCloseTo(bounds.x + bounds.width * (138 + 26 * index) / 600, 0)
      expect(center.y).toBeCloseTo(bounds.y + bounds.height * 22 / 280, 0)
    }
    for (const pin of ['E', 'D4']) {
      const wire = page.getByRole('button', { name: `连接：与门 AND → ${label} ${pin}`, exact: true })
      await expectAttachedWire(wire, output, lcd.getByRole('button', { name: `${label}输入端 ${pin}`, exact: true }), false)
      const approach = await wire.evaluate((element: SVGPathElement) => {
        const length = element.getTotalLength(), matrix = element.getScreenCTM()!
        const end = element.getPointAtLength(length).matrixTransform(matrix)
        const before = element.getPointAtLength(length - 8).matrixTransform(matrix)
        return { end: { x: end.x, y: end.y }, before: { x: before.x, y: before.y } }
      })
      expect(approach.before.x).toBeCloseTo(approach.end.x, 0)
      expect(approach.before.y).toBeLessThan(approach.end.y)
    }
  }
  await handle.press('Delete')
  await expect(lcd).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^连接：/ })).toHaveCount(0)
  await expect(page.getByRole('article', { name: '与门 AND', exact: true })).toHaveCount(1)
})

test('guide and circuit drafts stay separate through tab switching, closing and compact layout', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '添加数字逻辑仿真', exact: true }).click()
  await page.getByRole('button', { name: '打开数字逻辑仿真', exact: true }).click()
  await page.getByRole('button', { name: '添加与门 AND', exact: true }).click()
  await page.getByRole('button', { name: '添加或门 OR', exact: true }).click()
  await page.getByRole('button', { name: '与门 AND输出端', exact: true }).click()
  await page.getByRole('button', { name: '或门 OR输入端 A', exact: true }).click()
  await selectWorkspace(page, '引导界面')
  await expect(page.getByRole('article')).toHaveCount(1)
  await expect(page.getByRole('article', { name: '数字逻辑仿真', exact: true })).toBeVisible()
  await selectWorkspace(page, '数字逻辑仿真')
  await expect(page.getByRole('article')).toHaveCount(2)
  await expect(page.getByRole('button', { name: '连接：与门 AND → 或门 OR A', exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: '关闭数字逻辑仿真页签', exact: true }).click()
  await selectWorkspace(page, '数字逻辑仿真')
  await expect(page.getByRole('article')).toHaveCount(2)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('textbox', { name: '搜索电路元件' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: test.info().outputPath('digital-logic-compact.png') })
  await page.reload()
  await selectWorkspace(page, '数字逻辑仿真')
  await expect(page.getByRole('article')).toHaveCount(0)
})

test('imports a named circuit, fits its full extent and simulates its real signals', async ({ page }) => {
  await page.goto('/')
  await selectWorkspace(page, '数字逻辑仿真')
  const document = { schemaVersion: 1, nodes: [
    { id: 'source', gateId: 'input', label: 'RESET', x: 24, y: 24 },
    { id: 'buffer', gateId: 'buf', x: 4200, y: 2400 },
    { id: 'lcd', gateId: 'hd44780', label: 'LCD', scale: 3, x: 1000, y: 400 },
  ], edges: [{ id: 'wire', source: 'source', target: 'buffer', targetPort: 'A' }], inputValues: { source: '1' } }
  await page.getByLabel('选择逻辑电路文件').setInputFiles({ name: 'circuit.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) })
  await expect(page.getByRole('article')).toHaveCount(3)
  await expect(page.getByLabel('缓冲器 BUF输出电平')).toHaveText('1')
  await page.getByRole('button', { name: '显示全部节点' }).click()
  const viewport = await page.getByLabel('逻辑电路画布').boundingBox()
  const node = await page.getByRole('article', { name: '缓冲器 BUF', exact: true }).boundingBox()
  expect(node!.x + node!.width).toBeLessThan(viewport!.x + viewport!.width)
  expect(node!.y + node!.height).toBeLessThan(viewport!.y + viewport!.height)
  await page.getByRole('button', { name: '切换RESET电平', exact: true }).click()
  await expect(page.getByLabel('缓冲器 BUF输出电平')).toHaveText('0')
  await page.getByLabel('选择逻辑电路文件').setInputFiles({ name: 'circuit.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) })
  await expect(page.getByLabel('缓冲器 BUF输出电平')).toHaveText('1')
  const lcd = page.getByRole('article', { name: 'LCD', exact: true })
  const pin = await lcd.getByRole('button', { name: 'LCD输入端 RS', exact: true }).boundingBox()
  const bounds = (await lcd.boundingBox())!
  expect((pin!.x + pin!.width / 2 - bounds.x) / bounds.width).toBeCloseTo(138 / 600, 2)
})
