/**
 * Codexによる2巡目レビューで見つかった不具合の回帰テスト。
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { addDays, formatDate, setClock } from '../../src/domain/dates'
import {
  addAdditionalOrder,
  applyActivity,
  createDeal,
  currentStatusChangedAt,
  orderStateFor,
  rebuildAfterOrderChange,
  recalcProtection,
  saveAmounts,
} from '../../src/domain/dealOps'
import { totalOrders as totalOrdersOf } from '../../src/domain/dealOps'
import { buildDashboard } from '../../src/domain/dashboard'
import { buildSeed } from '../../src/data/seed'
import type { Deal } from '../../src/domain/types'
import { TODAY, settings, user } from './_factories'

beforeAll(() => setClock(TODAY))

function newDeal(registeredAt = addDays(TODAY, -300)) {
  return createDeal({
    id: 'DL-FIX2-0001',
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

/** 見積 → 初回受注 → 追加受注 の順に進めた案件 */
function orderedWithAdditional(initialDate: string, additionalDate: string) {
  let d = saveAmounts(newDeal(), {
    lines: [{ productName: 'A', proposed: true, quoteAmount: 500000, orderAmount: null }],
    quoteDate: addDays(initialDate, -20),
    orderDate: null,
    authorUserId: 'U',
    settings: settings(),
  })
  d = saveAmounts(d, {
    lines: [{ productName: 'A', proposed: true, quoteAmount: 500000, orderAmount: 500000 }],
    quoteDate: addDays(initialDate, -20),
    orderDate: initialDate,
    authorUserId: 'U',
    settings: settings(),
  })
  return addAdditionalOrder(d, {
    orderDate: additionalDate,
    lines: [{ productName: 'B', amount: 120000 }],
    authorUserId: 'U',
    settings: settings(),
  })
}

describe('受注イベントから保護状態を組み立て直す', () => {
  it('最後が追加受注なら additionalOrderDays を使う', () => {
    const d = orderedWithAdditional(addDays(TODAY, -60), addDays(TODAY, -20))
    const st = orderStateFor(d.orders, settings({ orderDays: 365, additionalOrderDays: 400 }))
    expect(st.lastKind).toBe('additional')
    expect(st.lastOrderDate).toBe(addDays(TODAY, -20))
    expect(st.days).toBe(400)
    expect(st.expiresAt).toBe(addDays(addDays(TODAY, -20), 400))
  })

  it('取消したイベントは無視する', () => {
    const d = orderedWithAdditional(addDays(TODAY, -60), addDays(TODAY, -20))
    const voidedAdditional: Deal = {
      ...d,
      orders: d.orders.map((o) => (o.kind === 'additional' ? { ...o, voided: true } : o)),
    }
    const st = orderStateFor(voidedAdditional.orders, settings())
    expect(st.lastKind).toBe('initial')
    expect(st.lastOrderDate).toBe(addDays(TODAY, -60))
  })

  it('受注が1件も残っていなければ hasOrder は false', () => {
    const d = orderedWithAdditional(addDays(TODAY, -60), addDays(TODAY, -20))
    const allVoided = d.orders.map((o) => ({ ...o, voided: true }))
    expect(orderStateFor(allVoided, settings()).hasOrder).toBe(false)
  })
})

