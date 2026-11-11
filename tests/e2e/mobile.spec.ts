import { expect, test } from '@playwright/test'

test('touch-sized layouts keep both modes and board within the viewport', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Bishop odds.' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Swap colors', exact: true }).tap()
  await page.getByRole('tab', { name: 'Puzzle Lab' }).tap()
  await expect(page.getByRole('region', { name: 'White puzzle', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Black puzzle', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.goto('http://127.0.0.1:4174/tests/board.html')
  await page.locator('.square-hit[data-square="f7"]').tap()
  await page.locator('.square-hit[data-square="f8"]').tap()
  await page.getByRole('button', { name: 'knight', exact: true }).tap()
  await expect(page.getByLabel('Played move')).toHaveText('f7f8n')
})
