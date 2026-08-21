import { beforeAll, describe, expect, it } from 'vitest'
import { addDays, periodRange, setClock } from '../../src/domain/dates'
import { buildDashboard, firstAdvancedDate } from '../../src/domain/dashboard'
import type { Deal } from '../../src/domain/types'
import { TODAY, deal, orderedDeal, settings, user } from './_factories'

beforeAll(() => setClock(TODAY))

const hq = user({ id: 'U-HQ-1', role: 'hq' })
const admin = user({ id: 'U-A1-ADM', role: 'agency_admin', agencyId: 'AG-01' })
const member = user({ id: 'U-A1-M1', role: 'agency_member', agencyId: 'AG-01' })
const period = periodRange('last-90', TODAY)
const allTime = periodRange('all', TODAY)

function db(deals: Deal[]) {
  return { deals, reviews: [] }
}

describe('§18.1 集計範囲', () => {
  const deals = [
    deal({ id: 'A', companyName: '甲社', agencyId: 'AG-01', ownerUserId: 'U-A1-M1' }),
    deal({ id: 'B', companyName: '乙社', agencyId: 'AG-01', ownerUserId: 'U-A1-M2' }),
    deal({ id: 'C', companyName: '丙社', agencyId: 'AG-02', ownerUserId: 'U-A2-M1' }),
  ]

  it('本部は全代理店', () => {
    expect(buildDashboard(db(deals), hq, allTime, settings()).scopedDeals).toHaveLength(3)
  })
  it('代理店管理者は自社のみ', () => {
    expect(buildDashboard(db(deals), admin, allTime, settings()).scopedDeals).toHaveLength(2)
  })
  it('一般ユーザーは自分の担当のみ', () => {
    expect(buildDashboard(db(deals), member, allTime, settings()).scopedDeals).toHaveLength(1)
  })
})

describe('§18.2 有効契約・受注企業数', () => {
  it('受注確定かつ保護期限内を企業名でユニーク化する', () => {
    const deals = [
      orderedDeal('A', '東都ホテル株式会社', { expiresAt: addDays(TODAY, 100), facilityName: '本館' }),
      orderedDeal('B', '東都ホテル', { expiresAt: addDays(TODAY, 100), facilityName: '別館' }),
      orderedDeal('C', '株式会社ベイサイド', { expiresAt: addDays(TODAY, 100) }),
      orderedDeal('D', '株式会社期限切れ', { expiresAt: addDays(TODAY, -1) }),
      deal({ id: 'E', companyName: '未受注商事' }),
    ]
    const r = buildDashboard(db(deals), hq, allTime, settings())
    expect(r.activeOrderCompanies.value).toBe(2)
    expect(r.activeOrderCompanies.dealIds.sort()).toEqual(['A', 'B', 'C'])
  })
})

describe('§18.3 商談数', () => {
  it('期間内に初めて商談以降へ到達した案件を1件と数える', () => {
    const d = deal({
      id: 'A',
      companyName: '甲社',
      status: 'quoted',
      firstReachedAt: { planned: addDays(TODAY, -80), meeting: addDays(TODAY, -60), quoted: addDays(TODAY, -20) },
      protectionExpiresAt: addDays(TODAY, 30),
    })
    expect(firstAdvancedDate(d)).toBe(addDays(TODAY, -60))
    const r = buildDashboard(db([d]), hq, period, settings())
    expect(r.meetings.value).toBe(1)
  })

  it('商談を経由せず直接受注した案件も含む', () => {
    const d = deal({
      id: 'A',
      companyName: '甲社',
      status: 'ordered',
      firstReachedAt: { planned: addDays(TODAY, -40), ordered: addDays(TODAY, -30) },
      protectionExpiresAt: addDays(TODAY, 300),
    })
    expect(buildDashboard(db([d]), hq, period, settings()).meetings.value).toBe(1)
  })

  it('後続ステータスへ進んでも数が減らない', () => {
    const d = deal({
      id: 'A',
      companyName: '甲社',
      status: 'ordered',
      firstReachedAt: {
        planned: addDays(TODAY, -70),
        meeting: addDays(TODAY, -60),
        quoted: addDays(TODAY, -40),
        ordered: addDays(TODAY, -10),
      },
      protectionExpiresAt: addDays(TODAY, 300),
    })
    expect(buildDashboard(db([d]), hq, period, settings()).meetings.value).toBe(1)
  })

  it('期間外に到達した案件は含まない', () => {
    const d = deal({
      id: 'A',
      companyName: '甲社',
      status: 'meeting',
      firstReachedAt: { planned: addDays(TODAY, -400), meeting: addDays(TODAY, -300) },
      protectionExpiresAt: addDays(TODAY, 30),
    })
    expect(buildDashboard(db([d]), hq, period, settings()).meetings.value).toBe(0)
  })

  it('保護期限切れの案件は含まない', () => {
    const d = deal({
      id: 'A',
      companyName: '甲社',
      status: 'meeting',
      firstReachedAt: { planned: addDays(TODAY, -60), meeting: addDays(TODAY, -50) },
      protectionExpiresAt: addDays(TODAY, -1),
    })
    expect(buildDashboard(db([d]), hq, period, settings()).meetings.value).toBe(0)
  })
})