describe('受注を取り消したあとの案件', () => {
  it('追加受注を取り消すと、初回受注の日から数え直す', () => {
    const d = orderedWithAdditional(addDays(TODAY, -60), addDays(TODAY, -20))
    expect(d.protectionExpiresAt).toBe(addDays(addDays(TODAY, -20), 365))

    const voided: Deal = {
      ...d,
      orders: d.orders.map((o) => (o.kind === 'additional' ? { ...o, voided: true } : o)),
    }
    const rebuilt = rebuildAfterOrderChange(voided, settings(), 'U-HQ-1')
    expect(rebuilt.lastOrderDate).toBe(addDays(TODAY, -60))
    expect(rebuilt.protectionStartAt).toBe(addDays(TODAY, -60))
    expect(rebuilt.protectionExpiresAt).toBe(addDays(addDays(TODAY, -60), 365))
    expect(rebuilt.status).toBe('ordered')
  })

  it('受注をすべて取り消すと、受注前の段階へ戻して保護期限も数え直す', () => {
    const d = orderedWithAdditional(addDays(TODAY, -60), addDays(TODAY, -20))
    const allVoided: Deal = { ...d, orders: d.orders.map((o) => ({ ...o, voided: true })) }
    const rebuilt = rebuildAfterOrderChange(allVoided, settings(), 'U-HQ-1')
    expect(rebuilt.status).toBe('quoted')
    expect(rebuilt.lastOrderDate).toBeNull()
    const quotedAt = d.firstReachedAt.quoted as string
    expect(rebuilt.protectionExpiresAt).toBe(addDays(quotedAt, 90))
  })

  it('設定の再反映でも、取消済みイベントを起点にしない', () => {
    const d = orderedWithAdditional(addDays(TODAY, -60), addDays(TODAY, -20))
    const voided: Deal = {
      ...d,
      orders: d.orders.map((o) => (o.kind === 'additional' ? { ...o, voided: true } : o)),
    }
    const next = recalcProtection(voided, settings({ orderDays: 200 }), 'U-HQ-1')
    expect(next.protectionExpiresAt).toBe(addDays(addDays(TODAY, -60), 200))
    expect(next.lastOrderDate).toBe(addDays(TODAY, -60))
  })

  it('取消済み初回のあとに新しい初回を保存しても、有効な最新受注が基準になる', () => {
    const d = orderedWithAdditional(addDays(TODAY, -60), addDays(TODAY, -20))
    const voidedInitial: Deal = {
      ...d,
      orders: d.orders.map((o) => (o.kind === 'initial' ? { ...o, voided: true } : o)),
    }
    // 取消済みの初回があるので、新しい初回受注が作られる
    const resaved = saveAmounts(voidedInitial, {
      lines: [{ productName: 'A', proposed: true, quoteAmount: 500000, orderAmount: 500000 }],
      quoteDate: addDays(TODAY, -80),
      orderDate: addDays(TODAY, -40),
      authorUserId: 'U',
      settings: settings(),
    })
    // 有効な受注のうち最新は追加受注(-20日)なので、そこが基準
    const st = orderStateFor(resaved.orders, settings())
    expect(st.lastOrderDate).toBe(addDays(TODAY, -20))
    expect(st.lastKind).toBe('additional')
    // 保存結果そのものが、その基準に従っていること
    expect(resaved.lastOrderDate).toBe(addDays(TODAY, -20))
    expect(resaved.protectionStartAt).toBe(addDays(TODAY, -20))
    expect(resaved.protectionExpiresAt).toBe(addDays(addDays(TODAY, -20), 365))
  })

  it('過去日の追加受注を足しても、いちばん新しい受注が基準のまま', () => {
    const d = orderedWithAdditional(addDays(TODAY, -30), addDays(TODAY, -10))
    const before = d.protectionExpiresAt
    const backdated = addAdditionalOrder(d, {
      orderDate: addDays(TODAY, -60),
      lines: [{ productName: 'C', amount: 30000 }],
      authorUserId: 'U',
      settings: settings(),
    })
    // 最新は -10日 の追加受注のまま
    expect(backdated.lastOrderDate).toBe(addDays(TODAY, -10))
    expect(backdated.protectionExpiresAt).toBe(before)
    expect(totalOrdersOf(backdated)).toBe(650000)
  })
})

describe('現在ステータスへの「最後の変更」', () => {
  it('過去日で戻した操作でも、最後に行った操作の活動日を使う', () => {
    let d = newDeal(addDays(TODAY, -230))
    d = applyActivity(d, {
      activityDate: addDays(TODAY, -20),
      toStatus: 'meeting',
      body: '初回商談',
      authorUserId: 'U',
      settings: settings(),
    })
    d = applyActivity(d, {
      activityDate: addDays(TODAY, -15),
      toStatus: 'quoted',
      body: '見積提出',
      authorUserId: 'U',
      settings: settings(),
    })
    // あとから「実は8/10に商談へ戻していた」と入力する
    d = applyActivity(d, {
      activityDate: addDays(TODAY, -30),
      toStatus: 'meeting',
      body: '条件見直しのため商談へ戻す',
      authorUserId: 'U',
      settings: settings(),
    })
    expect(d.status).toBe('meeting')
    // 活動日の最大(-20日)ではなく、最後に行った操作(-30日)を採る
    expect(currentStatusChangedAt(d)).toBe(addDays(TODAY, -30))
    const next = recalcProtection(d, settings({ meetingDays: 120 }), 'U-HQ-1')
    expect(next.protectionExpiresAt).toBe(addDays(addDays(TODAY, -30), 120))
  })
})

