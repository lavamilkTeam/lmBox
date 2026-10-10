import { expect, type Page } from '@playwright/test'

export async function selectWorkspace(page: Page, label: string) {
  const library = page.getByRole('navigation', { name: '引导功能库' })
  const toolbox = page.getByRole('button', { name: '工程工具箱', exact: true })
  await expect(library.or(toolbox)).toBeVisible()
  if (await library.isVisible()) {
    if (label === '引导界面') return
    await library.getByRole('button', { name: `添加${label}`, exact: true }).click()
    await page.getByRole('article', { name: label, exact: true }).last().getByRole('button', { name: `打开${label}`, exact: true }).click()
    return
  }
  await toolbox.click()
  await page.getByRole('navigation', { name: '工程工具箱' }).getByRole('button', { name: label, exact: true }).click()
}
