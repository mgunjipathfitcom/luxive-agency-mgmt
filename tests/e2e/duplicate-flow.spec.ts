import { expect, test } from '@playwright/test'
import { USERS, goto, startAs } from './helpers'

test.describe('§21.1 重複・簡易照会', () => {
  test.beforeEach(async ({ page }) => {
    await startAs(page, USERS.member1)
  })

  test('簡易照会は企業名だけで実行でき、電話番号に必須マークがない', async ({ page }) => {
    await goto(page, 'eligibility')

    const phoneLabel = page.locator('label', { has: page.getByTestId('el-phone') })
    await expect(phoneLabel.locator('.req')).toHaveCount(0)
    await expect(phoneLabel.locator('.opt')).toHaveCount(1)

    await page.getByTestId('el-companyName').fill('東都ホテル')
    await page.getByTestId('el-submit').click()
    await expect(page.getByTestId('el-result')).toBeVisible()
  })

  test('東都ホテル(電話・Web空欄)は重複の可能性ありになる', async ({ page }) => {
    await goto(page, 'eligibility')
    await page.getByTestId('el-companyName').fill('東都ホテル')
    await page.getByTestId('el-submit').click()
    await expect(page.getByTestId('el-result')).toContainText('重複の可能性あり')
    await expect(page.getByTestId('el-result')).toContainText('企業名が既存の登録と完全に一致')
    // clearでないので「営業予定登録へ進む」は出さない(§5.1)
    await expect(page.getByTestId('el-proceed')).toHaveCount(0)
  })

  test('Reserved企業は営業不可、有効受注企業も営業不可', async ({ page }) => {
    await goto(page, 'eligibility')
    await page.getByTestId('el-companyName').fill('株式会社グランドオーシャンホテルズ')
    await page.getByTestId('el-submit').click()
    await expect(page.getByTestId('el-result')).toContainText('Reserved案件:営業不可')

    await page.getByTestId('el-companyName').fill('株式会社ベイサイドリゾート')
    await page.getByTestId('el-submit').click()
    await expect(page.getByTestId('el-result')).toContainText('受注案件:営業不可')
  })

  test('保護期限切れの企業名一致は重複の可能性ありになる', async ({ page }) => {
    await goto(page, 'eligibility')
    await page.getByTestId('el-companyName').fill('桜井メディカルクリニック')
    await page.getByTestId('el-submit').click()
    await expect(page.getByTestId('el-result')).toContainText('重複の可能性あり')

    // 期限切れの受注案件も、営業不可ではなく重複審査へ
    await page.getByTestId('el-companyName').fill('株式会社ノースウィング')
    await page.getByTestId('el-submit').click()
    await expect(page.getByTestId('el-result')).toContainText('重複の可能性あり')
    await expect(page.getByTestId('el-result')).not.toContainText('受注案件:営業不可')
  })

  test('4項目を営業予定登録へ引き継ぎ、そこでは電話番号とWebサイトが必須になる', async ({ page }) => {
    await goto(page, 'eligibility')
    await page.getByTestId('el-companyName').fill('株式会社ミドリ湯')
    await page.getByTestId('el-facilityName').fill('平塚本店')
    await page.getByTestId('el-phone').fill('0463-77-1234')
    await page.getByTestId('el-website').fill('https://www.midoriyu.example.jp/about/')
    await page.getByTestId('el-submit').click()
    await expect(page.getByTestId('el-result')).toContainText('重複なし')

    await page.getByTestId('el-proceed').click()
    await expect(page).toHaveURL(/#\/deal-new/)

    await expect(page.getByTestId('dl-companyName')).toHaveValue('株式会社ミドリ湯')
    await expect(page.getByTestId('dl-facilityName')).toHaveValue('平塚本店')
    await expect(page.getByTestId('dl-phone')).toHaveValue('0463-77-1234')
    await expect(page.getByTestId('dl-website')).toHaveValue('https://www.midoriyu.example.jp/about/')

    const phoneLabel = page.locator('label', { has: page.getByTestId('dl-phone') })
    await expect(phoneLabel.locator('.req')).toHaveCount(1)
    const siteLabel = page.locator('label', { has: page.getByTestId('dl-website') })
    await expect(siteLabel.locator('.req')).toHaveCount(1)
    // 「Webサイトなし」は表示しない(§6.2)
    await expect(page.getByText('Webサイトなし')).toHaveCount(0)
  })

  test('引継ぎ後に企業名を編集すると、その値で再判定される', async ({ page }) => {
    await goto(page, 'eligibility')
    await page.getByTestId('el-companyName').fill('株式会社ミドリ湯')
    await page.getByTestId('el-phone').fill('0463-77-1234')
    await page.getByTestId('el-website').fill('https://midoriyu.example.jp')
    await page.getByTestId('el-submit').click()
    await page.getByTestId('el-proceed').click()

    // 照会ではclearだったが、編集後は既存企業と完全一致する
    await page.getByTestId('dl-companyName').fill('東都ホテル')
    await page.getByTestId('dl-contactPersonName').fill('総務部 岩瀬様')
    await page.getByTestId('dl-submit').click()

    await expect(page).toHaveURL(/#\/deal-done/)
    await expect(page.getByTestId('done-judgement')).toContainText('重複の可能性あり')
    await expect(page.getByText('本部の重複審査に入りました')).toBeVisible()
  })

  test('登録するとsessionStorageの引継ぎデータが消える(§5.3)', async ({ page }) => {
    await goto(page, 'eligibility')
    await page.getByTestId('el-companyName').fill('株式会社ミドリ湯')
    await page.getByTestId('el-phone').fill('0463-77-1234')
    await page.getByTestId('el-website').fill('https://midoriyu.example.jp')
    await page.getByTestId('el-submit').click()
    await page.getByTestId('el-proceed').click()

    expect(await page.evaluate(() => sessionStorage.getItem('luxive.eligibilityDraft'))).not.toBeNull()

    await page.getByTestId('dl-contactPersonName').fill('総務課 山根様')
    await page.getByTestId('dl-submit').click()
    await expect(page).toHaveURL(/#\/deal-done/)

    expect(await page.evaluate(() => sessionStorage.getItem('luxive.eligibilityDraft'))).toBeNull()

    // 次の営業予定登録に前回の値が残らない
    await page.getByTestId('done-again').click()
    await expect(page.getByTestId('dl-companyName')).toHaveValue('')
    await expect(page.getByTestId('dl-phone')).toHaveValue('')
  })

  test('clearの登録は自動承認され、保護期限30日が付く', async ({ page }) => {
    await goto(page, 'deal-new')
    await page.getByTestId('dl-companyName').fill('株式会社アオバ湯治場')
    await page.getByTestId('dl-phone').fill('0555-22-3344')
    await page.getByTestId('dl-website').fill('https://aoba-toji.example.jp')
    await page.getByTestId('dl-contactPersonName').fill('支配人 青葉様')
    await page.getByTestId('dl-submit').click()

    await expect(page).toHaveURL(/#\/deal-done/)
    await expect(page.getByTestId('done-judgement')).toContainText('重複なし')
    await expect(page.getByText('保護期間が設定されました')).toBeVisible()

    const expires = await page.getByTestId('done-expires').innerText()
    const expected = await page.evaluate(() => {
      const d = new Date()
      d.setDate(d.getDate() + 30)
      const p = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`
    })
    expect(expires).toBe(expected)
  })

  test('必須項目が空だと登録できない', async ({ page }) => {
    await goto(page, 'deal-new')
    await page.getByTestId('dl-companyName').fill('株式会社テスト')
    await page.getByTestId('dl-submit').click()
    await expect(page).toHaveURL(/#\/deal-new/)
    await expect(page.getByText('電話番号を入力してください')).toBeVisible()
    await expect(page.getByText('Webサイトを入力してください')).toBeVisible()
    await expect(page.getByText('担当者を入力してください')).toBeVisible()
  })

  test('不正なWebサイトは登録できない', async ({ page }) => {
    await goto(page, 'deal-new')
    await page.getByTestId('dl-companyName').fill('株式会社テスト')
    await page.getByTestId('dl-phone').fill('03-1111-2222')
    await page.getByTestId('dl-website').fill('intranet')
    await page.getByTestId('dl-contactPersonName').fill('担当者')
    await page.getByTestId('dl-submit').click()
    await expect(page.getByText('URLの形式が正しくありません(例: example.co.jp)')).toBeVisible()
  })

  test('Reserved企業は営業予定登録でも案件にならない', async ({ page }) => {
    await goto(page, 'deal-new')
    await page.getByTestId('dl-companyName').fill('株式会社グランドオーシャンホテルズ')
    await page.getByTestId('dl-phone').fill('03-5555-2100')
    await page.getByTestId('dl-website').fill('https://www.grand-ocean.example.jp')
    await page.getByTestId('dl-contactPersonName').fill('総務部')
    await page.getByTestId('dl-submit').click()

    await expect(page).toHaveURL(/#\/deal-new/)
    await expect(page.getByText('Reserved案件:営業不可')).toBeVisible()

    const created = await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('luxive.db') ?? '{}')
      return (db.deals ?? []).filter((d: { companyName: string }) =>
        d.companyName.includes('グランドオーシャン'),
      ).length
    })
    expect(created).toBe(0)

    // 判定履歴と監査ログは残る(§6.3)
    const logged = await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('luxive.db') ?? '{}')
      const app = (db.applications ?? []).some(
        (a: { input: { companyName: string }; judgement: string }) =>
          a.input.companyName.includes('グランドオーシャン') && a.judgement === 'reserved',
      )
      const audit = (db.audits ?? []).some((a: { detail: string }) => a.detail.includes('グランドオーシャン'))
      return { app, audit }
    })
    expect(logged.app).toBe(true)
    expect(logged.audit).toBe(true)
  })
})

test.describe('旧設定でも企業名の完全一致は重複審査へ', () => {
  test('company weight 40 / threshold 50 に変えても similar のまま(§4.4)', async ({ page }) => {
    await startAs(page, USERS.hq)
    await goto(page, 'settings')
    await page.getByTestId('settings-weightCompanyName').fill('40')
    await page.getByTestId('settings-duplicateThreshold').fill('50')
    await page.getByTestId('settings-contact-exact').uncheck()
    await page.getByTestId('settings-save').click()
    await expect(page.getByText('基本設定を保存しました')).toBeVisible()

    await page.getByTestId('logout').click()
    await page.getByTestId(`login-${USERS.member1}`).click()
    await goto(page, 'eligibility')
    await page.getByTestId('el-companyName').fill('東都ホテル')
    await page.getByTestId('el-submit').click()
    await expect(page.getByTestId('el-result')).toContainText('重複の可能性あり')
  })
})
