import { expect, test } from '@playwright/test'
import { USERS, goto, startAs, switchUser } from './helpers'

/** 西野 真紀(U-A2-M1)が申請した東都ホテル大阪別館の審査 */
const REVIEW_ROW = 'review-row-RV-0021'
const DEAL_ID = 'DL-2026-0021'

test.describe('§21.3 審査・通知', () => {
  test('重複審査へ入るのは similar だけ', async ({ page }) => {
    await startAs(page, USERS.hq)
    await goto(page, 'review')
    const state = await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('luxive.db') ?? '{}')
      const deals: Record<string, { judgement: string }> = Object.fromEntries(
        (db.deals ?? []).map((d: { id: string; judgement: string }) => [d.id, d]),
      )
      return (db.reviews ?? []).map((r: { dealId: string }) => deals[r.dealId]?.judgement)
    })
    expect(state.length).toBeGreaterThan(0)
    // すべて similar であること。reserved / ordered は審査キューへ入れない(§4.2 / §6.3)
    expect(state).toEqual(state.map(() => 'similar'))
    expect(state).not.toContain('reserved')
    expect(state).not.toContain('ordered')
    expect(state).not.toContain('clear')
    expect(state).not.toContain(undefined)

    // 未処理タブに出るのは pending のものだけ
    const pending = await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('luxive.db') ?? '{}')
      return (db.reviews ?? []).filter((r: { state: string }) => r.state === 'pending').length
    })
    await expect(page.getByTestId('review-tab-pending')).toContainText(`未処理(${pending})`)
  })

  test('比較画面に既存と今回の情報が並び、一致項目が強調される', async ({ page }) => {
    await startAs(page, USERS.hq)
    await goto(page, 'review')
    await page.getByTestId(REVIEW_ROW).click()
    const block = page.getByTestId('compare-block').first()
    await expect(block.getByText('既に登録されている情報')).toBeVisible()
    await expect(block.getByText('今回新しく登録された情報')).toBeVisible()
    await expect(block.locator('.compare__v--hit').first()).toBeVisible()
    await expect(block.getByText('有効保護中')).toBeVisible()

    // 正規化値は主要項目ではなく「判定の詳細」に入れる(§14.2)
    await expect(block.getByText('判定の詳細(正規化した値)')).toBeVisible()
  })

  test('承認はメッセージなしで実行でき、営業不可と差し戻しは必須', async ({ page }) => {
    await startAs(page, USERS.hq)
    await goto(page, 'review')
    await page.getByTestId(REVIEW_ROW).click()

    // 営業不可: メッセージなしでは進めない
    await page.getByTestId('review-block').click()
    await page.getByTestId('review-confirm').click()
    await expect(page.getByText('この操作にはメッセージが必要です')).toBeVisible()
    await page.locator('.modal__close').click()

    // 差し戻し: メッセージなしでは進めない
    await page.getByTestId('review-return').click()
    await page.getByTestId('review-confirm').click()
    await expect(page.getByText('この操作にはメッセージが必要です')).toBeVisible()
    await page.locator('.modal__close').click()

    // 承認: メッセージなしで実行できる
    await page.getByTestId('review-approve').click()
    await page.getByTestId('review-confirm').click()
    await expect(page.getByText('審査結果を登録し、申請者本人へ通知しました')).toBeVisible()
  })

  test('審査結果は申請した本人だけに通知され、同僚や既存担当者には届かない', async ({ page }) => {
    await startAs(page, USERS.hq)
    await goto(page, 'review')
    await page.getByTestId(REVIEW_ROW).click()
    await page.getByTestId('review-return').click()
    await page.getByTestId('review-message').fill('先方の担当部署名を追記して再申請してください。')
    await page.getByTestId('review-confirm').click()
    await expect(page.getByText('審査結果を登録し、申請者本人へ通知しました')).toBeVisible()

    // 申請者本人(西野 真紀)には届く
    await switchUser(page, USERS.member2)
    await goto(page, 'notifications')
    await expect(page.getByTestId('notif-list')).toContainText('重複審査の結果:差し戻し')
    await expect(page.getByTestId('notif-list')).toContainText('先方の担当部署名を追記して再申請してください。')

    // 同じ代理店の管理者には届かない
    await switchUser(page, USERS.admin2)
    await goto(page, 'notifications')
    await expect(page.getByText('先方の担当部署名を追記して再申請してください。')).toHaveCount(0)

    // 既存案件の担当者(遠藤 千尋)にも届かない
    await switchUser(page, USERS.member1)
    await goto(page, 'notifications')
    await expect(page.getByText('先方の担当部署名を追記して再申請してください。')).toHaveCount(0)
  })

  test('申請者には既存案件の機密情報を見せない(§15.3)', async ({ page }) => {
    await startAs(page, USERS.member2)
    await goto(page, 'eligibility')
    await page.getByTestId('el-companyName').fill('東都ホテル')
    await page.getByTestId('el-submit').click()

    const candidate = page.getByTestId('candidate').first()
    await expect(candidate).toBeVisible()
    // 既存案件の代理店名・担当者名・金額は出さない
    await expect(candidate).not.toContainText('株式会社リンクスプロモーション')
    await expect(candidate).not.toContainText('遠藤 千尋')
    await expect(candidate).not.toContainText('円')
    await expect(candidate).toContainText('詳しい内容は本部が確認します')
  })

  test('再読み込みしても審査・通知・履歴が残る', async ({ page }) => {
    await startAs(page, USERS.hq)
    await goto(page, 'review')
    await page.getByTestId(REVIEW_ROW).click()
    await page.getByTestId('review-block').click()
    await page.getByTestId('review-message').fill('本部直販のため営業できません。')
    await page.getByTestId('review-confirm').click()
    await expect(page.getByText('審査結果を登録し、申請者本人へ通知しました')).toBeVisible()

    await page.reload()
    await goto(page, 'review')
    await page.getByTestId('review-tab-done').click()
    await expect(page.getByTestId(REVIEW_ROW)).toContainText('営業不可')

    await goto(page, `deal/${DEAL_ID}`)
    await expect(page.getByText('営業不可と判定されています')).toBeVisible()
    await expect(page.getByText('本部直販のため営業できません。').first()).toBeVisible()

    await switchUser(page, USERS.member2)
    await page.reload()
    await goto(page, 'notifications')
    await expect(page.getByTestId('notif-list')).toContainText('重複審査の結果:営業不可')
    await page.getByTestId('notif-tab-applications').click()
    await expect(page.getByTestId('app-row-AP-0021')).toContainText('本部直販のため営業できません。')
  })

  test('営業不可にした案件は次の重複判定の候補から外れる', async ({ page }) => {
    await startAs(page, USERS.hq)
    await goto(page, 'review')
    await page.getByTestId('review-row-RV-0023').click()
    await page.getByTestId('review-block').click()
    await page.getByTestId('review-message').fill('既存代理店の保護期間中のため営業できません。')
    await page.getByTestId('review-confirm').click()

    await switchUser(page, 'U-A4-M2')
    await goto(page, 'notifications')
    await expect(page.getByTestId('notif-list')).toContainText('重複審査の結果:営業不可')
  })
})

