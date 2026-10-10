import { expect, type Page } from '@playwright/test'

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
