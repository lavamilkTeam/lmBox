import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { CfdRequest, CfdState } from '../frontend/contracts'
import { selectWorkspace } from './workspace-navigation'

const fixture = JSON.parse(readFileSync(new URL('../contracts/fixtures/v1/cfd-initialized-response.json', import.meta.url), 'utf8')).state as CfdState
// Test the UI/session lifecycle at its HTTP boundary without starting a native solver.
test('closing a background fluid tab confirms disposal, preserves it on failure and releases on retry', async ({ page }) => {
  let closeAttempts = 0
  let initializations = 0
  await page.route('**/api/cfd', async route => {
    const input = route.request().postDataJSON() as CfdRequest
    if (input.operation === 'initialize') initializations++
    if (input.operation === 'close' && ++closeAttempts === 1) {
      await route.fulfill({ status: 503, json: { error: '测试服务暂时不可用' } })
      return
    }
    await route.fulfill({ json: { schemaVersion: 1, projectId: input.projectId, requestId: input.requestId, inputRevision: input.expectedRevision,
      revision: input.operation === 'close' ? input.expectedRevision + 1 : 1, ok: true, ...(input.operation === 'close' ? {} : { state: fixture }) } })
  })
  await page.goto('/')
  await selectWorkspace(page, '流体力学')
  await expect(page.getByRole('button', { name: '打开或导入几何', exact: true })).toBeEnabled()
  await selectWorkspace(page, '引导界面')
  expect(closeAttempts).toBe(0)
  const tab = page.getByRole('tab', { name: '流体力学', exact: true })
  const close = page.getByRole('button', { name: '关闭流体力学页签', exact: true })
  await close.click()
  const dialog = page.getByRole('alertdialog')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(tab).toBeVisible()
  expect(closeAttempts).toBe(0)
  await close.click()
  await dialog.getByRole('button', { name: '关闭并释放', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('测试服务暂时不可用')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(tab).toBeVisible()
  await close.click()
  await dialog.getByRole('button', { name: '关闭并释放', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(tab).toHaveCount(0)
  expect(closeAttempts).toBe(2)
  await selectWorkspace(page, '流体力学')
  await expect(page.getByRole('button', { name: '打开或导入几何', exact: true })).toBeEnabled()
  expect(initializations).toBe(2)
})

test('closing waits for initialization and uses its confirmed revision', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let initialStarted = false
  const closes: CfdRequest[] = []
  await page.route('**/api/cfd', async route => {
    const input = route.request().postDataJSON() as CfdRequest
    if (input.operation === 'initialize') { initialStarted = true; await gate }
    if (input.operation === 'close') closes.push(input)
    await route.fulfill({ json: { schemaVersion: 1, projectId: input.projectId, requestId: input.requestId, inputRevision: input.expectedRevision,
      revision: input.operation === 'close' ? 2 : 1, ok: true, ...(input.operation === 'close' ? {} : { state: fixture }) } })
  })
  await page.goto('/')
  await selectWorkspace(page, '流体力学')
  await expect.poll(() => initialStarted).toBe(true)
  await page.getByRole('button', { name: '关闭流体力学页签', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '关闭并释放', exact: true }).click()
  await expect(page.getByRole('button', { name: '正在关闭…', exact: true })).toBeDisabled()
  expect(closes).toHaveLength(0)
  release()
  // Modal dialogs hide background tabs from role queries until disposal completes.
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(page.getByRole('tab', { name: '流体力学', exact: true })).toHaveCount(0)
  expect(closes).toHaveLength(1)
  expect(closes[0]!.expectedRevision).toBe(1)
})

for (const scenario of ['session_missing', 'stale_revision'] as const) {
  test(`closing recovers from ${scenario} without leaving an occupied tab`, async ({ page }) => {
    const closes: CfdRequest[] = []
    await page.route('**/api/cfd', async route => {
      const input = route.request().postDataJSON() as CfdRequest
      if (input.operation === 'close') closes.push(input)
      const code = scenario === 'session_missing'
        ? input.operation === 'initialize' ? 'session_limit' : 'session_missing'
        : input.operation === 'close' && closes.length === 1 ? 'stale_revision' : undefined
      const revision = scenario === 'session_missing' ? 0 : input.operation === 'close' ? 2 : 1
      await route.fulfill({ json: { schemaVersion: 1, projectId: input.projectId, requestId: input.requestId, inputRevision: input.expectedRevision,
        revision, ok: !code, ...(code ? { error: { code, message: '测试会话状态已变化' } } : {}),
        ...(scenario === 'session_missing' || input.operation === 'close' && !code ? {} : { state: { ...fixture, revision } }) } })
    })
    await page.goto('/')
    await selectWorkspace(page, '流体力学')
    if (scenario === 'session_missing') await expect(page.getByText('测试会话状态已变化', { exact: true })).toBeVisible()
    else await expect(page.getByRole('button', { name: '打开或导入几何', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: '关闭流体力学页签', exact: true }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: '关闭并释放', exact: true }).click()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(page.getByRole('tab', { name: '流体力学', exact: true })).toHaveCount(0)
    expect(closes.map(input => input.expectedRevision)).toEqual(scenario === 'session_missing' ? [0] : [1, 2])
  })
}

test('polls scheduled during native shutdown do not run after the session is released', async ({ page }) => {
  await page.clock.install()
  await page.clock.pauseAt(new Date())
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const operations: string[] = []
  await page.route('**/api/cfd', async route => {
    const input = route.request().postDataJSON() as CfdRequest
    operations.push(input.operation)
    if (input.operation === 'close') await gate
    await route.fulfill({ json: { schemaVersion: 1, projectId: input.projectId, requestId: input.requestId, inputRevision: input.expectedRevision,
      revision: input.operation === 'close' ? 2 : 1, ok: true, ...(input.operation === 'close' ? {} : { state: fixture }) } })
  })
  await page.goto('/')
  await selectWorkspace(page, '流体力学')
  await expect(page.getByRole('button', { name: '打开或导入几何', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '关闭流体力学页签', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '关闭并释放', exact: true }).click()
  await expect.poll(() => operations.includes('close')).toBe(true)
  await page.clock.runFor(1500)
  release()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await selectWorkspace(page, '流体力学')
  await expect(page.getByRole('button', { name: '打开或导入几何', exact: true })).toBeEnabled()
  expect(operations).toEqual(['initialize', 'close', 'initialize'])
})

test('native field layers and factual progress remain visible across result revisions', async ({ page }) => {
  const state: CfdState = structuredClone(fixture)
  const mesh = {vertices:[0,0,0,1,0,0,0,1,0],triangles:[0,1,2],fields:{p:[10,20,30],U:[1,2,3]},truncated:false}
  state.results={status:'ready',data:{id:'explicit-test-fixture',time:25,coordinateUnit:'m',fields:[{id:'p',label:'压力',unit:'Pa',range:[10,30]},{id:'U',label:'速度',unit:'m/s',range:[1,3]}],surface:mesh,slice:mesh,
    streamlines:{vertices:[0,0,0,1,0,0],segments:[0,1],fields:{p:[10,20],U:[1,2]},truncated:false},vectors:{positions:[0,0,0],values:[1,0,0],fields:{p:[10],U:[1]}}}}
  state.progress={stage:'solving',current:25,total:500}
  await page.route('**/api/cfd',async route=>{
    const input=route.request().postDataJSON() as CfdRequest
    await route.fulfill({json:{schemaVersion:1,projectId:input.projectId,requestId:input.requestId,inputRevision:input.expectedRevision,revision:1,ok:true,state}})
  })
  await page.goto('/')
  await selectWorkspace(page,'流体力学')
  await page.getByRole('button',{name:'流场',exact:true}).click()
  await expect(page.getByRole('img',{name:'流体计算三维结果'})).toBeVisible()
  await expect(page.getByRole('progressbar',{name:'计算进度'})).toHaveAttribute('aria-valuenow','5')
  await page.getByRole('checkbox',{name:'速度矢量',exact:true}).check()
  await page.getByRole('combobox',{name:'显示物理量'}).click()
  await page.getByRole('option',{name:'速度 (m/s)',exact:true}).click()
  await expect(page.getByLabel('速度色标')).toBeVisible()
  state.results={status:'loading'}
  state.progress={stage:'checking',current:0,total:null}
  await expect(page.getByText('读取流场…')).toBeVisible()
  await expect(page.getByRole('button',{name:'流场',exact:true})).toBeDisabled()
  await expect(page.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow')
})
