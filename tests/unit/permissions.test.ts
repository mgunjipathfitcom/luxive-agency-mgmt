import { describe, expect, it } from 'vitest'
import {
  canEditDeal,
  canManageAgencyUsers,
  canSeeHqOnlyDealFields,
  canSeeNotification,
  canViewDeal,
  dashboardScope,
  visibleDeals,
} from '../../src/domain/permissions'
import { ROUTES, canAccessRoute, findRoute, menuFor, routeLabel } from '../../src/router/routes'
import { deal, user } from './_factories'

const hq = user({ id: 'U-HQ-1', role: 'hq' })
const admin1 = user({ id: 'U-A1-ADM', role: 'agency_admin', agencyId: 'AG-01' })
const member1 = user({ id: 'U-A1-M1', role: 'agency_member', agencyId: 'AG-01' })
const member1b = user({ id: 'U-A1-M2', role: 'agency_member', agencyId: 'AG-01' })
const member2 = user({ id: 'U-A2-M1', role: 'agency_member', agencyId: 'AG-02' })

const myDeal = deal({ id: 'D1', companyName: '甲社', agencyId: 'AG-01', ownerUserId: 'U-A1-M1' })
const teamDeal = deal({ id: 'D2', companyName: '乙社', agencyId: 'AG-01', ownerUserId: 'U-A1-M2' })
const otherDeal = deal({ id: 'D3', companyName: '丙社', agencyId: 'AG-02', ownerUserId: 'U-A2-M1' })

describe('§2 案件の閲覧・編集', () => {
  it('本部はすべて閲覧・編集できる', () => {
    for (const d of [myDeal, teamDeal, otherDeal]) {
      expect(canViewDeal(hq, d)).toBe(true)
      expect(canEditDeal(hq, d)).toBe(true)
    }
  })

  it('代理店管理者は自社だけ閲覧・編集できる', () => {
    expect(canViewDeal(admin1, teamDeal)).toBe(true)
    expect(canEditDeal(admin1, teamDeal)).toBe(true)
    expect(canViewDeal(admin1, otherDeal)).toBe(false)
    expect(canEditDeal(admin1, otherDeal)).toBe(false)
  })

  it('一般ユーザーは自社を閲覧でき、編集は自分の担当だけ', () => {
    expect(canViewDeal(member1, myDeal)).toBe(true)
    expect(canEditDeal(member1, myDeal)).toBe(true)
    expect(canViewDeal(member1, teamDeal)).toBe(true)
    expect(canEditDeal(member1, teamDeal)).toBe(false) // 閲覧専用
    expect(canViewDeal(member1, otherDeal)).toBe(false)
  })

  it('他代理店の案件は一覧に出さない', () => {
    const list = visibleDeals(member2, [myDeal, teamDeal, otherDeal])
    expect(list.map((d) => d.id)).toEqual(['D3'])
  })
})

describe('§18.1 ダッシュボードの集計範囲', () => {
  const all = [myDeal, teamDeal, otherDeal]
  it('本部は全件', () => expect(dashboardScope(hq, all)).toHaveLength(3))
  it('代理店管理者は自社', () => expect(dashboardScope(admin1, all)).toHaveLength(2))
  it('一般ユーザーは自分の担当', () => expect(dashboardScope(member1, all).map((d) => d.id)).toEqual(['D1']))
  it('同僚は自分の担当だけ', () => expect(dashboardScope(member1b, all).map((d) => d.id)).toEqual(['D2']))
})

describe('§9.3 本部限定の項目', () => {
  it('本部だけが所属代理店・案件ID・登録者を見られる', () => {
    expect(canSeeHqOnlyDealFields(hq)).toBe(true)
    expect(canSeeHqOnlyDealFields(admin1)).toBe(false)
    expect(canSeeHqOnlyDealFields(member1)).toBe(false)
  })
})

describe('§17 代理店ユーザー管理', () => {
  it('代理店管理者は自社のユーザーだけ管理できる', () => {
    expect(canManageAgencyUsers(admin1, 'AG-01')).toBe(true)
    expect(canManageAgencyUsers(admin1, 'AG-02')).toBe(false)
  })
  it('本部は閲覧専用', () => {
    expect(canManageAgencyUsers(hq, 'AG-01')).toBe(false)
  })
  it('一般ユーザーは管理できない', () => {
    expect(canManageAgencyUsers(member1, 'AG-01')).toBe(false)
  })
})

describe('§15.1 通知は本人限定', () => {
  it('宛先が自分のときだけ見える', () => {
    expect(canSeeNotification(member1, 'U-A1-M1')).toBe(true)
    expect(canSeeNotification(admin1, 'U-A1-M1')).toBe(false)
    expect(canSeeNotification(member1b, 'U-A1-M1')).toBe(false)
    expect(canSeeNotification(hq, 'U-A1-M1')).toBe(false)
  })
})

describe('§2.4 Routerの権限判定', () => {
  it('本部だけの画面は代理店ロールで拒否する', () => {
    for (const p of ['review', 'reserved', 'products', 'agencies', 'settings', 'audit', 'companies']) {
      expect(canAccessRoute('hq', p), p).toBe(true)
      expect(canAccessRoute('agency_admin', p), p).toBe(false)
      expect(canAccessRoute('agency_member', p), p).toBe(false)
    }
  })

  it('営業可否照会・営業予定登録は本部では開けない', () => {
    expect(canAccessRoute('hq', 'eligibility')).toBe(false)
    expect(canAccessRoute('hq', 'deal-new')).toBe(false)
    expect(canAccessRoute('agency_member', 'eligibility')).toBe(true)
  })

  it('代理店ユーザー管理は本部(閲覧)と代理店管理者だけ', () => {
    expect(canAccessRoute('hq', 'agency-users')).toBe(true)
    expect(canAccessRoute('agency_admin', 'agency-users')).toBe(true)
    expect(canAccessRoute('agency_member', 'agency-users')).toBe(false)
  })

  it('未ログイン・未知のパスは拒否する', () => {
    expect(canAccessRoute(null, 'dashboard')).toBe(false)
    expect(canAccessRoute('hq', 'no-such-page')).toBe(false)
    expect(findRoute('no-such-page')).toBeNull()
  })

  it('メニューに出る画面はすべてそのロールでアクセスできる', () => {
    for (const role of ['hq', 'agency_admin', 'agency_member'] as const) {
      for (const r of menuFor(role)) {
        expect(canAccessRoute(role, r.path), `${role}:${r.path}`).toBe(true)
      }
    }
  })

  it('隠し画面はメニューに出ない', () => {
    const hidden = ROUTES.filter((r) => r.hidden).map((r) => r.key)
    for (const role of ['hq', 'agency_admin', 'agency_member'] as const) {
      const keys = menuFor(role).map((r) => r.key)
      for (const h of hidden) expect(keys).not.toContain(h)
    }
  })

  it('代理店では案件管理を「自社案件」と呼ぶ', () => {
    const deals = findRoute('deals')!
    expect(routeLabel(deals, 'hq')).toBe('案件管理')
    expect(routeLabel(deals, 'agency_admin')).toBe('自社案件')
  })
})
