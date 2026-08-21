import { expect, test } from '@playwright/test'
import { USERS, expectNoHorizontalOverflow, goto, resetApp, startAs } from './helpers'

/** 先方に渡すときに「本番の画面」と誤解されないための告知(全画面共通) */

const HQ_SCREENS = ['dashboard', 'review', 'companies', 'reserved', 'products', 'settings', 'audit']

test.describe('試作版の告知', () => {
  test('ログイン画面に告知が出る', async ({ page }) => {
    await resetApp(page)
    const bar = page.getByTestId('preview-notice')
    await expect(bar).toBeVisible()
    await expect(bar).toContainText('試作版')
    await expect(bar).toContainText('架空')
    await expectNoHorizontalOverflow(page)
  })

  test('ログイン後もすべての画面で告知が出る', async ({ page }) => {
    await startAs(page, USERS.hq)
    for (const screen of HQ_SCREENS) {
      await goto(page, screen)
      await expect(page.locator('.content')).toBeVisible()
      await expect(page.getByTestId('preview-notice'), screen).toBeVisible()
      await expectNoHorizontalOverflow(page)
    }
  })

  test('画面をスクロールしても告知は上部に残る', async ({ page }) => {
    await startAs(page, USERS.hq)
    // 画面を縦に縮めて、必ずスクロールが発生する状態にする
    await page.setViewportSize({ width: 1440, height: 420 })
    await goto(page, 'audit')
    await expect(page.locator('.content')).toBeVisible()

    await page.evaluate(() => window.scrollTo(0, 600))
    const scrolled = await page.evaluate(() => window.scrollY)
    expect(scrolled, 'スクロールできていないと検証にならない').toBeGreaterThan(100)

    const top = await page
      .getByTestId('preview-notice')
      .evaluate((el) => el.getBoundingClientRect().top)
    expect(Math.abs(top), '告知が画面上部に固定されていない').toBeLessThanOrEqual(1)
  })

  test('告知とトップバーが重ならない', async ({ page }) => {
    await startAs(page, USERS.hq)
    await page.setViewportSize({ width: 1440, height: 420 })
    await goto(page, 'audit')
    await page.evaluate(() => window.scrollTo(0, 600))

    const barBottom = await page
      .getByTestId('preview-notice')
      .evaluate((el) => el.getBoundingClientRect().bottom)
    const topbarTop = await page.locator('.topbar').evaluate((el) => el.getBoundingClientRect().top)
    expect(topbarTop, 'トップバーが告知の下に潜り込んでいる').toBeGreaterThanOrEqual(barBottom - 1)
  })

  test('画面に「モック」というカタカナ語を出さない', async ({ page }) => {
    await resetApp(page)
    expect(await page.locator('body').innerText()).not.toContain('モック')

    await startAs(page, USERS.hq)
    for (const screen of ['dashboard', 'agency-users', 'audit']) {
      await goto(page, screen)
      await expect(page.locator('.content')).toBeVisible()
      expect(await page.locator('body').innerText(), screen).not.toContain('モック')
    }
  })
})
