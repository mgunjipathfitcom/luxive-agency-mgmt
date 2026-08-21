import { expect, test } from '@playwright/test'
import { USERS, goto, startAs, switchUser } from './helpers'

const SUSPENDED = 'クラシック ポプリ'

test.describe('レビュー指摘の回帰(画面)', () => {
  test('停止中の商品は表示だけ残り、新規入力はできない(§7.2)', async ({ page }) => {
    await startAs(page, 'U-A3-M1')
    await goto(page, 'deal/DL-2026-0004')

    const row = page.locator('tr', { hasText: SUSPENDED }).first()
    await expect(row).toBeVisible()
    await expect(row.getByText('停止中')).toBeVisible()
    // 入力要素は出さない(過去の金額は文字として残る)
    await expect(row.locator('input')).toHaveCount(0)
    await expect(row).toContainText('円')

    // 販売中の商品は入力できる
    const activeRow = page.locator('tr', { hasText: 'セレスト アロマオイル' }).first()
    await expect(activeRow.locator('input')).not.toHaveCount(0)
  })

  test('停止中の商品の金額は保存しても消えない', async ({ page }) => {
    await startAs(page, 'U-A3-M1')
    await goto(page, 'deal/DL-2026-0004')

    // 停止中の行は 60,000円 の見積が入っている(初期データ)
    const suspendedRow = page.locator('tr', { hasText: SUSPENDED }).first()
    await expect(suspendedRow).toContainText('60,000円')
    await expect(page.getByTestId('am-quote-total')).toHaveText('300,000円')

    await page.getByTestId('am-quote-セレスト アロマオイル').fill('50000')
    await page.getByTestId('am-save').click()
    await expect(page.getByText('提案・見積・受注情報を保存しました')).toBeVisible()

    await page.reload()
    // 停止中の金額はそのまま。合計は 300,000 + 50,000 = 350,000円
    await expect(page.locator('tr', { hasText: SUSPENDED }).first()).toContainText('60,000円')
    await expect(page.getByTestId('am-quote-total')).toHaveText('350,000円')
  })

  test('既存の受注日が受注日入力の初期値になる(§10.5)', async ({ page }) => {
    await startAs(page, USERS.admin1)
    await goto(page, 'deal/DL-2026-0002')
    const orderDate = await page.getByTestId('am-order-date').inputValue()
    const stored = await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('luxive.db') ?? '{}')
      const d = (db.deals ?? []).find((x: { id: string }) => x.id === 'DL-2026-0002')
      return d.orders.find((o: { kind: string }) => o.kind === 'initial').orderDate
    })
    expect(orderDate).toBe(stored)

    // そのまま保存しても保護期限が動かない
    const expires = await page.getByTestId('protection-expires').innerText()
    await page.getByTestId('am-save').click()
    await expect(page.getByText('提案・見積・受注情報を保存しました')).toBeVisible()
    await expect(page.getByTestId('protection-expires')).toHaveText(expires)
  })

  test('追加受注の受注日を空にすると登録できない(§13.1)', async ({ page }) => {
    await startAs(page, USERS.admin1)
    await goto(page, 'deal/DL-2026-0002')
    await page.getByTestId('am-add-open').click()
    await page.getByTestId('add-date').fill('')
    await page.getByTestId('add-amount-セレスト アロマオイル').fill('50000')
    await page.getByTestId('add-submit').click()
    await expect(page.getByText('受注日を入力してください')).toBeVisible()
    await expect(page.locator('.modal')).toBeVisible()
  })

  test('申請履歴では重複判定と審査結果を分けて表示する(§15.3)', async ({ page }) => {
    await startAs(page, USERS.hq)
    await goto(page, 'review')
    await page.getByTestId('review-row-RV-0021').click()
    await page.getByTestId('review-approve').click()
    await page.getByTestId('review-message').fill('別施設のため重複にあたりません。')
    await page.getByTestId('review-confirm').click()
    await expect(page.getByText('審査結果を登録し、申請者本人へ通知しました')).toBeVisible()

    await switchUser(page, USERS.member2)
    await goto(page, 'notifications')
    await page.getByTestId('notif-tab-applications').click()
    const row = page.getByTestId('app-row-AP-0021')

    // 「重複判定」と「審査結果」は別々のセルに出す(同じセルに両方出す旧バグを弾く)
    const judgeCell = row.locator('td[data-label="重複判定"]')
    const resultCell = row.locator('td[data-label="審査結果"]')
    await expect(judgeCell).toContainText('重複の可能性あり')
    await expect(judgeCell).not.toContainText('承認済み')
    await expect(resultCell).toContainText('承認済み')
    await expect(resultCell).not.toContainText('重複の可能性あり')
    await expect(row.locator('td[data-label="本部メッセージ"]')).toContainText(
      '別施設のため重複にあたりません。',
    )
  })
})
