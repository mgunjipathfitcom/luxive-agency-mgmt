import { beforeAll, describe, expect, it } from 'vitest'
import { addDays, setClock } from '../../src/domain/dates'
import {
  addAdditionalOrder,
  applyActivity,
  createDeal,
  latestQuoteTotal,
  recalcProtection,
  saveAmounts,
  totalOrders,
} from '../../src/domain/dealOps'
import { TODAY, settings } from './_factories'

beforeAll(() => setClock(TODAY))

function newDeal(registeredAt = TODAY) {
  return createDeal({
    id: 'DL-TEST-0001',
    agencyId: 'AG-01',
    ownerUserId: 'U-A1-M1',
    createdByUserId: 'U-A1-M1',
    companyName: '株式会社テストホテル',
    facilityName: '本館',
    phone: '03-1234-5678',
    website: 'https://www.test-hotel.example.jp/',
    productNames: ['ルミエール ディフューザー'],
    judgement: 'clear',
    reviewState: 'none',
    fromInquiry: true,
    registeredAt,
    settings: settings(),
  })
}

describe('案件の作成', () => {
  it('営業予定登録の保護期間が付く', () => {
    const d = newDeal()
    expect(d.status).toBe('planned')
    expect(d.protectionStartAt).toBe(TODAY)
    expect(d.protectionExpiresAt).toBe(addDays(TODAY, 30))
    expect(d.firstReachedAt.planned).toBe(TODAY)
  })

  it('表示用の入力値と正規化値を分けて保存する(§6.2)', () => {
    const d = newDeal()
    expect(d.website).toBe('https://www.test-hotel.example.jp/')
    expect(d.websiteDomain).toBe('test-hotel.example.jp')
    expect(d.phone).toBe('03-1234-5678')
    expect(d.phoneNorm).toBe('0312345678')
  })

  it('提案商品は提案対象の行として入る', () => {
    const d = newDeal()
    expect(d.lines).toEqual([
      { productName: 'ルミエール ディフューザー', proposed: true, quoteAmount: null, orderAmount: null },
    ])
  })
})

describe('§11 案件進捗・営業活動', () => {
  it('ステータス変更のみ保存できる', () => {
    const d = applyActivity(newDeal(), {
      activityDate: TODAY,
      toStatus: 'meeting',
      body: '',
      authorUserId: 'U-A1-M1',
      settings: settings(),
    })
    expect(d.status).toBe('meeting')
    expect(d.activities).toHaveLength(1)
    expect(d.activities[0]?.body).toBe('')
    expect(d.protectionExpiresAt).toBe(addDays(TODAY, 90))
  })

  it('営業活動のみ保存できる(ステータスも保護期限も変わらない)', () => {
    const before = newDeal()
    const d = applyActivity(before, {
      activityDate: TODAY,
      toStatus: null,
      body: '担当者へ資料を送付',
      authorUserId: 'U-A1-M1',
      settings: settings(),
    })
    expect(d.status).toBe('planned')
    expect(d.protectionExpiresAt).toBe(before.protectionExpiresAt)
    expect(d.activities[0]?.toStatus).toBeNull()
  })

  it('ステータス変更と活動を同時に保存できる', () => {
    const d = applyActivity(newDeal(), {
      activityDate: TODAY,
      toStatus: 'meeting',
      body: '支配人と面談',
      authorUserId: 'U-A1-M1',
      settings: settings(),
    })
    expect(d.activities[0]?.fromStatus).toBe('planned')
    expect(d.activities[0]?.toStatus).toBe('meeting')
    expect(d.activities[0]?.body).toBe('支配人と面談')
    expect(d.activities[0]?.protectionExpiresAt).toBe(addDays(TODAY, 90))
  })

  it('初到達日は最初の1回だけ記録する(§18.3)', () => {
    let d = applyActivity(newDeal(), {
      activityDate: addDays(TODAY, -20),
      toStatus: 'meeting',
      body: '',
      authorUserId: 'U',
      settings: settings(),
    })
    d = applyActivity(d, {
      activityDate: addDays(TODAY, -10),
      toStatus: 'quoted',
      body: '',
      authorUserId: 'U',
      settings: settings(),
    })
    d = applyActivity(d, {
      activityDate: TODAY,
      toStatus: 'meeting',
      body: '差し戻し',
      authorUserId: 'U',
      settings: settings(),
    })
    expect(d.firstReachedAt.meeting).toBe(addDays(TODAY, -20))
  })
})

