import { expect, test, type Locator, type Page } from '@playwright/test'
import { selectWorkspace } from './workspace-navigation'

const lcdLabel = '字符屏 HD44780'
const inputPorts = ['RS', 'R/W', 'E', 'D4', 'D5', 'D6', 'D7'] as const
const blankRow = ' '.repeat(16)

function inputs(page: Page) {
  return page.getByRole('article', { name: '输入开关', exact: true })
}

async function setInput(page: Page, index: number, value: 0 | 1) {
  const input = inputs(page).nth(index)
  const toggle = input.getByRole('button', { name: '切换输入开关电平', exact: true })
  if ((await toggle.textContent())?.trim() !== String(value)) await toggle.click()
  await expect(input.getByRole('status', { name: '输入开关输出电平', exact: true })).toHaveText(String(value))
  await expect(page.getByRole('button', { name: '单步仿真', exact: true })).toBeEnabled()
}

async function writeNibble(page: Page, data: boolean, value: number) {
  await setInput(page, 0, data ? 1 : 0)
  for (let bit = 0; bit < 4; bit++) await setInput(page, bit + 3, value & (1 << bit) ? 1 : 0)
  await setInput(page, 2, 1)
  await setInput(page, 2, 0)
}

async function writeByte(page: Page, data: boolean, value: number) {
  await writeNibble(page, data, value >> 4)
  await writeNibble(page, data, value & 0xf)
}

async function expectRows(screen: Locator, first: string, second: string) {
  await expect(screen).toHaveAttribute('data-display-on', 'true')
  await expect.poll(() => screen.evaluate(element => Array.from(element.children, row => row.textContent)))
    .toEqual([first, second])
}

async function expectCursor(screen: Locator, row: number, column: number) {
  await expect(screen).toHaveAttribute('data-cursor', String((row - 1) * 16 + column - 1))
  await expect(screen.getByRole('img', { name: `${lcdLabel}光标，第${row}行第${column}列`, exact: true })).toBeVisible()
  await expect(screen.getByRole('img')).toHaveCount(1)
}

test('real Rust LCD accepts four-bit UI writes and renders rows, cursor, display control and clear', async ({ page }, testInfo) => {
  test.setTimeout(60000)
  await page.setViewportSize({ width: 1920, height: 1100 })
  const workers: string[] = [], errors: string[] = []
  page.on('worker', worker => workers.push(worker.url()))
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await selectWorkspace(page, '数字逻辑仿真')
  const canvas = page.getByLabel('逻辑电路画布', { exact: true })
  for (let index = 0; index < inputPorts.length; index++) {
    await page.getByRole('button', { name: '添加输入开关', exact: true }).dragTo(canvas, {
      targetPosition: { x: 140 + index % 2 * 250, y: 100 + Math.floor(index / 2) * 160 },
    })
    await expect(inputs(page)).toHaveCount(index + 1)
    await expect(inputs(page).nth(index)).toBeVisible()
  }
  await page.getByRole('button', { name: `添加${lcdLabel}`, exact: true }).dragTo(canvas, {
    targetPosition: { x: 760, y: 300 },
  })
  const lcd = page.getByRole('article', { name: lcdLabel, exact: true })
  await expect(lcd).toBeVisible()
  for (const [index, port] of inputPorts.entries()) {
    await inputs(page).nth(index).getByRole('button', { name: '输入开关输出端', exact: true }).click()
    await lcd.getByRole('button', { name: `${lcdLabel}输入端 ${port}`, exact: true }).click()
    await expect(page.getByRole('button', { name: `连接：输入开关 → ${lcdLabel} ${port}`, exact: true })).toHaveCount(1)
    await expect(page.getByRole('button', { name: '单步仿真', exact: true })).toBeEnabled()
  }
  for (let index = 0; index < inputPorts.length; index++) await setInput(page, index, 0)
  const screen = lcd.getByRole('status', { name: `${lcdLabel}显示内容`, exact: true })
  await expect(screen).toHaveAttribute('data-display-on', 'false')

  // D0–D3 remain unconnected; all writes use the seven real input controls above.
  for (const value of [0x3, 0x3, 0x3, 0x2]) await writeNibble(page, false, value)
  for (const command of [0x28, 0x0e, 0x06, 0x01]) await writeByte(page, false, command)
  await expectRows(screen, blankRow, blankRow)
  await expectCursor(screen, 1, 1)

  await writeByte(page, true, 0x41)
  await writeByte(page, true, 0x42)
  await expectRows(screen, `AB${' '.repeat(14)}`, blankRow)
  await expectCursor(screen, 1, 3)
  await expect(page.getByRole('button', { name: '仿真诊断', exact: true })).toHaveText('诊断 0')
  const screenshot = testInfo.outputPath('digital-logic-lcd.png')
  await page.screenshot({ path: screenshot })
  await testInfo.attach('LCD text and cursor from real Rust simulation', { path: screenshot, contentType: 'image/png' })

  await writeByte(page, false, 0xc0)
  await writeByte(page, true, 0x42)
  await expectRows(screen, `AB${' '.repeat(14)}`, `B${' '.repeat(15)}`)
  await expectCursor(screen, 2, 2)

  await writeByte(page, false, 0x08)
  await expect(screen).toHaveAttribute('data-display-on', 'false')
  await expect(screen).not.toHaveAttribute('data-cursor')
  await expect(screen).toBeEmpty()
  await expect(screen.getByRole('img')).toHaveCount(0)
  await writeByte(page, false, 0x0e)
  await expectRows(screen, `AB${' '.repeat(14)}`, `B${' '.repeat(15)}`)
  await expectCursor(screen, 2, 2)
  await writeByte(page, false, 0x01)
  await expectRows(screen, blankRow, blankRow)
  await expectCursor(screen, 1, 1)

  await expect(page.getByRole('status', { name: '仿真步数', exact: true })).toHaveText('t = 0')
  expect(workers.some(url => url.includes('digital-logic.worker'))).toBe(true)
  expect(errors).toEqual([])
})
