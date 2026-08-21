import { expect, test } from '@playwright/test'
import { USERS, expectNoHorizontalOverflow, goto, startAs } from './helpers'

/** §19 代理店側の画面をスマートフォンで操作できること */
const AGENCY_SCREENS = [
  'dashboard',
  'eligibility',
  'deal-new',
  'my-deals',
  'deals',
  'deal/DL-2026-0001',
  'inquiries',
  'notifications',
  'extensions',
]

test.describe('§19 レスポンシブ', () => {
  test('試作版の告知がスマートフォンでも横スクロールを出さない', async ({ page }) => {
    await startAs(page, USERS.member1)
    for (const screen of AGENCY_SCREENS) {
      await goto(page, screen)
      await expect(page.getByTestId('preview-notice'), screen).toBeVisible()
      await expectNoHorizontalOverflow(page)
    }
  })

  test('ログイン画面が横スクロールなしで表示される', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.clear())
    await page.goto('/')
    await expect(page.getByTestId('login-U-A1-M1')).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })

  test('代理店側の主要画面が横スクロールなしで表示される', async ({ page }) => {
    await startAs(page, USERS.member1)
    for (const screen of AGENCY_SCREENS) {
      await goto(page, screen)
      await expect(page.locator('.content')).toBeVisible()
      await expectNoHorizontalOverflow(page)
    }
  })

  test('メニューは開閉でき、開いた状態でも画面からはみ出さない', async ({ page }) => {
    await startAs(page, USERS.member1)
    await goto(page, 'dashboard')

    // 既定では隠れている
    const sidebar = page.getByTestId('sidebar')
    await expect(sidebar).not.toHaveClass(/sidebar--open/)

    await page.getByTestId('menu-toggle').click()
    await expect(sidebar).toHaveClass(/sidebar--open/)
    await expectNoHorizontalOverflow(page)

    await page.getByTestId('nav-my-deals').click()
    await expect(page).toHaveURL(/#\/my-deals/)
    await expect(sidebar).not.toHaveClass(/sidebar--open/)
  })

  test('案件一覧は横スクロールではなく縦積みで表示される', async ({ page }) => {
    await startAs(page, USERS.member1)
    await goto(page, 'my-deals')
    const row = page.locator('table.data.stackable tbody tr').first()
    await expect(row).toBeVisible()
    const box = await row.boundingBox()
    const width = page.viewportSize()?.width ?? 0
    expect(box?.width ?? 0).toBeLessThanOrEqual(width)
    await expectNoHorizontalOverflow(page)
  })

  test('案件詳細は基本情報→保護情報の順に縦に並ぶ(§9.2)', async ({ page }) => {
    await startAs(page, USERS.member1)
    await goto(page, 'deal/DL-2026-0001')
    const basic = await page.locator('.card', { hasText: '基本情報' }).first().boundingBox()
    const protection = await page.locator('.card', { hasText: '保護情報' }).first().boundingBox()
    expect(basic).not.toBeNull()
    expect(protection).not.toBeNull()
    expect((protection?.y ?? 0)).toBeGreaterThan(basic?.y ?? 0)
  })

  test('主要な操作ボタンが画面内に収まっている', async ({ page }) => {
    await startAs(page, USERS.member1)
    await goto(page, 'deal-new')
    const width = page.viewportSize()?.width ?? 0
    for (const id of ['dl-submit', 'dl-companyName', 'dl-phone', 'dl-website']) {
      const box = await page.getByTestId(id).boundingBox()
      expect(box, id).not.toBeNull()
      expect((box?.x ?? 0) + (box?.width ?? 0), id).toBeLessThanOrEqual(width + 1)
      expect(box?.x ?? 0, id).toBeGreaterThanOrEqual(-1)
    }
  })

  test('入力欄が重ならない', async ({ page }) => {
    await startAs(page, USERS.member1)
    await goto(page, 'eligibility')
    const boxes = await page.locator('.card input.input').evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect()).map((r) => ({ top: r.top, bottom: r.bottom })),
    )
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i]!.top).toBeGreaterThanOrEqual(boxes[i - 1]!.bottom - 1)
    }
  })

  test('モーダルも画面内に収まる', async ({ page }) => {
    await startAs(page, USERS.member1)
    await goto(page, 'inquiries')
    await page.getByTestId('inq-new').click()
    await expect(page.locator('.modal')).toBeVisible()
    await expectNoHorizontalOverflow(page)
    const box = await page.locator('.modal').boundingBox()
    const width = page.viewportSize()?.width ?? 0
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width + 1)
  })
})
