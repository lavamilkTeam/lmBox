import { expect, type Page } from '@playwright/test'

export async function chooseProfessionalMode(page: Page) {
  await page.getByRole('dialog', { name: '选择使用方式' }).getByRole('button', { name: '专业模式', exact: true }).click()
}

export async function openWorkbench(page: Page) {
  await page.goto('/')
  await chooseProfessionalMode(page)
}

export async function selectWorkspace(page: Page, label: string) {
  const tabs = page.getByRole('tablist', { name: '工作区页签' })
  await expect(tabs).toBeVisible()
  const existing = tabs.getByRole('tab', { name: label === '引导界面' ? '开始' : label, exact: true })
  if (await existing.count()) {
    await existing.click()
    return
  }
  await tabs.getByRole('tab', { name: '功能库', exact: true }).click()
  await page.getByRole('navigation', { name: '可用功能' }).getByRole('button', { name: label, exact: true }).click()
}
