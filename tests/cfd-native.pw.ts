import { expect, test } from '@playwright/test'
import { selectWorkspace } from './workspace-navigation'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { strFromU8, unzipSync } from 'fflate'
import type { CfdRequest, CfdResponse, CfdState } from '../frontend/contracts'

// This suite requires the real local FreeCAD/CfdOF runtime and a public CAD fixture.
test.skip(process.env.LMBOX_CFD_INTEGRATION !== '1', 'Set LMBOX_CFD_INTEGRATION=1 to exercise the native CFD worker')

test('native CAD, physics controls, properties and FCStd export retain original values', async ({ page, request }) => {
  test.setTimeout(120_000)
  const fixture = process.env.LMBOX_CFD_TEST_FILE
  expect(fixture, 'LMBOX_CFD_TEST_FILE must identify a geometry-only CAD fixture').toBeTruthy()
  const received: CfdResponse[] = []
  const pending = new Set<Promise<void>>()
  const pageErrors: string[] = []
  let projectId = ''
  let revision = 0
  let state: CfdState | undefined
  let pollResponses = 0
  let downloads = 0
  page.on('download', () => downloads++)
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('response', response => {
    if (new URL(response.url()).pathname !== '/api/cfd') return
    const read = response.json().then((body: CfdResponse) => {
      if (!projectId) projectId = body.projectId
      if (body.projectId !== projectId) return
      received.push(body)
      if (response.request().postDataJSON()?.operation === 'poll') pollResponses++
      if (body.revision >= revision) {
        revision = body.revision
        if (body.state) state = body.state
      }
    }).catch(() => undefined)
    pending.add(read)
    void read.finally(() => pending.delete(read))
  })
  const waitState = async (predicate: (value: CfdState) => boolean) => {
    await expect.poll(() => Boolean(state && predicate(state)), { timeout: 30_000 }).toBe(true)
  }
  const physicsProperty = (name: string) => state?.document.objects.find(object => object.id === 'PhysicsModel')?.properties.find(property => property.name === name)?.value
  try {
    await page.goto('/')
    await selectWorkspace(page, '喷管初步设计')
    await page.getByRole('button', { name: '工程工具箱', exact: true }).click()
    await page.getByRole('navigation', { name: '工程工具箱' }).getByRole('button', { name: '计算流体力学', exact: true }).click()
    await waitState(value => Boolean(value.runtime.freecadVersion) && !value.busy)
    expect(state!.document.objects).toHaveLength(0)
    await expect(page.getByRole('tree', { name: '模型树' })).toContainText('流体工程')

    await page.getByLabel('选择流体工程或几何文件', { exact: true }).setInputFiles({ name: basename(fixture!), mimeType: 'application/octet-stream', buffer: await readFile(fixture!) })
    await waitState(value => value.geometry.some(shape => shape.triangles.length > 0 && shape.faces.length > 0) && !value.busy)
    await expect(page.getByRole('img', { name: '流体工程三维几何' }).locator('canvas')).toBeVisible()
    await page.locator('[data-command="CfdOF_Analysis"]').click()
    await waitState(value => value.document.objects.some(object => object.id === 'PhysicsModel') && !value.busy)
    await page.locator('[data-command="CfdOF_PhysicsModel"]').click()
    await expect(page.getByRole('radio', { name: '瞬态', exact: true })).toBeVisible()
    await expect(page.getByRole('radio', { name: '多相 - 自由表面', exact: true })).toBeDisabled()
    await page.getByRole('radio', { name: '瞬态', exact: true }).click()
    await expect(page.getByRole('radio', { name: '多相 - 自由表面', exact: true })).toBeEnabled()
    await page.getByRole('radio', { name: '多相 - 自由表面', exact: true }).click()
    await expect(page.getByRole('checkbox', { name: '等温', exact: true })).toBeDisabled()
    const gravityY = page.locator('[data-qt-widget="gy"]').getByRole('textbox')
    await gravityY.fill('-9.75 m/s^2')
    await gravityY.press('Tab')
    await page.screenshot({path:test.info().outputPath('native-physics.png')})
    await page.getByRole('button', { name: '确定', exact: true }).click()
    await waitState(value => value.editor === null && !value.busy && physicsProperty('Time') === 'Transient' && physicsProperty('Phase') === 'FreeSurface')
    expect(String(physicsProperty('gy'))).toMatch(/-9750(?:\.0+)?\s*mm\/s\^2/)

    await page.locator('[data-object-id="PhysicsModel"]').getByRole('treeitem').click()
    const phase = page.locator('[data-property="Phase"]').getByRole('combobox')
    await expect(phase).toBeEnabled()
    await phase.click()
    await page.getByRole('option', { name: '单相', exact: true }).click()
    await waitState(value => !value.busy && physicsProperty('Phase') === 'Single')
    const downloadEvent = page.waitForEvent('download', { timeout: 30_000 })
    await page.getByRole('button', { name: '保存工程', exact: true }).click()
    const download = await downloadEvent
    expect(download.suggestedFilename()).toMatch(/\.FCStd$/i)
    const stream = await download.createReadStream()
    expect(stream).not.toBeNull()
    const chunks: Buffer[] = []
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
    const entries = unzipSync(Buffer.concat(chunks))
    expect(entries['Document.xml']).toBeDefined()
    expect(Object.keys(entries).some(name => name.endsWith('.brp'))).toBe(true)
    const document = strFromU8(entries['Document.xml']!)
    const property = (name: string) => document.match(new RegExp(`<Property name="${name}"[\\s\\S]*?</Property>`))?.[0] ?? ''
    expect(property('Time')).toMatch(/<Integer value="1"/)
    expect(property('Time')).toContain('<Enum value="Transient"')
    expect(property('Phase')).toMatch(/<Integer value="0"/)
    expect(Number(property('gy').match(/<Float value="([^"]+)"/)?.[1])).toBe(-9750)
    const savedAtPoll = pollResponses
    await expect.poll(() => pollResponses, {timeout:10_000}).toBeGreaterThanOrEqual(savedAtPoll + 2)
    expect(downloads).toBe(1)
    expect(received.filter(response => response.artifact)).toHaveLength(1)
    await page.screenshot({path:test.info().outputPath('native-document.png')})
    expect(received.filter(response => !response.ok)).toEqual([])
    expect(pageErrors).toEqual([])
  } finally {
    // Stop this context's polling before closing only the session it created.
    await page.close()
    await Promise.all([...pending])
    if (projectId) {
      let closed = false
      for (let attempt = 0; attempt < 3 && !closed; attempt++) {
        const input: CfdRequest = { schemaVersion: 1, projectId, requestId: randomUUID(), expectedRevision: revision, operation: 'close', payload: {} }
        const result = await request.post('/api/cfd', { data: input })
        const body = await result.json() as CfdResponse
        expect(body.projectId).toBe(projectId)
        revision = body.revision
        closed = body.ok
        if (!closed && !body.error?.code.toLowerCase().includes('revision')) break
      }
      expect(closed, 'The integration test must close its own native session').toBe(true)
    }
  }
})