describe('§12 提案・見積・受注情報', () => {
  it('見積だけ入れると見積提出へ進み、履歴が1件増える', () => {
    const d = saveAmounts(newDeal(), {
      lines: [
        { productName: 'ルミエール ディフューザー', proposed: true, quoteAmount: 240000, orderAmount: null },
      ],
      quoteDate: TODAY,
      orderDate: null,
      authorUserId: 'U-A1-M1',
      settings: settings(),
    })
    expect(d.status).toBe('quoted')
    expect(d.amountHistory).toHaveLength(1)
    expect(d.amountHistory[0]?.quoteTotal).toBe(240000)
    expect(latestQuoteTotal(d)).toBe(240000)
    expect(d.protectionExpiresAt).toBe(addDays(TODAY, 90))
  })

  it('受注金額を入れると受注確定になり、保護期限が受注日から365日になる', () => {
    const orderDate = addDays(TODAY, -5)
    const d = saveAmounts(newDeal(), {
      lines: [
        { productName: 'ルミエール ディフューザー', proposed: true, quoteAmount: 240000, orderAmount: 240000 },
      ],
      quoteDate: addDays(TODAY, -10),
      orderDate,
      authorUserId: 'U-A1-M1',
      settings: settings(),
    })
    expect(d.status).toBe('ordered')
    expect(d.lastOrderDate).toBe(orderDate)
    expect(d.protectionStartAt).toBe(orderDate)
    expect(d.protectionExpiresAt).toBe(addDays(orderDate, 365))
    expect(totalOrders(d)).toBe(240000)
  })

  it('空欄と0円を区別する', () => {
    const d = saveAmounts(newDeal(), {
      lines: [
        { productName: 'A', proposed: true, quoteAmount: 0, orderAmount: null },
        { productName: 'B', proposed: true, quoteAmount: null, orderAmount: null },
      ],
      quoteDate: TODAY,
      orderDate: null,
      authorUserId: 'U',
      settings: settings(),
    })
    const a = d.lines.find((l) => l.productName === 'A')
    const b = d.lines.find((l) => l.productName === 'B')
    expect(a?.quoteAmount).toBe(0)
    expect(b?.quoteAmount).toBeNull()
  })

  it('過去のスナップショットを上書きしない(§12.3)', () => {
    let d = saveAmounts(newDeal(), {
      lines: [{ productName: 'A', proposed: true, quoteAmount: 100000, orderAmount: null }],
      quoteDate: TODAY,
      orderDate: null,
      authorUserId: 'U',
      settings: settings(),
    })
    d = saveAmounts(d, {
      lines: [{ productName: 'A', proposed: true, quoteAmount: 150000, orderAmount: null }],
      quoteDate: TODAY,
      orderDate: null,
      authorUserId: 'U',
      settings: settings(),
    })
    expect(d.amountHistory).toHaveLength(2)
    expect(d.amountHistory[0]?.quoteTotal).toBe(100000)
    expect(d.amountHistory[1]?.quoteTotal).toBe(150000)
  })
})

describe('§13 追加受注', () => {
  function ordered() {
    return saveAmounts(newDeal(), {
      lines: [{ productName: 'ルミエール ディフューザー', proposed: true, quoteAmount: 240000, orderAmount: 240000 }],
      quoteDate: addDays(TODAY, -40),
      orderDate: addDays(TODAY, -30),
      authorUserId: 'U',
      settings: settings(),
    })
  }

  it('初回受注を上書きせず、案件全体の受注額へ加算する', () => {
    const before = ordered()
    const d = addAdditionalOrder(before, {
      orderDate: TODAY,
      lines: [{ productName: 'セレスト アロマオイル', amount: 108000 }],
      authorUserId: 'U',
      settings: settings(),
    })
    expect(d.orders).toHaveLength(2)
    expect(d.orders[0]?.kind).toBe('initial')
    expect(d.orders[0]?.total).toBe(240000)
    expect(d.orders[1]?.kind).toBe('additional')
    expect(totalOrders(d)).toBe(348000)
  })

  it('最終受注日と保護期限を受注日から更新する', () => {
    const d = addAdditionalOrder(ordered(), {
      orderDate: TODAY,
      lines: [{ productName: 'セレスト アロマオイル', amount: 108000 }],
      authorUserId: 'U',
      settings: settings(),
    })
    expect(d.lastOrderDate).toBe(TODAY)
    expect(d.protectionStartAt).toBe(TODAY)
    expect(d.protectionExpiresAt).toBe(addDays(TODAY, 365))
  })

  it('追加受注時の商品名を履歴に残す(§13.3)', () => {
    const d = addAdditionalOrder(ordered(), {
      orderDate: TODAY,
      lines: [{ productName: 'クラシック ポプリ', amount: 60000 }],
      authorUserId: 'U',
      settings: settings(),
    })
    const last = d.orders[d.orders.length - 1]
    expect(last?.lines[0]?.productName).toBe('クラシック ポプリ')
    const snap = d.amountHistory[d.amountHistory.length - 1]
    expect(snap?.lines[0]?.productName).toBe('クラシック ポプリ')
    expect(snap?.orderKind).toBe('additional')
  })

  it('取消した受注は合計から外れる', () => {
    const d = addAdditionalOrder(ordered(), {
      orderDate: TODAY,
      lines: [{ productName: 'セレスト アロマオイル', amount: 108000 }],
      authorUserId: 'U',
      settings: settings(),
    })
    const voided = { ...d, orders: d.orders.map((o, i) => (i === 1 ? { ...o, voided: true } : o)) }
    expect(totalOrders(voided)).toBe(240000)
  })
})

describe('§10.7 基本設定の既存案件への反映', () => {
  it('保護日数を変えて再計算すると期限が変わり、変更履歴が残る', () => {
    const d = newDeal(addDays(TODAY, -10))
    expect(d.protectionExpiresAt).toBe(addDays(TODAY, 20))
    const next = recalcProtection(d, settings({ plannedDays: 60 }), 'U-HQ-1')
    expect(next.protectionExpiresAt).toBe(addDays(TODAY, 50))
    expect(next.changes.length).toBe(d.changes.length + 1)
  })

  it('変わらないときは何も足さない', () => {
    const d = newDeal()
    const next = recalcProtection(d, settings(), 'U-HQ-1')
    expect(next).toBe(d)
  })

  it('受注案件は最終受注日を起点に再計算する', () => {
    const orderDate = addDays(TODAY, -100)
    const d = saveAmounts(newDeal(addDays(TODAY, -200)), {
      lines: [{ productName: 'A', proposed: true, quoteAmount: null, orderAmount: 500000 }],
      quoteDate: null,
      orderDate,
      authorUserId: 'U',
      settings: settings(),
    })
    const next = recalcProtection(d, settings({ orderDays: 180 }), 'U-HQ-1')
    expect(next.protectionExpiresAt).toBe(addDays(orderDate, 180))
  })
})