test.describe('§14.4 審査履歴と監査ログ', () => {
  test('審査すると案件・申請履歴・通知・監査ログがそろって更新される', async ({ page }) => {
    await startAs(page, USERS.hq)
    await goto(page, 'review')
    await page.getByTestId(REVIEW_ROW).click()
    await page.getByTestId('review-approve').click()
    await page.getByTestId('review-message').fill('別施設のため重複にあたりません。')
    await page.getByTestId('review-confirm').click()
    await expect(page.getByText('審査結果を登録し、申請者本人へ通知しました')).toBeVisible()

    const snapshot = await page.evaluate((dealId) => {
      const db = JSON.parse(localStorage.getItem('luxive.db') ?? '{}')
      const deal = (db.deals ?? []).find((d: { id: string }) => d.id === dealId)
      const review = (db.reviews ?? []).find((r: { dealId: string }) => r.dealId === dealId)
      const app = (db.applications ?? []).find((a: { dealId: string }) => a.dealId === dealId)
      const notif = (db.notifications ?? []).find((n: { dealId: string }) => n.dealId === dealId)
      const audit = (db.audits ?? []).find(
        (a: { targetId: string; action: string }) => a.targetId === dealId && a.action.startsWith('重複審査'),
      )
      return {
        dealState: deal?.reviewState,
        reviewState: review?.state,
        appState: app?.reviewState,
        notifResult: notif?.result,
        notifRecipient: notif?.recipientUserId,
        auditAction: audit?.action,
      }
    }, DEAL_ID)

    expect(snapshot.dealState).toBe('approved')
    expect(snapshot.reviewState).toBe('approved')
    expect(snapshot.appState).toBe('approved')
    expect(snapshot.notifResult).toBe('approve')
    expect(snapshot.notifRecipient).toBe(USERS.member2)
    expect(snapshot.auditAction).toBe('重複審査:承認')

    await goto(page, 'audit')
    await expect(page.getByText('重複審査:承認').first()).toBeVisible()
  })
})