describe('§18.4 見積金額', () => {
  function withQuotes(id: string, quotes: { date: string; total: number; voided?: boolean }[]): Deal {
    return deal({
      id,
      companyName: `${id}社`,
      status: 'quoted',
      protectionExpiresAt: addDays(TODAY, 60),
      amountHistory: quotes.map((q, i) => ({
        id: `${id}-AM${i}`,
        registeredAt: q.date,
        quoteDate: q.date,
        orderDate: null,
        lines: [],
        quoteTotal: q.total,
        orderTotal: 0,
        orderKind: 'none' as const,
        authorUserId: 'U',
        createdAt: `${q.date}T0${i}:00:00.000Z`,
        voided: q.voided ?? false,
      })),
    })
  }

  it('同じ案件の履歴を重複集計せず、最新の有効見積だけを使う', () => {
    const d = withQuotes('A', [
      { date: addDays(TODAY, -40), total: 100000 },
      { date: addDays(TODAY, -20), total: 150000 },
    ])
    expect(buildDashboard(db([d]), hq, period, settings()).quoteAmount.value).toBe(150000)
  })

  it('無効にした履歴は除外する', () => {
    const d = withQuotes('A', [
      { date: addDays(TODAY, -40), total: 100000 },
      { date: addDays(TODAY, -20), total: 150000, voided: true },
    ])
    expect(buildDashboard(db([d]), hq, period, settings()).quoteAmount.value).toBe(100000)
  })

  it('期間外の見積は数えない', () => {
    const d = withQuotes('A', [{ date: addDays(TODAY, -300), total: 100000 }])
    expect(buildDashboard(db([d]), hq, period, settings()).quoteAmount.value).toBe(0)
  })

  it('保護期限切れの案件は数えない', () => {
    const d = withQuotes('A', [{ date: addDays(TODAY, -20), total: 100000 }])
    const expired = { ...d, protectionExpiresAt: addDays(TODAY, -1) }
    expect(buildDashboard(db([expired]), hq, period, settings()).quoteAmount.value).toBe(0)
  })
})

describe('§18.5 受注金額', () => {
  it('初回受注と追加受注を合計する', () => {
    const base = orderedDeal('A', '甲社', {
      expiresAt: addDays(TODAY, 300),
      orderDate: addDays(TODAY, -60),
      total: 500000,
    })
    const withAdd: Deal = {
      ...base,
      orders: [
        ...base.orders,
        {
          id: 'A-OD2',
          kind: 'additional',
          orderDate: addDays(TODAY, -10),
          lines: [{ productName: 'B', amount: 120000 }],
          total: 120000,
          authorUserId: 'U',
          createdAt: `${addDays(TODAY, -10)}T09:00:00.000Z`,
          voided: false,
        },
      ],
    }
    expect(buildDashboard(db([withAdd]), hq, period, settings()).orderAmount.value).toBe(620000)
  })

  it('取消した受注は除外する', () => {
    const base = orderedDeal('A', '甲社', {
      expiresAt: addDays(TODAY, 300),
      orderDate: addDays(TODAY, -60),
      total: 500000,
    })
    const voided: Deal = { ...base, orders: base.orders.map((o) => ({ ...o, voided: true })) }
    expect(buildDashboard(db([voided]), hq, period, settings()).orderAmount.value).toBe(0)
  })

  it('期間外の受注は数えない', () => {
    const base = orderedDeal('A', '甲社', {
      expiresAt: addDays(TODAY, 100),
      orderDate: addDays(TODAY, -265),
      total: 500000,
    })
    expect(buildDashboard(db([base]), hq, period, settings()).orderAmount.value).toBe(0)
  })
})

