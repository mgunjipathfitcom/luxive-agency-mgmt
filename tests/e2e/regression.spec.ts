import { expect, test } from '@playwright/test'
import { USERS, collectConsoleErrors, goto, startAs, switchUser } from './helpers'

test.describe('§21.4 既存機能の回帰', () => {
  test('案件進捗・営業活動の3パターンが保存でき、保護期限が更新される', async ({ page }) => {
    await startAs(page, USERS.member1)
    await goto(page, 'deal/DL-2026-0020')

    const expiresBefore = await page.getByTestId('protection-expires').innerText()

    // 営業活動のみ
    await page.getByTestId('ac-body').fill('先方の休憩室を下見。担当者は前向き。')
    await page.getByTestId('ac-save').click()
    await expect(page.getByText('案件進捗・営業活動を保存しました')).toBeVisible()
    await expect(page.getByTestId('protection-expires')).toHaveText(expiresBefore)

    // ステータス変更のみ
    await page.getByTestId('ac-status').selectOption('meeting')
    await page.getByTestId('ac-save').click()
    await expect(page.getByTestId('protection-expires')).not.toHaveText(expiresBefore)
    const expiresAfterMeeting = await page.getByTestId('protection-expires').innerText()

    // 同時保存
    await page.getByTestId('ac-status').selectOption('quoted')
    await page.getByTestId('ac-body').fill('見積を提出した。')
    await page.getByTestId('ac-save').click()
    await expect(page.getByText('商談 → 見積提出')).toBeVisible()

    // 見積提出(90日)は商談(90日)より短くならない
    const expiresAfterQuote = await page.getByTestId('protection-expires').innerText()
    expect(expiresAfterQuote >= expiresAfterMeeting).toBe(true)

    // 初期データの1件に加えて3件たまる
    await expect(page.locator('.tl-item')).toHaveCount(4)
  })

  test('見積を入れると見積提出になり、受注を入れると受注確定で365日になる', async ({ page }) => {
    await startAs(page, USERS.member1)
    await goto(page, 'deal/DL-2026-0020')

    await page.getByTestId('am-quote-ノワール ハンドソープ').fill('180000')
    await expect(page.getByTestId('am-quote-total')).toContainText('180,000円')
    await page.getByTestId('am-save').click()
    await expect(page.getByText('提案・見積・受注情報を保存しました')).toBeVisible()
    await expect(page.locator('.page-head__actions')).toContainText('見積提出')

    await page.getByTestId('am-order-ノワール ハンドソープ').fill('180000')
    await page.getByTestId('am-save').click()
    await expect(page.locator('.page-head__actions')).toContainText('受注確定')

    const expected = await page.evaluate(() => {
      const d = new Date()
      d.setDate(d.getDate() + 365)
      const p = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`
    })
    await expect(page.getByTestId('protection-expires')).toHaveText(expected)
  })

  test('金額入力は空欄と0円を区別し、負数と文字を拒否する', async ({ page }) => {
    await startAs(page, USERS.member1)
    await goto(page, 'deal/DL-2026-0020')

    await page.getByTestId('am-quote-ノワール ハンドソープ').fill('-100')
    await page.getByTestId('am-save').click()
    await expect(page.getByText('マイナスは入力できません')).toBeVisible()

    await page.getByTestId('am-quote-ノワール ハンドソープ').fill('abc')
    await page.getByTestId('am-save').click()
    await expect(page.getByText('半角数字で入力してください')).toBeVisible()

    await page.getByTestId('am-quote-ノワール ハンドソープ').fill('0')
    await page.getByTestId('am-save').click()
    await expect(page.getByText('提案・見積・受注情報を保存しました')).toBeVisible()
    await expect(page.getByTestId('am-quote-total')).toContainText('0円')
  })

  test('追加受注は初回受注を上書きせず、保護期限を受注日から365日にする', async ({ page }) => {
    await startAs(page, USERS.admin1)
    await goto(page, 'deal/DL-2026-0002')
    const totalBefore = await page.getByTestId('am-total-orders').innerText()

    await page.getByTestId('am-add-open').click()
    await page.getByTestId('add-amount-セレスト アロマオイル').fill('108000')
    await page.getByTestId('add-submit').click()
    await expect(page.getByText('追加受注を登録しました')).toBeVisible()

    await expect(page.getByTestId('am-total-orders')).not.toHaveText(totalBefore)

    await page.getByTestId('am-history-toggle').click()
    await expect(page.getByText('初回受注').first()).toBeVisible()
    await expect(page.getByText('追加受注').first()).toBeVisible()

    const expected = await page.evaluate(() => {
      const d = new Date()
      d.setDate(d.getDate() + 365)
      const p = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`
    })
    await expect(page.getByTestId('protection-expires')).toHaveText(expected)
  })

  test('ロール権限: 本部だけの画面はhash直接入力でも拒否する(§2.4)', async ({ page }) => {
    await startAs(page, USERS.member1)
    for (const p of ['review', 'settings', 'reserved', 'products', 'agencies', 'audit', 'companies']) {
      await goto(page, p)
      await expect(page.getByText('権限がありません'), p).toBeVisible()
    }
    // 戻る操作でも迂回できない
    await page.goBack()
    await expect(page.getByText('権限がありません')).toBeVisible()
  })

  test('ロール権限: 他代理店の案件は案件IDを直接入れても開けない', async ({ page }) => {
    await startAs(page, USERS.member1)
    await goto(page, 'deal/DL-2026-0007') // AG-02 の案件
    await expect(page.getByText('この案件は閲覧できません')).toBeVisible()
  })

  test('ロール権限: 自社の他担当者案件は閲覧専用', async ({ page }) => {
    await startAs(page, USERS.member1)
    await goto(page, 'deal/DL-2026-0005') // 同じAG-01だが担当は若林
    await expect(page.getByText('閲覧専用です')).toBeVisible()
    await expect(page.getByTestId('basic-edit')).toHaveCount(0)
    await expect(page.getByTestId('ac-save')).toHaveCount(0)
    await expect(page.getByTestId('am-save')).toHaveCount(0)
  })

  test('§9.3 代理店では所属代理店・案件ID・登録者を出さない', async ({ page }) => {
    await startAs(page, USERS.hq)
    await goto(page, 'deal/DL-2026-0001')
    await expect(page.getByTestId('basic-agency')).toBeVisible()
    await expect(page.getByTestId('basic-dealid')).toBeVisible()
    await expect(page.getByTestId('basic-creator')).toBeVisible()

    await switchUser(page, USERS.member1)
    await goto(page, 'deal/DL-2026-0001')
    await expect(page.getByTestId('basic-agency')).toHaveCount(0)
    await expect(page.getByTestId('basic-dealid')).toHaveCount(0)
    await expect(page.getByTestId('basic-creator')).toHaveCount(0)
  })

  test('ダッシュボード: カードの件数と内訳一覧の行数が一致する', async ({ page }) => {
    await startAs(page, USERS.hq)
    await goto(page, 'dashboard')
    await page.getByTestId('period-all').click()

    await page.getByTestId('stat-expiringSoon').click()
    const cardValue = Number((await page.getByTestId('stat-expiringSoon').innerText()).match(/(\d+)\s*件/)?.[1])
    const rows = await page.locator('.card', { hasText: '保護期限間近の内訳' }).locator('tbody tr').count()
    expect(rows).toBe(cardValue)

    await page.getByTestId('stat-meetings').click()
    const meetings = Number((await page.getByTestId('stat-meetings').innerText()).match(/(\d+)\s*件/)?.[1])
    const meetingRows = await page.locator('.card', { hasText: '商談数の内訳' }).locator('tbody tr').count()
    expect(meetingRows).toBe(meetings)
  })

  test('ダッシュボード: 集計範囲がロールで変わる', async ({ page }) => {
    await startAs(page, USERS.hq)
    await goto(page, 'dashboard')
    await expect(page.getByText('集計範囲: 全代理店')).toBeVisible()

    await switchUser(page, USERS.admin1)
    await expect(page.getByText('集計範囲: 自社全体')).toBeVisible()

    await switchUser(page, USERS.member1)
    await expect(page.getByText('集計範囲: 自分の担当案件')).toBeVisible()
  })

  test('§10.7 基本設定の変更を既存案件へ反映できる', async ({ page }) => {
    await startAs(page, USERS.hq)
    await goto(page, 'deal/DL-2026-0020')
    const before = await page.getByTestId('protection-expires').innerText()

    await goto(page, 'settings')
    await page.getByTestId('settings-plannedDays').fill('60')
    await page.getByTestId('settings-apply-yes').check()
    await page.getByTestId('settings-save').click()
    await expect(page.getByText('既存案件へ反映しました')).toBeVisible()

    await goto(page, 'deal/DL-2026-0020')
    await expect(page.getByTestId('protection-expires')).not.toHaveText(before)
    await expect(page.getByText('保護期限(基本設定の反映)')).toBeVisible()
  })

  test('§17 代理店管理者は担当案件を引き継げる', async ({ page }) => {
    await startAs(page, USERS.admin4)
    await goto(page, 'agency-users')
    await page.getByTestId('user-handover-U-A4-M1').click()
    await page.getByTestId('handover-to').selectOption('U-A4-M2')
    await page.getByTestId('handover-all').click()
    await expect(page.getByText(/件の案件を引継ぎました/)).toBeVisible()
    await expect(page.locator('.card', { hasText: '引継ぎ履歴' })).toContainText('宮下 沙也加')

    await goto(page, 'deal/DL-2026-0027')
    await expect(page.locator('.card', { hasText: '変更履歴' })).toContainText('担当営業(引継ぎ)')
  })

  test('§20.1 再読み込みしても入力した内容が残る', async ({ page }) => {
    await startAs(page, USERS.member1)
    await goto(page, 'deal/DL-2026-0020')
    await page.getByTestId('ac-body').fill('保存テスト')
    await page.getByTestId('ac-save').click()
    await expect(page.getByText('案件進捗・営業活動を保存しました')).toBeVisible()

    await page.reload()
    await expect(page.getByText('保存テスト')).toBeVisible()
  })

  test('主要画面でコンソールエラーが出ない', async ({ page }) => {
    const errors = collectConsoleErrors(page)
    await startAs(page, USERS.hq)
    for (const p of [
      'dashboard', 'deals', 'review', 'companies', 'reserved', 'products',
      'agencies', 'agency-users', 'extensions', 'inquiries', 'notifications', 'settings', 'audit',
      'deal/DL-2026-0002',
    ]) {
      await goto(page, p)
      await expect(page.locator('.content')).toBeVisible()
    }
    await switchUser(page, USERS.member1)
    for (const p of ['dashboard', 'eligibility', 'deal-new', 'my-deals', 'deals', 'notifications', 'inquiries', 'extensions', 'deal/DL-2026-0001']) {
      await goto(page, p)
      await expect(page.locator('.content')).toBeVisible()
    }
    expect(errors, `コンソールエラー: ${errors.join(' / ')}`).toEqual([])
  })
})
