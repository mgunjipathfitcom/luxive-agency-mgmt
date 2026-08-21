import { addDays } from '../../src/domain/dates'
import { DEFAULT_SETTINGS } from '../../src/domain/protection'
import {
  normalizeCompanyName,
  normalizeDomain,
  normalizeFacilityName,
  normalizePhone,
} from '../../src/domain/normalize'
import type { Deal, DealStatus, ReservedCase, Settings, User } from '../../src/domain/types'

export const TODAY = '2026-08-21'

export function settings(patch: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...patch }
}

/** 旧localStorageに残っていた設定(§4.4) */
export function legacySettings(): Settings {
  return settings({ weightCompanyName: 40, duplicateThreshold: 50 })
}

export function deal(patch: Partial<Deal> & { id: string; companyName: string }): Deal {
  const base: Deal = {
    id: patch.id,
    agencyId: 'AG-01',
    ownerUserId: 'U-A1-M1',
    createdByUserId: 'U-A1-M1',
    companyName: patch.companyName,
    companyNameNorm: normalizeCompanyName(patch.companyName),
    facilityName: '',
    facilityNameNorm: '',
    phone: '',
    phoneNorm: '',
    website: '',
    websiteDomain: '',
    contactPersonName: '',
    contactPersonContact: '',
    status: 'planned',
    fromInquiry: true,
    judgement: 'clear',
    reviewState: 'none',
    protectionStartAt: TODAY,
    protectionExpiresAt: addDays(TODAY, 30),
    firstReachedAt: { planned: TODAY },
    lastOrderDate: null,
    createdAt: `${TODAY}T09:00:00.000Z`,
    updatedAt: `${TODAY}T09:00:00.000Z`,
    lines: [],
    activities: [],
    amountHistory: [],
    orders: [],
    changes: [],
    blockedReason: '',
  }
  const merged: Deal = { ...base, ...patch }
  merged.companyNameNorm = normalizeCompanyName(merged.companyName)
  merged.facilityNameNorm = normalizeFacilityName(merged.facilityName)
  merged.phoneNorm = normalizePhone(merged.phone)
  merged.websiteDomain = normalizeDomain(merged.website) ?? ''
  return merged
}

export function orderedDeal(
  id: string,
  companyName: string,
  opts: { expiresAt: string; facilityName?: string; phone?: string; website?: string; total?: number; orderDate?: string },
): Deal {
  const orderDate = opts.orderDate ?? addDays(opts.expiresAt, -365)
  const total = opts.total ?? 100000
  return deal({
    id,
    companyName,
    facilityName: opts.facilityName ?? '',
    phone: opts.phone ?? '',
    website: opts.website ?? '',
    status: 'ordered' as DealStatus,
    protectionStartAt: orderDate,
    protectionExpiresAt: opts.expiresAt,
    firstReachedAt: { planned: orderDate, ordered: orderDate },
    lastOrderDate: orderDate,
    orders: [
      {
        id: `${id}-OD1`,
        kind: 'initial',
        orderDate,
        lines: [{ productName: 'ルミエール ディフューザー', amount: total }],
        total,
        authorUserId: 'U-A1-M1',
        createdAt: `${orderDate}T09:00:00.000Z`,
        voided: false,
      },
    ],
    amountHistory: [
      {
        id: `${id}-AM1`,
        registeredAt: orderDate,
        quoteDate: orderDate,
        orderDate,
        lines: [
          { productName: 'ルミエール ディフューザー', proposed: true, quoteAmount: total, orderAmount: total },
        ],
        quoteTotal: total,
        orderTotal: total,
        orderKind: 'initial',
        authorUserId: 'U-A1-M1',
        createdAt: `${orderDate}T09:00:00.000Z`,
        voided: false,
      },
    ],
  })
}

export function reserved(patch: Partial<ReservedCase> & { id: string; companyName: string }): ReservedCase {
  const base: ReservedCase = {
    id: patch.id,
    companyName: patch.companyName,
    companyNameNorm: '',
    facilityName: '',
    facilityNameNorm: '',
    phone: '',
    phoneNorm: '',
    website: '',
    websiteDomain: '',
    reason: 'テスト',
    registeredAt: `${TODAY}T09:00:00.000Z`,
    active: true,
  }
  const merged = { ...base, ...patch }
  merged.companyNameNorm = normalizeCompanyName(merged.companyName)
  merged.facilityNameNorm = normalizeFacilityName(merged.facilityName)
  merged.phoneNorm = normalizePhone(merged.phone)
  merged.websiteDomain = normalizeDomain(merged.website) ?? ''
  return merged
}

export function user(patch: Partial<User> & { id: string; role: User['role'] }): User {
  return {
    agencyId: patch.role === 'hq' ? null : 'AG-01',
    name: patch.id,
    email: `${patch.id}@example.jp`,
    department: '営業部',
    employment: 'active',
    account: 'active',
    invitedAt: null,
    lastLoginAt: null,
    createdAt: `${TODAY}T09:00:00.000Z`,
    ...patch,
  }
}