describe('§18.6 保護期限間近', () => {
  it('警告日数以内で、期限切れは含まない', () => {
    const deals = [
      deal({ id: 'A', companyName: '甲社', protectionExpiresAt: addDays(TODAY, 5) }),
      deal({ id: 'B', companyName: '乙社', protectionExpiresAt: addDays(TODAY, 40) }),
      deal({ id: 'C', companyName: '丙社', protectionExpiresAt: addDays(TODAY, -1) }),
    ]
    const r = buildDashboard(db(deals), hq, allTime, settings({ warningDays: 30 }))
    expect(r.expiringSoon.value).toBe(1)
    expect(r.expiringSoon.dealIds).toEqual(['A'])
  })
})

describe('§18.6 カードと一覧は同じ集計関数を使う', () => {
  it('カードの値と dealIds の件数が一致する', () => {
    const deals = [
      orderedDeal('A', '甲社', { expiresAt: addDays(TODAY, 100), orderDate: addDays(TODAY, -20) }),
      deal({ id: 'B', companyName: '乙社', protectionExpiresAt: addDays(TODAY, 5) }),
    ]
    const r = buildDashboard(db(deals), hq, period, settings())
    expect(r.expiringSoon.dealIds).toHaveLength(r.expiringSoon.value)
    expect(r.meetings.dealIds).toHaveLength(r.meetings.value)
    // 有効契約は企業単位。企業グループの数がカードの値と厳密に一致する
    expect(r.activeOrderCompanies.companyGroups).toHaveLength(r.activeOrderCompanies.value)
  })

  it('同じ企業に2案件あっても、カードは1社・内訳は1グループ2案件になる', () => {
    const deals = [
      orderedDeal('A', '東都ホテル株式会社', {
        expiresAt: addDays(TODAY, 100),
        facilityName: '本館',
        orderDate: addDays(TODAY, -20),
      }),
      orderedDeal('B', '東都ホテル', {
        expiresAt: addDays(TODAY, 100),
        facilityName: '別館',
        orderDate: addDays(TODAY, -20),
      }),
    ]
    const r = buildDashboard(db(deals), hq, period, settings())
    expect(r.activeOrderCompanies.value).toBe(1)
    expect(r.activeOrderCompanies.companyGroups).toHaveLength(1)
    expect(r.activeOrderCompanies.companyGroups[0]?.dealIds.sort()).toEqual(['A', 'B'])
    expect(r.activeOrderCompanies.dealIds.sort()).toEqual(['A', 'B'])
  })

  it('受注をすべて取消した案件は有効契約に数えない', () => {
    const base = orderedDeal('A', '甲社', { expiresAt: addDays(TODAY, 100), orderDate: addDays(TODAY, -20) })
    const voided: Deal = { ...base, orders: base.orders.map((o) => ({ ...o, voided: true })) }
    const r = buildDashboard(db([voided]), hq, period, settings())
    expect(r.activeOrderCompanies.value).toBe(0)
    expect(r.activeOrderCompanies.companyGroups).toHaveLength(0)
  })
})

describe('営業不可の案件は集計から外す', () => {
  it('blocked の案件は scopedDeals に入らない', () => {
    const deals = [deal({ id: 'A', companyName: '甲社', reviewState: 'blocked' })]
    expect(buildDashboard(db(deals), hq, allTime, settings()).scopedDeals).toHaveLength(0)
  })
})
