/**
 * 権限判定(§2)
 * ロールごとの案件閲覧・編集判定は、この共通関数で一元管理する(§2.3)。
 */
import type { Deal, Role, User } from './types'

export function isHq(user: Pick<User, 'role'>): boolean {
  return user.role === 'hq'
}

export function isAgencyAdmin(user: Pick<User, 'role'>): boolean {
  return user.role === 'agency_admin'
}

/** 案件を閲覧できるか */
export function canViewDeal(user: User, deal: Deal): boolean {
  if (user.role === 'hq') return true
  if (!user.agencyId) return false
  return deal.agencyId === user.agencyId
}

/** 案件を編集できるか(§9.4) */
export function canEditDeal(user: User, deal: Deal): boolean {
  if (user.role === 'hq') return true
  if (!user.agencyId || deal.agencyId !== user.agencyId) return false
  if (user.role === 'agency_admin') return true
  // 一般ユーザーは自分の担当案件のみ。自社の他担当者案件は閲覧専用(§2.3 / §9.4)
  return deal.ownerUserId === user.id
}

/** 案件一覧の既定スコープ */
export function visibleDeals(user: User, deals: Deal[]): Deal[] {
  return deals.filter((d) => canViewDeal(user, d))
}

/** ダッシュボードの集計範囲(§18.1) */
export function dashboardScope(user: User, deals: Deal[]): Deal[] {
  if (user.role === 'hq') return deals
  if (!user.agencyId) return []
  const mine = deals.filter((d) => d.agencyId === user.agencyId)
  if (user.role === 'agency_admin') return mine
  return mine.filter((d) => d.ownerUserId === user.id)
}

/** 案件詳細の基本情報で本部限定の項目(§9.3) */
export const HQ_ONLY_DEAL_FIELDS = ['所属代理店', '案件ID', '登録者'] as const

export function canSeeHqOnlyDealFields(user: Pick<User, 'role'>): boolean {
  return user.role === 'hq'
}

/** 代理店ユーザーの登録・編集は代理店管理者が主体。本部は閲覧専用(§17) */
export function canManageAgencyUsers(user: User, agencyId: string | null): boolean {
  if (user.role !== 'agency_admin') return false
  return !!user.agencyId && user.agencyId === agencyId
}

/** 通知は本人限定(§15.1) */
export function canSeeNotification(user: User, recipientUserId: string): boolean {
  return user.id === recipientUserId
}

export const ROLE_LABEL: Record<Role, string> = {
  hq: '本部管理者',
  agency_admin: '代理店管理者',
  agency_member: '代理店一般ユーザー',
}
