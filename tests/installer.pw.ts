import { test, expect } from '@playwright/test'

test.use({ baseURL: 'http://127.0.0.1:6523' })

test('welcome keeps the pig still during entry and starts the GIF after landing', async ({ page }) => {
  await page.addInitScript(() => {
    document.addEventListener('animationend', event => {
      if (event.target instanceof HTMLElement && event.target.getAttribute('role') === 'img') {
        performance.mark('pig-landed')
      }
    }, { capture: true })
  })
  await page.goto('/installer.html')
  await expect(page.getByRole('heading', { name: /让我们开始安装\s*lmbox/ })).toBeVisible()
  await expect(page.getByRole('img', { name: '猪猪' }).locator('img[src$=".gif"]')).toBeVisible()
  const timing = await page.evaluate(() => ({
    landed: performance.getEntriesByName('pig-landed')[0]?.startTime,
    gif: performance.getEntriesByType('resource').find(entry => entry.name.endsWith('/pig.gif'))?.startTime,
    font: document.fonts.check('500 48px "LmBox Welcome Soft"', '让我们开始安装lmbox'),
  }))
  expect(timing.landed).toBeDefined()
  expect(timing.gif).toBeGreaterThanOrEqual(timing.landed!)
  expect(timing.font).toBe(true)
  const button = page.getByRole('button', { name: '继续' })
  await button.focus()
  await expect(button).toBeFocused()
  await button.press('Enter')
  await expect(page).toHaveURL(/installer\.html$/)
})

test('reduced motion keeps the pig static and the narrow welcome screen usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 740 })
  const gifs: string[] = []
  page.on('request', request => { if (request.url().endsWith('/pig.gif')) gifs.push(request.url()) })
  await page.goto('/installer.html')
  await expect(page.getByRole('heading')).toBeVisible()
  const button = page.getByRole('button', { name: '继续' })
  await expect(button).toBeInViewport()
  await button.click()
  expect(gifs).toHaveLength(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
