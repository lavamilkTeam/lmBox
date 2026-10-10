import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { selectWorkspace } from './workspace-navigation'
import { aiRuntimeFixture } from './ai-runtime-fixture'

test('video canvas executes a provider workflow through real Rust and Python, saves output and preserves draft', async ({ page }, testInfo) => {
  const runtime = await aiRuntimeFixture(page)
  try {
    await page.goto('/')
    await selectWorkspace(page, '视频工作流')
    await expect(page.getByRole('button', { name: '测试提示词', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '测试提示词', exact: true }).click()
    await page.getByRole('button', { name: '测试云端视频', exact: true }).click()
    await page.getByRole('button', { name: '节点 1 输出 text', exact: true }).click()
    await page.getByRole('button', { name: '节点 2 输入 prompt', exact: true }).click()
    await expect(page.getByRole('button', { name: /断开：/ })).toHaveCount(1)
    const exported = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出 API', exact: true }).click()
    const workflow = JSON.parse(await readFile(await (await exported).path(), 'utf8'))
    expect(workflow['2'].inputs.prompt).toEqual(['1', 0])
    expect(workflow['2'].inputs.model).toBe('fixture-video-v1')
    expect(workflow['2'].inputs.format).toBe('auto')
    expect(JSON.stringify(workflow)).not.toContain('fixture-partner-key')
    await page.getByRole('button', { name: '生成视频', exact: true }).click()
    await expect(page.getByLabel('视频生成结果')).toContainText('fixture-video.mp4', { timeout: 20000 })
    const output = page.waitForEvent('download')
    await page.getByLabel('视频生成结果').getByRole('button', { name: '下载', exact: true }).click()
    expect(await readFile(await (await output).path())).toEqual(runtime.videoBytes)
    expect(runtime.counts().submissions).toBe(1)
    await page.screenshot({ path: testInfo.outputPath('video-workflow.png') })
    await selectWorkspace(page, 'AI 工作助手')
    await selectWorkspace(page, '视频工作流')
    await expect(page.locator('[data-node-id]')).toHaveCount(2)
  } finally { await runtime.close() }
})

test('Agent runs real LangGraph file tools with a local model fixture and downloads the owned artifact', async ({ page }, testInfo) => {
  const runtime = await aiRuntimeFixture(page)
  try {
    await page.goto('/')
    await selectWorkspace(page, 'AI 工作助手')
    await expect(page.getByText('fixture-agent-model', { exact: true })).toBeVisible({ timeout: 20000 })
    await page.getByLabel('Agent 任务', { exact: true }).fill('Fixture: write 42 to answer.txt.')
    await page.getByRole('button', { name: '执行任务', exact: true }).click()
    await expect(page.getByLabel('Agent 执行结果')).toContainText('Fixture task complete', { timeout: 20000 })
    const output = page.waitForEvent('download')
    await page.getByLabel('Agent 结果文件').getByRole('button', { name: '下载', exact: true }).click()
    expect(await readFile(await (await output).path(), 'utf8')).toBe('42')
    expect(runtime.counts().completions).toBe(2)
    await page.screenshot({ path: testInfo.outputPath('agent-workspace.png') })
    await page.setViewportSize({ width: 760, height: 900 })
    await expect(page.getByLabel('Agent 任务', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  } finally { await runtime.close() }
})

test('video cancellation is scoped to its provider job and a draft survives workspace switching', async ({ page }) => {
  const runtime = await aiRuntimeFixture(page); runtime.slowVideo()
  try {
    await page.goto('/')
    await selectWorkspace(page, '视频工作流')
    await page.getByRole('button', { name: '测试提示词', exact: true }).click()
    await page.getByRole('button', { name: '测试云端视频', exact: true }).click()
    await page.getByRole('button', { name: '节点 1 输出 text', exact: true }).click()
    await page.getByRole('button', { name: '节点 2 输入 prompt', exact: true }).click()
    await page.getByRole('button', { name: '生成视频', exact: true }).click()
    await expect.poll(() => runtime.counts().submissions).toBe(1)
    await selectWorkspace(page, 'AI 工作助手')
    await selectWorkspace(page, '视频工作流')
    await page.getByRole('button', { name: '取消任务', exact: true }).click()
    await expect(page.getByText('已取消', { exact: true })).toBeVisible({ timeout: 15000 })
    expect(runtime.counts().cancellations).toBe(1)
    await expect(page.getByLabel('视频生成结果')).toHaveCount(0)
  } finally { await runtime.close() }
})
