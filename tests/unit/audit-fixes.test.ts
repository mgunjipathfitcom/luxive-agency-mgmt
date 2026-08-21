/**
 * Codexによる仕様突き合わせレビューで見つかった不具合の回帰テスト。
 * 一度直した挙動が戻らないことを守るために置く。
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { addDays, isValidDateISO, setClock } from '../../src/domain/dates'
import { normalizeCompanyName } from '../../src/domain/normalize'
import { parseAmount } from '../../src/domain/format'
import {
  addAdditionalOrder,
  applyActivity,
  createDeal,
  currentStatusChangedAt,
  latestOrderDate,
  recalcProtection,
  saveAmounts,
} from '../../src/domain/dealOps'
import { judge } from '../../src/domain/duplicate'
import { TODAY, deal, settings } from './_factories'

beforeAll(() => setClock(TODAY))

function newDeal(registeredAt = TODAY) {
  return createDeal({
    id: 'DL-FIX-0001',
    agencyId: 'AG-01',
    ownerUserId: 'U-A1-M1',
    createdByUserId: 'U-A1-M1',
    companyName: '株式会社テストホテル',
    facilityName: '',
    phone: '03-1234-5678',
    website: 'https://test-hotel.example.jp',
    productNames: ['A'],
    judgement: 'clear',
    reviewState: 'none',
    fromInquiry: true,
    registeredAt,
    settings: settings(),
  })
}

describe('#1 記号を挟んだ法人格も落とす(§3.4)', () => {
  it('句読点や記号が付いていても同じ正規化値になる', () => {
    const expected = normalizeCompanyName('Luxive')
    expect(normalizeCompanyName('Luxive株式会社。')).toBe(expected)
    expect(normalizeCompanyName('Luxive・株式会社')).toBe(expected)
    expect(normalizeCompanyName('株式会社 Luxive.')).toBe(expected)
    expect(normalizeCompanyName('「株式会社Luxive」')).toBe(expected)
  })

  it('記号付きの表記でも重複審査へ回る', () => {
    const db = { deals: [deal({ id: 'DL-1', companyName: '株式会社Luxive' })], reserved: [] }
    const r = judge({ companyName: 'Luxive株式会社。', facilityName: '', phone: '', website: '' }, db, settings())
    expect(r.judgement).toBe('similar')
    expect(r.reasonCode).toBe('company-name-exact')
  })
})

describe('#8 金額のカンマ区切りを正しく検証する(§12.2)', () => {
  it('不正な区切りは拒否する', () => {
    expect(parseAmount('1,,2').error).toBeTruthy()
    expect(parseAmount('1,23').error).toBeTruthy()
    expect(parseAmount(',123').error).toBeTruthy()
    expect(parseAmount('12,').error).toBeTruthy()
  })
  it('正しい区切りとカンマなしは受け付ける', () => {
    expect(parseAmount('1,200,000').value).toBe(1200000)
    expect(parseAmount('1200000').value).toBe(1200000)
    expect(parseAmount('999').value).toBe(999)
  })
})

describe('#3 日付が空・不正なら保存を止める', () => {
  it('isValidDateISOが空欄と不正日付を弾く', () => {
    expect(isValidDateISO('2026-08-21')).toBe(true)
    expect(isValidDateISO('')).toBe(false)
    expect(isValidDateISO(null)).toBe(false)
    expect(isValidDateISO(undefined)).toBe(false)
    expect(isValidDateISO('2026-02-30')).toBe(false)
    expect(isValidDateISO('2026-8-1')).toBe(false)
  })

  it('余分な文字が付いた日付も弾く(先頭10文字だけ見ない)', () => {
    expect(isValidDateISO('2026-08-21junk')).toBe(false)
    expect(isValidDateISO('2026-08-21T09:00:00.000Z')).toBe(false)
    expect(isValidDateISO(' 2026-08-21')).toBe(false)
    expect(isValidDateISO('2026-08-21 ')).toBe(false)
  })

  it('金額があるのに日付がないと、今日の日付で保存せずエラーにする', () => {
    expect(() =>
      saveAmounts(newDeal(), {
        lines: [{ productName: 'A', proposed: true, quoteAmount: null, orderAmount: 1000 }],
        quoteDate: null,
        orderDate: null,
        authorUserId: 'U',
        settings: settings(),
      }),
    ).toThrow()

    expect(() =>
      saveAmounts(newDeal(), {
        lines: [{ productName: 'A', proposed: true, quoteAmount: 1000, orderAmount: null }],
        quoteDate: null,
        orderDate: null,
        authorUserId: 'U',
        settings: settings(),
      }),
    ).toThrow()
  })

  it('追加受注は空の受注日を受け付けない', () => {
    expect(() =>
      addAdditionalOrder(newDeal(), {
        orderDate: '',
        lines: [{ productName: 'A', amount: 1000 }],
        authorUserId: 'U',
        settings: settings(),
      }),
    ).toThrow()
  })

  it('営業活動は空の活動日を受け付けない', () => {
    expect(() =>
      applyActivity(newDeal(), {
        activityDate: '',
        toStatus: 'meeting',
        body: '',
        authorUserId: 'U',
        settings: settings(),
      }),
    ).toThrow()
  })

  it('金額保存は不正な受注日を受け付けない', () => {
    expect(() =>
      saveAmounts(newDeal(), {
        lines: [{ productName: 'A', proposed: true, quoteAmount: null, orderAmount: 1000 }],
        quoteDate: null,
        orderDate: '2026-13-01',
        authorUserId: 'U',
        settings: settings(),
      }),
    ).toThrow()
  })
})

describe('#2 初回受注の受注日を直したら保護期限も動く(§10.5)', () => {
  function ordered(orderDate: string) {
    return saveAmounts(newDeal(addDays(TODAY, -400)), {
      lines: [{ productName: 'A', proposed: true, quoteAmount: 500000, orderAmount: 500000 }],
      quoteDate: addDays(orderDate, -10),
      orderDate,
      authorUserId: 'U',
      settings: settings(),
    })
  }

  it('受注日を後ろへずらすと保護期限・保護開始日・最終受注日が追随する', () => {
    const first = ordered(addDays(TODAY, -200))
    expect(first.protectionExpiresAt).toBe(addDays(addDays(TODAY, -200), 365))

    const moved = saveAmounts(first, {
      lines: [{ productName: 'A', proposed: true, quoteAmount: 500000, orderAmount: 500000 }],
      quoteDate: addDays(TODAY, -210),
      orderDate: TODAY,
      authorUserId: 'U',
      settings: settings(),
    })
    expect(moved.orders.filter((o) => !o.voided)[0]?.orderDate).toBe(TODAY)
    expect(moved.lastOrderDate).toBe(TODAY)
    expect(moved.protectionStartAt).toBe(TODAY)
    expect(moved.protectionExpiresAt).toBe(addDays(TODAY, 365))
    expect(moved.changes.some((c) => c.field === '受注日')).toBe(true)
  })

  it('受注日を変えなければ保護期限も変わらない', () => {
    const first = ordered(addDays(TODAY, -200))
    const again = saveAmounts(first, {
      lines: [{ productName: 'A', proposed: true, quoteAmount: 600000, orderAmount: 500000 }],
      quoteDate: addDays(TODAY, -210),
      orderDate: addDays(TODAY, -200),
      authorUserId: 'U',
      settings: settings(),
    })
    expect(again.protectionExpiresAt).toBe(first.protectionExpiresAt)
  })
})

describe('#4 追加受注が最後なら追加受注の日数で再計算する(§13.2 / §10.7)', () => {
  it('additionalOrderDaysを使う', () => {
    const orderDate = addDays(TODAY, -20)
    let d = saveAmounts(newDeal(addDays(TODAY, -300)), {
      lines: [{ productName: 'A', proposed: true, quoteAmount: null, orderAmount: 500000 }],
      quoteDate: null,
      orderDate: addDays(TODAY, -100),
      authorUserId: 'U',
      settings: settings(),
    })
    d = addAdditionalOrder(d, {
      orderDate,
      lines: [{ productName: 'B', amount: 120000 }],
      authorUserId: 'U',
      settings: settings(),
    })
    expect(latestOrderDate(d)).toBe(orderDate)

    const next = recalcProtection(d, settings({ orderDays: 365, additionalOrderDays: 400 }), 'U-HQ-1')
    expect(next.protectionExpiresAt).toBe(addDays(orderDate, 400))
  })

  it('初回受注だけならorderDaysを使う', () => {
    const orderDate = addDays(TODAY, -100)
    const d = saveAmounts(newDeal(addDays(TODAY, -300)), {
      lines: [{ productName: 'A', proposed: true, quoteAmount: null, orderAmount: 500000 }],
      quoteDate: null,
      orderDate,
      authorUserId: 'U',
      settings: settings(),
    })
    const next = recalcProtection(d, settings({ orderDays: 400, additionalOrderDays: 500 }), 'U-HQ-1')
    expect(next.protectionExpiresAt).toBe(addDays(orderDate, 400))
  })
})

describe('#5 再計算は現在ステータスへ最後に変更した日を起点にする(§10.3 / §10.7)', () => {
  it('初回到達日ではなく最新の変更日を使う', () => {
    let d = newDeal(addDays(TODAY, -230))
    d = applyActivity(d, {
      activityDate: addDays(TODAY, -220),
      toStatus: 'meeting',
      body: '初回商談',
      authorUserId: 'U',
      settings: settings(),
    })
    d = applyActivity(d, {
      activityDate: addDays(TODAY, -215),
      toStatus: 'quoted',
      body: '見積提出',
      authorUserId: 'U',
      settings: settings(),
    })
    d = applyActivity(d, {
      activityDate: addDays(TODAY, -30),
      toStatus: 'meeting',
      body: '条件見直しのため商談へ戻す',
      authorUserId: 'U',
      settings: settings(),
    })

    expect(d.firstReachedAt.meeting).toBe(addDays(TODAY, -220))
    expect(currentStatusChangedAt(d)).toBe(addDays(TODAY, -30))

    const next = recalcProtection(d, settings({ meetingDays: 120 }), 'U-HQ-1')
    expect(next.protectionExpiresAt).toBe(addDays(addDays(TODAY, -30), 120))
  })

  it('活動履歴がなければ初回到達日を使う', () => {
    const d = deal({
      id: 'DL-X',
      companyName: '甲社',
      status: 'meeting',
      firstReachedAt: { planned: addDays(TODAY, -60), meeting: addDays(TODAY, -50) },
      protectionStartAt: addDays(TODAY, -60),
      protectionExpiresAt: addDays(TODAY, 40),
    })
    expect(currentStatusChangedAt(d)).toBe(addDays(TODAY, -50))
    const next = recalcProtection(d, settings({ meetingDays: 100 }), 'U-HQ-1')
    expect(next.protectionExpiresAt).toBe(addDays(addDays(TODAY, -50), 100))
  })
})
