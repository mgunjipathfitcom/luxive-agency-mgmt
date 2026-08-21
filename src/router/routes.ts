import type { Role } from '../domain/types'

export interface RouteDef {
  key: string
  /** hashのパス先頭セグメント */
  path: string
  label: string
  roles: Role[]
  group: 'main' | 'manage' | 'support'
  icon: string
  /** メニューに出さない(詳細画面など) */
  hidden?: boolean
}

/**
 * 画面定義。メニュー表示とRouterのアクセス判定の両方がこの定義だけを見る(§2.4)。
 * メニューを隠すだけでなく、hash直接入力・戻る操作でもここで拒否する。
 */
export const ROUTES: RouteDef[] = [
  { key: 'dashboard', path: 'dashboard', label: 'ダッシュボード', roles: ['hq', 'agency_admin', 'agency_member'], group: 'main', icon: 'chart' },
  { key: 'eligibility', path: 'eligibility', label: '営業可否照会', roles: ['agency_admin', 'agency_member'], group: 'main', icon: 'search' },
  { key: 'deal-new', path: 'deal-new', label: '営業予定登録', roles: ['agency_admin', 'agency_member'], group: 'main', icon: 'plus' },
  { key: 'deal-done', path: 'deal-done', label: '登録完了', roles: ['agency_admin', 'agency_member'], group: 'main', icon: 'check', hidden: true },
  { key: 'my-deals', path: 'my-deals', label: '担当案件', roles: ['agency_admin', 'agency_member'], group: 'main', icon: 'folder' },
  { key: 'deals', path: 'deals', label: '案件管理', roles: ['hq', 'agency_admin', 'agency_member'], group: 'main', icon: 'list' },
  { key: 'deal', path: 'deal', label: '案件詳細', roles: ['hq', 'agency_admin', 'agency_member'], group: 'main', icon: 'doc', hidden: true },
  { key: 'review', path: 'review', label: '重複審査', roles: ['hq'], group: 'manage', icon: 'shield' },
  { key: 'companies', path: 'companies', label: '企業・施設', roles: ['hq'], group: 'manage', icon: 'building' },
  { key: 'reserved', path: 'reserved', label: 'Reserved案件管理', roles: ['hq'], group: 'manage', icon: 'lock' },
  { key: 'products', path: 'products', label: '商品マスター', roles: ['hq'], group: 'manage', icon: 'box' },
  { key: 'agencies', path: 'agencies', label: '代理店', roles: ['hq'], group: 'manage', icon: 'store' },
  { key: 'agency-users', path: 'agency-users', label: '代理店ユーザー', roles: ['hq', 'agency_admin'], group: 'manage', icon: 'users' },
  { key: 'extensions', path: 'extensions', label: '延長申請', roles: ['hq', 'agency_admin', 'agency_member'], group: 'support', icon: 'clock' },
  { key: 'inquiries', path: 'inquiries', label: '問い合わせ管理', roles: ['hq', 'agency_admin', 'agency_member'], group: 'support', icon: 'mail' },
  { key: 'notifications', path: 'notifications', label: '通知・申請履歴', roles: ['hq', 'agency_admin', 'agency_member'], group: 'support', icon: 'bell' },
  { key: 'settings', path: 'settings', label: '基本設定', roles: ['hq'], group: 'support', icon: 'gear' },
  { key: 'audit', path: 'audit', label: '監査ログ', roles: ['hq'], group: 'support', icon: 'history' },
]

export function findRoute(path: string): RouteDef | null {
  return ROUTES.find((r) => r.path === path) ?? null
}

export function canAccessRoute(role: Role | null, path: string): boolean {
  if (!role) return false
  const route = findRoute(path)
  if (!route) return false
  return route.roles.includes(role)
}

export function menuFor(role: Role | null): RouteDef[] {
  if (!role) return []
  return ROUTES.filter((r) => !r.hidden && r.roles.includes(role))
}

/** ロールごとの入口 */
export function homePathFor(role: Role | null): string {
  if (!role) return 'dashboard'
  return 'dashboard'
}

/** ロール別のラベル差し替え(代理店では「案件管理」を「自社案件」と呼ぶ) */
export function routeLabel(route: RouteDef, role: Role | null): string {
  if (route.key === 'deals' && role !== 'hq') return '自社案件'
  return route.label
}