describe('日付の表示', () => {
  it('日時を渡しても、現地時刻の日付になる(UTCの切り出しで前日にしない)', () => {
    // 実行環境のタイムゾーンに依存しないよう、期待値もローカル時刻から作る
    const localDate = (iso: string) => {
      const d = new Date(iso)
      const p = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())}`
    }
    for (const iso of ['2026-08-20T16:54:00.000Z', '2026-08-21T00:30:00.000Z', '2026-01-01T23:00:00.000Z']) {
      expect(formatDate(iso), iso).toBe(localDate(iso))
    }
    // 現地時刻とUTCで日付がずれる瞬間では、必ず現地時刻の側を返す
    const iso = '2026-08-20T16:54:00.000Z'
    const utcDate = iso.slice(0, 10).replace(/-/g, '/')
    if (localDate(iso) !== utcDate) {
      expect(formatDate(iso)).not.toBe(utcDate)
    }
  })

  it('日付だけの文字列はそのまま整形する', () => {
    expect(formatDate('2026-08-21')).toBe('2026/08/21')
    expect(formatDate(null)).toBe('—')
    expect(formatDate('')).toBe('—')
  })
})

describe('初期データの整合(2巡目の指摘)', () => {
  const db = buildSeed()

  it('reserved判定の案件は作らず、審査キューにも入れない(§4.2 / §6.3)', () => {
    expect(db.deals.some((d) => d.judgement === 'reserved')).toBe(false)
    expect(db.deals.some((d) => d.judgement === 'ordered')).toBe(false)
    for (const r of db.reviews) {
      const deal = db.deals.find((d) => d.id === r.dealId)
      expect(deal?.judgement, r.id).toBe('similar')
    }
  })

  it('Reservedにぶつかった申請は、案件なしの申請履歴と監査ログに残る', () => {
    const app = db.applications.find((a) => a.judgement === 'reserved' && a.kind === 'deal-register')
    expect(app).toBeDefined()
    expect(app?.dealId).toBeNull()
    expect(db.audits.some((a) => a.targetId === app?.id)).toBe(true)
  })

  it('引継ぎ履歴の内容と、案件の担当営業が一致している(§17)', () => {
    for (const h of db.handovers) {
      for (const id of h.dealIds) {
        const d = db.deals.find((x) => x.id === id)
        expect(d, id).toBeDefined()
        expect(d?.ownerUserId, id).toBe(h.toUserId)
        expect(d?.changes.some((c) => c.field === '担当営業(引継ぎ)'), id).toBe(true)
      }
    }
  })

  it('引継ぎの監査ログが、実際の引継ぎ履歴と食い違わない', () => {
    const handoverAudits = db.audits.filter((a) => a.action === '担当案件を引継ぎ')
    expect(handoverAudits.length).toBe(db.handovers.length)
    for (const a of handoverAudits) {
      const h = db.handovers.find((x) => x.fromUserId === a.targetId)
      expect(h, a.id).toBeDefined()
      const from = db.users.find((u) => u.id === h?.fromUserId)
      const to = db.users.find((u) => u.id === h?.toUserId)
      expect(a.detail, a.id).toContain(from?.name ?? '')
      expect(a.detail, a.id).toContain(to?.name ?? '')
      expect(a.detail, a.id).toContain(`${h?.dealIds.length}件`)
    }
  })

  it('承認済みの延長申請は、案件の保護期限にも反映されている', () => {
    for (const e of db.extensions.filter((x) => x.state === 'approved')) {
      const d = db.deals.find((x) => x.id === e.dealId)
      expect(d, e.id).toBeDefined()
      expect(
        d?.changes.some((c) => c.field === '保護期限(延長申請の承認)'),
        e.id,
      ).toBe(true)
    }
  })

  it('有効契約の企業数と企業グループ数が一致する', () => {
    const hq = user({ id: 'U-HQ-1', role: 'hq' })
    const r = buildDashboard(db, hq, { from: '1900-01-01', to: '2999-12-31', label: '全期間' }, db.settings)
    expect(r.activeOrderCompanies.companyGroups).toHaveLength(r.activeOrderCompanies.value)
    const flattened = r.activeOrderCompanies.companyGroups.flatMap((g) => g.dealIds).sort()
    expect(flattened).toEqual([...r.activeOrderCompanies.dealIds].sort())
  })
})
