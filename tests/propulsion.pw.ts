import { expect, test, type Page } from '@playwright/test'
async function open(page: Page, label: string) {
  await page.getByRole('button', { name: '工程工具箱', exact: true }).click()
  await page.getByRole('navigation', { name: '工程工具箱' }).getByRole('button', { name: label, exact: true }).click()
  await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible()
}
async function select(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}
async function compute(page: Page, result: string) {
  await page.getByRole('button', { name: '开始计算', exact: true }).click()
  await expect(page.getByTestId(result)).toBeVisible({ timeout: 30000 })
}
test('real nozzle solver renders cone and bell, invalidates edits and exports matching results', async ({ page }) => {
  await page.goto('/')
  await open(page, '喷管初步设计')
  await expect(page.getByRole('button', { name: '导出结果' })).toBeDisabled()
  await compute(page, 'nozzle-results')
  await expect(page.getByRole('img', { name: '燃烧室与喷管二维设计图' })).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出结果' }).click()
  const download = await downloadPromise
  const stream = await download.createReadStream(); const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  expect(exported.result.type).toBe('nozzle')
  expect(exported.result.result.identity).toEqual(exported.request.request.identity)
  expect(exported.result.result.contour.length).toBe(65)
  expect(exported.result.result.idealThrustN).toBeGreaterThan(0)
  await select(page, '喷管型式', '钟形喷管（二次曲线）')
  await expect(page.getByTestId('nozzle-results')).toBeHidden()
  await expect(page.getByRole('button', { name: '导出结果' })).toBeDisabled()
  await compute(page, 'nozzle-results')
  await page.getByLabel('起始角', { exact: true }).fill('5')
  await page.getByRole('button', { name: '开始计算', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('exit angle')
  await expect(page.getByTestId('nozzle-results')).toBeHidden()
  await page.getByLabel('起始角', { exact: true }).fill('30')
  await compute(page, 'nozzle-results')
})
test('liquid sizing uses both passage types and keeps inputs across navigation', async ({ page }) => {
  await page.goto('/')
  await open(page, '喷注器水力设计')
  await compute(page, 'injector-results')
  const table = page.getByRole('table', { name: '喷注器水力结果' })
  await expect(table.getByRole('row').filter({ hasText: '该路质量流量' })).toContainText('0.2')
  await expect(page.getByRole('img', { name: '燃料路单元流道截面' })).toBeVisible()
  await select(page, '燃料路流道截面', '圆孔')
  await page.getByLabel('总质量流量', { exact: true }).fill('0.6')
  await compute(page, 'injector-results')
  await expect(table.getByRole('row').filter({ hasText: '该路质量流量' })).toContainText('0.4')
  await open(page, '喷管初步设计')
  await open(page, '喷注器水力设计')
  await expect(page.getByLabel('总质量流量', { exact: true })).toHaveValue('0.6')
  await expect(page.getByTestId('injector-results')).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button', { name: '开始计算', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
test('a changed input rejects a delayed response and service errors remain actionable', async ({ page }) => {
  await page.goto('/')
  await open(page, '喷注器水力设计')
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let received!: () => void
  const arrival = new Promise<void>(resolve => { received = resolve })
  await page.route('**/api/propulsion', async route => {
    const response = await route.fetch(); received(); await gate
    await route.fulfill({ response }).catch(() => {})
  })
  await page.getByRole('button', { name: '开始计算', exact: true }).click()
  await arrival
  await page.getByLabel('总质量流量', { exact: true }).fill('0.8')
  release()
  await expect(page.getByTestId('injector-results')).toBeHidden()
  await expect(page.getByRole('button', { name: '导出结果' })).toBeDisabled()
  await page.unroute('**/api/propulsion')
  await page.route('**/api/propulsion', route => route.fulfill({ status: 503, json: { error: '计算引擎尚未配置' } }))
  await page.getByRole('button', { name: '开始计算', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('计算引擎尚未配置')
})

test('returning to the stencil module preserves an intentionally empty workspace', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '关闭 示例板 · 100 × 100' }).click()
  await open(page, '喷管初步设计')
  await page.getByRole('button', { name: '工程工具箱', exact: true }).click()
  await page.getByRole('navigation', { name: '工程工具箱' }).getByRole('button', { name: '钢网设计与制造' }).click()
  await expect(page.getByRole('button', { name: '关闭 示例板 · 100 × 100' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '打开示例', exact: true })).toBeVisible()
})


test('combined drawing supports three convergents and exports dimensioned SVG and millimetre DXF', async ({ page }) => {
  await page.goto('/')
  await open(page, '喷管初步设计')
  for (const type of ['锥形＋圆弧过渡', '双圆弧型', '平滑曲线（三次 Bézier）']) {
    await select(page, '收敛段型式', type)
    await compute(page, 'nozzle-results')
    await expect(page.getByRole('img', { name: '燃烧室与喷管二维设计图' })).toBeVisible()
  }
  await page.getByText('图纸信息与结构条件', { exact: true }).click()
  await page.getByLabel('材料', { exact: true }).fill('<script>alert(1)</script>')
  await expect(page.getByTestId('nozzle-results')).toBeVisible()
  const readDownload = async (button: string) => {
    const next = page.waitForEvent('download')
    await page.getByRole('button', { name: button, exact: true }).click()
    const downloaded = await next, stream = await downloaded.createReadStream(), chunks: Buffer[] = []
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
    return Buffer.concat(chunks).toString('utf8')
  }
  const svg = await readDownload('导出 SVG 图纸')
  expect(svg).toContain('width="420mm"')
  expect(svg).toContain('总长')
  expect(svg).toContain('&lt;script&gt;')
  expect(svg).not.toContain('<script>')
  const dxf = await readDownload('导出 DXF 轮廓')
  expect(dxf).toContain('$INSUNITS\r\n70\r\n4')
  expect(dxf.match(/\r\nPOLYLINE\r\n/g)).toHaveLength(2)
  const exportJson = JSON.parse(await readDownload('导出结果'))
  const c = exportJson.result.result.chamberGeometry
  expect(c.contour.at(-1)).toEqual(exportJson.result.result.contour[0])
  expect(dxf).toContain(`10\r\n${c.inletXM * 1000}\r\n20\r\n${c.innerRadiusM * 1000}`)
  await page.getByLabel('曲线收敛长度', { exact: true }).fill('85')
  await expect(page.getByRole('button', { name: '导出 SVG 图纸' })).toHaveCount(0)
  await compute(page, 'nozzle-results')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
