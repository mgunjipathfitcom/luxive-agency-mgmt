/**
 * 企業・施設(§16)
 * 本部管理者向けの顧客マスター。案件管理は案件単位、こちらは企業単位で見る。
 * 案件とReserved案件から企業単位に集約して構成する(集計の二重管理を避けるため)。
 */
import { today } from './dates'
import { isActiveOrder } from './protection'
import type { DB, Deal, ReservedCase } from './types'

export interface CompanyRecord {
  key: string
  companyName: string
  facilities: string[]
  phones: string[]
  domains: string[]
  agencyIds: string[]
  ownerUserIds: string[]
  deals: Deal[]
  reserved: ReservedCase[]
  hasActiveOrder: boolean
  hasOrder: boolean
  protectionExpiresAt: string | null
  protectionState: 'reserved' | 'active' | 'expired' | 'none'
  quoteTotal: number
  orderTotal: number
  lastUpdatedAt: string
}

export function buildCompanies(db: Pick<DB, 'deals' | 'reserved'>, base = today()): CompanyRecord[] {
  const map = new Map<string, CompanyRecord>()

  const ensure = (key: string, name: string): CompanyRecord => {
    let rec = map.get(key)
    if (!rec) {
      rec = {
        key,
        companyName: name,
        facilities: [],
        phones: [],
        domains: [],
        agencyIds: [],
        ownerUserIds: [],
        deals: [],
        reserved: [],
        hasActiveOrder: false,
        hasOrder: false,
        protectionExpiresAt: null,
        protectionState: 'none',
        quoteTotal: 0,
        orderTotal: 0,
        lastUpdatedAt: '',
      }
      map.set(key, rec)
    }
    return rec
  }

  const push = (arr: string[], v: string) => {
    if (v && !arr.includes(v)) arr.push(v)
  }

  for (const d of db.deals) {
    const key = d.companyNameNorm || d.companyName
    const rec = ensure(key, d.companyName)
    rec.deals.push(d)
    push(rec.facilities, d.facilityName)
    push(rec.phones, d.phone)
    push(rec.domains, d.websiteDomain)
    push(rec.agencyIds, d.agencyId)
    push(rec.ownerUserIds, d.ownerUserId)
    if (d.status === 'ordered') rec.hasOrder = true
    if (isActiveOrder(d, base)) rec.hasActiveOrder = true
    if (!rec.protectionExpiresAt || d.protectionExpiresAt > rec.protectionExpiresAt) {
      rec.protectionExpiresAt = d.protectionExpiresAt
    }
    const latestQuote = [...d.amountHistory].filter((s) => !s.voided && s.quoteTotal > 0).pop()
    rec.quoteTotal += latestQuote?.quoteTotal ?? 0
    rec.orderTotal += d.orders.filter((o) => !o.voided).reduce((s, o) => s + o.total, 0)
    if (d.updatedAt > rec.lastUpdatedAt) rec.lastUpdatedAt = d.updatedAt
  }

  for (const r of db.reserved) {
    if (!r.active) continue
    const key = r.companyNameNorm || r.companyName
    const rec = ensure(key, r.companyName)
    rec.reserved.push(r)
    push(rec.facilities, r.facilityName)
    push(rec.phones, r.phone)
    push(rec.domains, r.websiteDomain)
    if (r.registeredAt > rec.lastUpdatedAt) rec.lastUpdatedAt = r.registeredAt
  }

  for (const rec of map.values()) {
    if (rec.reserved.length > 0) rec.protectionState = 'reserved'
    else if (rec.protectionExpiresAt && rec.protectionExpiresAt >= base) rec.protectionState = 'active'
    else if (rec.protectionExpiresAt) rec.protectionState = 'expired'
    else rec.protectionState = 'none'
  }

  return [...map.values()].sort((a, b) => (a.lastUpdatedAt < b.lastUpdatedAt ? 1 : -1))
}
