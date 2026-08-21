import { beforeAll, describe, expect, it } from 'vitest'
import { setClock, today } from '../../src/domain/dates'
import { buildSeed } from '../../src/data/seed'
import { judge } from '../../src/domain/duplicate'
import { activeProductNames } from '../../src/domain/products'
import { isActiveOrder } from '../../src/domain/protection'
import { buildDashboard } from '../../src/domain/dashboard'
import { buildCompanies } from '../../src/domain/companies'
import { user } from './_factories'

beforeAll(() => setClock('2026-08-21'))

const db = buildSeed()
const hq = user({ id: 'U-HQ-1', role: 'hq' })

describe('初期データの整合', () => {
  it('必要な件数がそろっている', () => {
    expect(db.agencies.length).toBeGreaterThanOrEqual(4)
    expect(db.users.length).toBeGreaterThanOrEqual(10)
    expect(db.products.length).toBeGreaterThanOrEqual(10)
    expect(db.deals.length).toBeGreaterThanOrEqual(20)
    expect(db.reserved.length).toBeGreaterThanOrEqual(3)
  })

  it('案件IDが重複しない', () => {
    const ids = db.deals.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('すべての案件が保護期限と保護開始日を持つ', () => {
    for (const d of db.deals) {
      expect(d.protectionStartAt, d.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(d.protectionExpiresAt, d.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(d.protectionExpiresAt >= d.protectionStartAt, d.id).toBe(true)
    }
  })

  it('受注確定の案件には受注イベントと最終受注日がある', () => {
    for (const d of db.deals.filter((x) => x.status === 'ordered')) {
      expect(d.orders.length, d.id).toBeGreaterThan(0)
      expect(d.lastOrderDate, d.id).toBeTruthy()
    }
  })

  it('販売中は10商品、停止中は2商品', () => {
    expect(activeProductNames(db.products)).toHaveLength(10)
    expect(db.products.filter((p) => p.salesStatus === 'suspended')).toHaveLength(2)
  })

  it('停止中の商品も過去案件には残っている(§7.2)', () => {
    const suspended = db.products.filter((p) => p.salesStatus === 'suspended').map((p) => p.name)
    const used = db.deals.some((d) => d.lines.some((l) => suspended.includes(l.productName)))
    expect(used).toBe(true)
  })
})

describe('受入テストの基準になる案件がそろっている(§21.1)', () => {
  it('東都ホテル株式会社の案件がある(企業名一致の検証用)', () => {
    const d = db.deals.find((x) => x.id === 'DL-2026-0001')
    expect(d?.companyName).toBe('東都ホテル株式会社')
    expect((d?.protectionExpiresAt ?? '') >= today()).toBe(true)
  })

  it('保護期限内の受注案件がある(ordered判定の検証用)', () => {
    const d = db.deals.find((x) => x.id === 'DL-2026-0002')
    expect(d && isActiveOrder(d)).toBe(true)
  })

  it('保護期限切れの通常案件がある', () => {
    const d = db.deals.find((x) => x.id === 'DL-2026-0003')
    expect(d?.protectionExpiresAt && d.protectionExpiresAt < today()).toBe(true)
    expect(d?.status).toBe('planned')
  })

  it('保護期限切れの受注案件がある', () => {
    const d = db.deals.find((x) => x.id === 'DL-2026-0004')
    expect(d?.status).toBe('ordered')
    expect(d && isActiveOrder(d)).toBe(false)
  })
})

describe('初期データに対する重複判定(§21.1)', () => {
  it('東都ホテル(電話・Web空欄)は similar', () => {
    const r = judge({ companyName: '東都ホテル', facilityName: '', phone: '', website: '' }, db, db.settings)
    expect(r.judgement).toBe('similar')
    expect(r.reasonCode).toBe('company-name-exact')
  })

  it('Reserved企業は reserved', () => {
    const r = judge(
      { companyName: '株式会社グランドオーシャンホテルズ', facilityName: '', phone: '', website: '' },
      db,
      db.settings,
    )
    expect(r.judgement).toBe('reserved')
  })

  it('有効受注の企業は ordered', () => {
    const r = judge(
      { companyName: '株式会社ベイサイドリゾート', facilityName: '', phone: '', website: '' },
      db,
      db.settings,
    )
    expect(r.judgement).toBe('ordered')
  })

  it('保護期限切れの企業名一致は similar', () => {
    const r = judge(
      { companyName: '桜井メディカルクリニック', facilityName: '', phone: '', website: '' },
      db,
      db.settings,
    )
    expect(r.judgement).toBe('similar')
  })

  it('保護期限切れの受注企業も ordered ではなく similar', () => {
    const r = judge(
      { companyName: '株式会社ノースウィング', facilityName: '', phone: '', website: '' },
      db,
      db.settings,
    )
    expect(r.judgement).toBe('similar')
  })

  it('新しい企業は clear', () => {
    const r = judge(
      { companyName: '株式会社まだない会社', facilityName: '', phone: '045-000-0000', website: 'madanai.example.jp' },
      db,
      db.settings,
    )
    expect(r.judgement).toBe('clear')
  })
})

describe('審査キューと通知の初期状態(§21.3)', () => {
  it('重複審査待ちは similar 判定の案件だけ', () => {
    const pending = db.reviews.filter((r) => r.state === 'pending')
    expect(pending.length).toBeGreaterThan(0)
    for (const r of pending) {
      const d = db.deals.find((x) => x.id === r.dealId)
      expect(d?.judgement, r.dealId).toBe('similar')
      expect(d?.reviewState, r.dealId).toBe('pending')
    }
  })

  it('通知の宛先は必ず申請者本人', () => {
    for (const n of db.notifications) {
      const app = db.applications.find((a) => a.id === n.applicationId)
      if (app) expect(n.recipientUserId).toBe(app.applicantUserId)
    }
  })

  it('営業不可・差し戻しの審査にはメッセージがある(§14.3)', () => {
    for (const r of db.reviews) {
      if (r.decision === 'block' || r.decision === 'return') {
        expect(r.message.length, r.id).toBeGreaterThan(0)
      }
    }
  })
})

describe('ダッシュボードと企業一覧が破綻せずに作れる', () => {
  it('本部ダッシュボードが数値を返す', () => {
    const r = buildDashboard(db, hq, { from: '1900-01-01', to: '2999-12-31', label: '全期間' }, db.settings)
    expect(r.activeOrderCompanies.value).toBeGreaterThan(0)
    expect(r.orderAmount.value).toBeGreaterThan(0)
    expect(r.statusCounts.ordered).toBeGreaterThan(0)
  })

  it('企業・施設が案件から作れる', () => {
    const companies = buildCompanies(db)
    expect(companies.length).toBeGreaterThan(0)
    const toto = companies.find((c) => c.companyName.includes('東都ホテル'))
    expect(toto).toBeDefined()
  })
})
