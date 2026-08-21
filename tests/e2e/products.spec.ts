import { expect, test } from '@playwright/test'
import { USERS, goto, startAs, switchUser } from './helpers'

const ACTIVE = 'ルミエール ディフューザー'
const SUSPENDED = 'クラシック ポプリ'
const NEW_PRODUCT = 'オーロラ ミストスプレー'

test.describe('§21.2 商品マスター', () => {
  test('販売中の商品だけが営業予定登録に出る', async ({ page }) => {
    await startAs(page, USERS.member1)
    await goto(page, 'deal-new')
    const list = page.getByTestId('dl-products')
    await expect(list.getByText(ACTIVE, { exact: true })).toBeVisible()
    await expect(list.getByText(SUSPENDED, { exact: true })).toHaveCount(0)
    await expect(list.locator('label.checkbox')).toHaveCount(10)
  })

  test('本部が販売中商品を追加すると、登録画面と案件詳細へコード修正なしで反映される', async ({ page }) => {
    await startAs(page, USERS.hq)
    await goto(page, 'products')
    await page.getByTestId('product-new').click()
    await page.getByTestId('product-name').fill(NEW_PRODUCT)
    await page.getByTestId('product-sku').fill('LX-SP-999')
    await page.locator('.modal').getByLabel('商品分類').fill('ルームケア')
    await page.getByTestId('product-save').click()
    await expect(page.getByText('商品マスターを保存しました')).toBeVisible()
    await expect(page.getByText(NEW_PRODUCT).first()).toBeVisible()

    await switchUser(page, USERS.member1)
    await goto(page, 'deal-new')
    await expect(page.getByTestId('dl-products').getByText(NEW_PRODUCT, { exact: true })).toBeVisible()

    await goto(page, 'my-deals')
    await page.getByTestId('deal-row-DL-2026-0001').click()
    await expect(page.getByTestId('am-table')).toContainText(NEW_PRODUCT)
  })

  test('停止中にすると新規入力から消え、過去案件では表示が続く', async ({ page }) => {
    await startAs(page, USERS.member1)
    // クラシック ポプリを持つ案件(DL-2026-0004)は AG-03 のため、板垣ユーザーで確認する
    await switchUser(page, 'U-A3-M1')
    await goto(page, 'deals')
    await page.getByTestId('deal-row-DL-2026-0004').click()
    await expect(page.getByTestId('am-table')).toContainText(SUSPENDED)
    await expect(page.getByTestId('am-table').getByText('停止中')).toBeVisible()

    // 新規入力(営業予定登録)には出ない
    await goto(page, 'deal-new')
    await expect(page.getByTestId('dl-products').getByText(SUSPENDED, { exact: true })).toHaveCount(0)
  })

  test('販売中の商品を停止すると新規入力から外れ、再開すると戻る', async ({ page }) => {
    await startAs(page, USERS.hq)
    await goto(page, 'products')
    await page.getByTestId('product-toggle-PR-09').click()
    await expect(page.getByText('商品マスターを保存しました')).toBeVisible()

    await switchUser(page, USERS.member1)
    await goto(page, 'deal-new')
    await expect(page.getByTestId('dl-products').getByText('リュクス ルームスプレー', { exact: true })).toHaveCount(0)

    await switchUser(page, USERS.hq)
    await goto(page, 'products')
    await page.getByTestId('product-toggle-PR-09').click()

    await switchUser(page, USERS.member1)
    await goto(page, 'deal-new')
    await expect(page.getByTestId('dl-products').getByText('リュクス ルームスプレー', { exact: true })).toBeVisible()
  })

  test('過去の金額履歴に残った停止商品の名前は変わらない(§13.3)', async ({ page }) => {
    await startAs(page, 'U-A3-M1')
    await goto(page, 'deal/DL-2026-0004')
    await page.getByTestId('am-history-toggle').click()
    await expect(page.getByText('金額履歴(保存時点のスナップショット)')).toBeVisible()
    await expect(page.locator('.card').filter({ has: page.getByTestId('am-table') })).toContainText(SUSPENDED)
  })

  test('案件検索が商品名で動く', async ({ page }) => {
    const PRODUCT = 'メンテナンスパック(年間)'
    await startAs(page, USERS.hq)
    await goto(page, 'deals')

    // 期待する案件IDを初期データから求める(現在行・金額履歴・受注履歴のいずれか)
    const expectedIds = await page.evaluate((product) => {
      const db = JSON.parse(localStorage.getItem('luxive.db') ?? '{}')
      return (db.deals ?? [])
        .filter((d: {
          lines: { productName: string }[]
          amountHistory: { lines: { productName: string }[] }[]
          orders: { lines: { productName: string }[] }[]
        }) => {
          const names = [
            ...d.lines.map((l) => l.productName),
            ...d.amountHistory.flatMap((s) => s.lines.map((l) => l.productName)),
            ...d.orders.flatMap((o) => o.lines.map((l) => l.productName)),
          ]
          return names.includes(product)
        })
        .map((d: { id: string }) => d.id)
        .sort()
    }, PRODUCT)
    expect(expectedIds.length).toBeGreaterThan(0)

    await page.getByTestId('deals-product').selectOption(PRODUCT)
    await expect(page.getByTestId('deals-summary')).toContainText('絞り込み中')

    const shownIds = (
      await page.locator('tbody tr').evaluateAll((rows) =>
        rows.map((r) => r.getAttribute('data-testid')?.replace('deal-row-', '') ?? ''),
      )
    ).sort()
    expect(shownIds).toEqual(expectedIds)

    await page.getByTestId('deals-clear').click()
    await expect(page.getByTestId('deals-summary')).not.toContainText('絞り込み中')
  })

  test('キーワード検索でも、履歴にだけ残る商品名で見つかる(§8.2)', async ({ page }) => {
    await startAs(page, USERS.hq)
    await goto(page, 'deals')
    await page.getByTestId('deals-q').fill(SUSPENDED)
    await expect(page.getByTestId('deals-summary')).toContainText('絞り込み中')
    await expect(page.getByTestId('deal-row-DL-2026-0004')).toBeVisible()
  })

  test('追加受注は販売中の商品名を参照する', async ({ page }) => {
    await startAs(page, USERS.admin1)
    await goto(page, 'deal/DL-2026-0002')
    await page.getByTestId('am-add-open').click()
    const modal = page.locator('.modal')
    await expect(modal.getByText(ACTIVE, { exact: true })).toBeVisible()
    await expect(modal.getByText(SUSPENDED, { exact: true })).toHaveCount(0)

    await page.getByTestId(`add-amount-${ACTIVE}`).fill('55000')
    await expect(page.getByTestId('add-total')).toContainText('55,000円')
    await page.getByTestId('add-submit').click()
    await expect(page.getByText('追加受注を登録しました')).toBeVisible()
    await expect(page.getByTestId('am-total-orders')).toContainText('1,025,000円')
  })

  test('商品画像は代替画像から差し替えられる', async ({ page }) => {
    await startAs(page, USERS.hq)
    await goto(page, 'products')
    await page.getByTestId('product-edit-PR-01').click()
    const before = await page.getByTestId('product-preview').getAttribute('src')
    expect(before).toContain('data:image/svg+xml')

    const png =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    await page.getByTestId('product-image-input').setInputFiles({
      name: 'sample.png',
      mimeType: 'image/png',
      buffer: Buffer.from(png, 'base64'),
    })
    await expect(page.getByTestId('product-preview')).toHaveAttribute('src', /^data:image\/png/)
    await page.getByTestId('product-save').click()
    await expect(page.getByText('商品マスターを保存しました')).toBeVisible()
  })
})
