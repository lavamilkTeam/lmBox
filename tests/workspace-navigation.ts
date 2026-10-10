import type { Page } from '@playwright/test'

export async function selectWorkspace(page: Page, label: string) {
  await page.getByRole('button', { name: '工程工具箱', exact: true }).click()
  await page.getByRole('navigation', { name: '工程工具箱' }).getByRole('button', { name: label, exact: true }).click()
}
