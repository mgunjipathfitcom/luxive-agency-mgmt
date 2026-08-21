/**
 * ダッシュボード集計(§18)
 * カードと遷移先の一覧は必ずこの同じ集計関数を使用する(§18.6)。
 */
import { isWithin, today } from './dates'
import { remainingDays } from './protection'
import type { DB, Deal, DealStatus, Settings, User } from './types'
import { dashboardScope } from './permissions'

export interface Period {
  from: string
  to: string
  label: string
}

export interface Metric {
  key: string
  label: string
  value: number
  unit: string
  dealIds: string[]
  note: string
}

/** 企業単位でまとめた内訳(有効契約・受注企業数のドリルダウン用) */
export interface CompanyGroup {
  key: string
  companyName: string
  dealIds: string[]
}

export interface DashboardResult {
  scopeLabel: string
  period: Period
  activeOrderCompanies: Metric & { companyNames: string[]; companyGroups: CompanyGroup[] }
  meetings: Metric
  quoteAmount: Metric
  orderAmount: Metric
  expiringSoon: Metric
  statusCounts: Record<DealStatus, number>
  pendingReviewCount: number
  scopedDeals: Deal[]
}

/** 案件が初めて「商談以降」へ到達した日(§18.3) */
export function firstAdvancedDate(deal: Deal): string | null {
  const dates = (['meeting', 'quoted', 'ordered'] as DealStatus[])
    .map((s) => deal.firstReachedAt[s])
    .filter((v): v is string => !!v)
    .sort()
  return dates[0] ?? null
}

/** 最新の有効な見積スナップショット(取消・無効を除外)(§18.4) */
export function latestValidQuote(deal: Deal, period: Period) {
  const list = deal.amountHistory
    .filter((s) => !s.voided && s.quoteDate && s.quoteTotal > 0)
    .filter((s) => isWithin(s.quoteDate as string, period.from, period.to))
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
  return list[list.length - 1] ?? null
}

/** 期間内の受注(初回＋追加)(§18.5) */
export function ordersInPeriod(deal: Deal, period: Period) {
  return deal.orders.filter((o) => !o.voided && isWithin(o.orderDate, period.from, period.to))
}

export function buildDashboard(
  db: Pick<DB, 'deals' | 'reviews'>,
  user: User,
  period: Period,
  settings: Settings,
  base = today(),
): DashboardResult {
  const scoped = dashboardScope(user, db.deals).filter((d) => d.reviewState !== 'blocked')
  const protectedDeals = scoped.filter((d) => d.protectionExpiresAt >= base)

  // 18.2 有効契約・受注企業数
  const orderCompanyMap = new Map<string, string[]>()
  for (const d of protectedDeals) {
    if (d.status !== 'ordered') continue
    // 受注イベントがすべて取消された案件は有効契約に数えない
    if (d.orders.length > 0 && !d.orders.some((o) => !o.voided)) continue
    const key = d.companyNameNorm || d.companyName
    const arr = orderCompanyMap.get(key) ?? []
    arr.push(d.id)
    orderCompanyMap.set(key, arr)
  }
  const activeOrderDealIds = [...orderCompanyMap.values()].flat()
  const companyGroups: CompanyGroup[] = [...orderCompanyMap.entries()].map(([key, dealIds]) => {
    const first = protectedDeals.find((d) => (d.companyNameNorm || d.companyName) === key)
    return { key, companyName: first?.companyName ?? key, dealIds }
  })
  const companyNames = companyGroups.map((g) => g.companyName)

  // 18.3 商談数
  const meetingDeals = protectedDeals.filter((d) => {
    const at = firstAdvancedDate(d)
    return !!at && isWithin(at, period.from, period.to)
  })

  // 18.4 見積金額
  let quoteTotal = 0
  const quoteDealIds: string[] = []
  for (const d of protectedDeals) {
    const snap = latestValidQuote(d, period)
    if (snap) {
      quoteTotal += snap.quoteTotal
      quoteDealIds.push(d.id)
    }
  }

  // 18.5 受注金額
  let orderTotal = 0
  const orderDealIds: string[] = []
  for (const d of protectedDeals) {
    if (d.status !== 'ordered') continue
    const evs = ordersInPeriod(d, period)
    if (evs.length === 0) continue
    orderTotal += evs.reduce((s, o) => s + o.total, 0)
    orderDealIds.push(d.id)
  }

  // 18.6 保護期限間近
  const expiring = protectedDeals.filter((d) => remainingDays(d.protectionExpiresAt, base) <= settings.warningDays)

  const statusCounts: Record<DealStatus, number> = { planned: 0, meeting: 0, quoted: 0, ordered: 0 }
  for (const d of scoped) statusCounts[d.status] += 1

  const pendingReviewCount = db.reviews.filter(
    (r) => r.state === 'pending' && (user.role === 'hq' || r.agencyId === user.agencyId),
  ).length

  const scopeLabel =
    user.role === 'hq' ? '全代理店' : user.role === 'agency_admin' ? '自社全体' : '自分の担当案件'

  return {
    scopeLabel,
    period,
    activeOrderCompanies: {
      key: 'activeOrderCompanies',
      label: '有効契約・受注企業数',
      value: orderCompanyMap.size,
      unit: '社',
      dealIds: activeOrderDealIds,
      note: '受注確定かつ保護期限内。企業名でユニーク化',
      companyNames,
      companyGroups,
    },
    meetings: {
      key: 'meetings',
      label: '商談数',
      value: meetingDeals.length,
      unit: '件',
      dealIds: meetingDeals.map((d) => d.id),
      note: '期間内に初めて商談以降へ到達し、いまも保護期限内の案件',
    },
    quoteAmount: {
      key: 'quoteAmount',
      label: '見積金額',
      value: quoteTotal,
      unit: '円',
      dealIds: quoteDealIds,
      note: '期間内の最新の有効見積。取消・無効は除外',
    },
    orderAmount: {
      key: 'orderAmount',
      label: '受注金額',
      value: orderTotal,
      unit: '円',
      dealIds: orderDealIds,
      note: '期間内の初回受注＋追加受注。取消・無効は除外',
    },
    expiringSoon: {
      key: 'expiringSoon',
      label: '保護期限間近',
      value: expiring.length,
      unit: '件',
      dealIds: expiring.map((d) => d.id),
      note: `保護期限まで${settings.warningDays}日以内。期限切れは含まない`,
    },
    statusCounts,
    pendingReviewCount,
    scopedDeals: scoped,
  }
}
