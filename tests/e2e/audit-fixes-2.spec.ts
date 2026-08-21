import { expect, test } from '@playwright/test'
import { USERS, goto, startAs, switchUser } from './helpers'

test.describe('2巡目レビューの回帰(画面)', () => {
  test('審査を確定しても、通知と監査ログは1件だけ増える(§14.4)', async ({ page }) => {
    await startAs(page, USERS.hq)
    await goto(page, 'review')
    await page.getByTestId('review-row-RV-0022').click()
    await page.getByTestId('review-approve').click()
    await page.getByTestId('review-confirm').click()
    await expect(page.getByText('審査結果を登録し、申請者本人へ通知しました')).toBeVisible()

    const counts = await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('luxive.db') ?? '{}')
      const dealId = 'DL-2026-0022'
      return {
        notifications: (db.notifications ?? []).filter(
          (n: { dealId: string; type: string }) => n.dealId === dealId && n.type === 'review-result',
        ).length,
        audits: (db.audits ?? []).filter(
          (a: { targetId: string; action: string }) =>
            a.targetId === dealId && a.action.startsWith('重複審査'),
        ).length,
        reviewState: (db.reviews ?? []).find((r: { dealId: string }) => r.dealId === dealId)?.state,
      }
    })
    expect(counts.notifications).toBe(1)
    expect(counts.audits).toBe(1)
    expect(counts.reviewState).toBe('approved')
  })

  test('延長申請の承認は保護期限をちょうど希望日数だけ延ばす', async ({ page }) => {
    await startAs(page, USERS.hq)
    await goto(page, 'deal/DL-2026-0013')
    const before = await page.getByTestId('protection-expires').innerText()

    await goto(page, 'extensions')
    await page.getByTestId('ext-approve-EX-001').click()
    await page.getByTestId('ext-confirm').click()
    await expect(page.getByText('延長申請を処理しました')).toBeVisible()

    await goto(page, 'deal/DL-2026-0013')
    const after = await page.getByTestId('protection-expires').innerText()
    const days = (a: string, b: string) =>
      Math.round(
        (new Date(b.replace(/\//g, '-')).getTime() - new Date(a.replace(/\//g, '-')).getTime()) / 86400000,
      )
    expect(days(before, after)).toBe(30)

    // 承認済みの申請には、もう承認ボタンが出ない
    await goto(page, 'extensions')
    await expect(page.getByTestId('ext-approve-EX-001')).toHaveCount(0)
  })

  test('受注を取り消すと保護期限とステータスが計算し直される(§13.2)', async ({ page }) => {
    await startAs(page, USERS.hq)
    await goto(page, 'deal/DL-2026-0002')

    // 取消前は追加受注が基準
    const stored = await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('luxive.db') ?? '{}')
      const d = (db.deals ?? []).find((x: { id: string }) => x.id === 'DL-2026-0002')
      const initial = d.orders.find((o: { kind: string }) => o.kind === 'initial')
      const additional = d.orders.find((o: { kind: string }) => o.kind === 'additional')
      return { initialDate: initial.orderDate, additionalDate: additional.orderDate }
    })
    const plus365 = (iso: string) => {
      const d = new Date(`${iso}T00:00:00`)
      d.setDate(d.getDate() + 365)
      const p = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`
    }
    await expect(page.getByTestId('protection-expires')).toHaveText(plus365(stored.additionalDate))

    await page.getByTestId('am-history-toggle').click()
    const additionalRow = page.locator('tr', { hasText: '追加受注' }).first()
    await additionalRow.getByRole('button', { name: '取消' }).click()
    await expect(page.getByText('受注を取消しました。集計と保護期限を計算し直します')).toBeVisible()

    // 取消後は初回受注日から365日
    await expect(page.getByTestId('protection-expires')).toHaveText(plus365(stored.initialDate))
    await expect(page.locator('.card', { hasText: '変更履歴' })).toContainText('保護期限(受注の変更)')
    await expect(page.locator('.page-head__actions')).toContainText('受注確定')

    const after = await page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('luxive.db') ?? '{}')
      const d = (db.deals ?? []).find((x: { id: string }) => x.id === 'DL-2026-0002')
      return { lastOrderDate: d.lastOrderDate, status: d.status }
    })
    expect(after.lastOrderDate).toBe(stored.initialDate)
    expect(after.status).toBe('ordered')
  })

  test('有効契約カードの内訳は企業単位で出る(§18.2 / §18.6)', async ({ page }) => {
    await startAs(page, USERS.hq)
    await goto(page, 'dashboard')
    await page.getByTestId('period-all').click()
    await page.getByTestId('stat-activeOrderCompanies').click()

    const cardValue = Number(
      (await page.getByTestId('stat-activeOrderCompanies').innerText()).match(/(\d+)\s*社/)?.[1],
    )
    const rows = await page.getByTestId('company-breakdown').locator('tbody tr').count()
    expect(rows).toBe(cardValue)
  })

  test('企業詳細に受注履歴と重複判定の履歴が出る(§16.2)', async ({ page }) => {
    await startAs(page, USERS.hq)
    await goto(page, 'companies')
    await page.getByTestId('companies-q').fill('ベイサイド')
    await page.locator('tbody tr').first().click()

    const modal = page.locator('.modal')
    await expect(modal.getByText('初回・追加受注の履歴')).toBeVisible()
    await expect(page.getByTestId('company-orders')).toContainText('初回受注')
    await expect(page.getByTestId('company-orders')).toContainText('追加受注')
    await expect(modal.getByText('重複判定・審査の履歴')).toBeVisible()
    await expect(page.getByTestId('company-judgements')).toBeVisible()
  })

  test('追加受注が最新なら「いまの起点」に追加受注と表示する(§13.2)', async ({ page }) => {
    await startAs(page, USERS.hq)
    await goto(page, 'deal/DL-2026-0002')
    await expect(page.getByTestId('protection-basis')).toContainText('追加受注')

    // 初回受注だけの案件は受注確定と表示する(AG-02の案件なので本部で確認)
    await goto(page, 'deal/DL-2026-0007')
    await expect(page.getByTestId('protection-basis')).toContainText('受注確定')
  })

  test('保存形式が変わっても、元のデータを退避してから作り直す(§20.1)', async ({ page }) => {
    await startAs(page, USERS.hq)
    // 既にバックアップがある状態を作る
    await page.evaluate(() => {
      localStorage.setItem('luxive.db.backup.v1', JSON.stringify({ schemaVersion: 1, marker: 'first' }))
      const db = JSON.parse(localStorage.getItem('luxive.db') ?? '{}')
      db.schemaVersion = 1
      db.marker = 'second'
      localStorage.setItem('luxive.db', JSON.stringify(db))
    })

    await page.reload()
    await expect(page.locator('.content')).toBeVisible()

    const backups = await page.evaluate(() => {
      const out: Record<string, unknown> = {}
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) as string
        if (k.startsWith('luxive.db.backup')) out[k] = JSON.parse(localStorage.getItem(k) as string)
      }
      return out
    })
    // 最初のバックアップは上書きされず、2件目は別キーへ入る
    expect((backups['luxive.db.backup.v1'] as { marker: string }).marker).toBe('first')
    const second = Object.entries(backups).find(([k]) => k !== 'luxive.db.backup.v1')
    expect(second, '2件目のバックアップが別キーで保存されていない').toBeDefined()
    expect((second?.[1] as { marker: string }).marker).toBe('second')
  })

  test('他代理店の案件は登録完了画面のURLからも見られない(§2.4)', async ({ page }) => {
    await startAs(page, USERS.member1)
    await goto(page, 'deal-done?deal=DL-2026-0007') // AG-02の案件
    await expect(page.getByText('表示する案件が見つかりません')).toBeVisible()
    await expect(page.getByText('株式会社なにわ観光ホテル')).toHaveCount(0)
  })

  test('一般ユーザーの延長申請一覧には自分の申請だけが出る(§2.3)', async ({ page }) => {
    // EX-001 は U-A1-M2(若林)、EX-002 は U-A1-ADM(芝田)の申請
    await startAs(page, USERS.member1) // 遠藤(申請なし)
    await goto(page, 'extensions')
    await expect(page.getByText('延長申請はありません')).toBeVisible()

    await switchUser(page, USERS.member1b) // 若林
    await goto(page, 'extensions')
    await expect(page.getByTestId('ext-row-EX-001')).toBeVisible()
    await expect(page.getByTestId('ext-row-EX-002')).toHaveCount(0)

    await switchUser(page, USERS.admin1) // 代理店管理者は自社分を見られる
    await goto(page, 'extensions')
    await expect(page.getByTestId('ext-row-EX-001')).toBeVisible()
    await expect(page.getByTestId('ext-row-EX-002')).toBeVisible()
  })
})
