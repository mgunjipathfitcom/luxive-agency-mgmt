/**
 * 保護期間の計算(§10)
 * 残り日数は保存せず、保護期限 - 現在日 で毎回算出する(§10.6)。
 */
import { addDays, diffDays, maxDate, today } from './dates'
import type { Deal, DealStatus, Settings } from './types'

export const DEFAULT_SETTINGS: Settings = {
  plannedDays: 30,
  meetingDays: 90,
  quotedDays: 90,
  orderDays: 365,
  additionalOrderDays: 365,
  warningDays: 30,
  duplicateThreshold: 50,
  weightCompanyName: 50,
  weightPhone: 25,
  weightWebDomain: 20,
  weightFacilityName: 5,
  forceContactExactSimilar: true,
}

export function protectionDaysFor(status: DealStatus, settings: Settings): number {
  switch (status) {
    case 'planned':
      return settings.plannedDays
    case 'meeting':
      return settings.meetingDays
    case 'quoted':
      return settings.quotedDays
    case 'ordered':
      return settings.orderDays
  }
}

export interface ProtectionCalcInput {
  status: DealStatus
  /** ステータス変更日(受注確定のときは受注日) */
  changeDate: string
  /** 既存の保護期限(新規なら null) */
  currentExpiresAt: string | null
  /** 既存の保護開始日(新規なら null) */
  currentStartAt: string | null
  settings: Settings
}

export interface ProtectionCalcResult {
  startAt: string
  expiresAt: string
  /** 既存期限の方が長かったため短縮しなかった(§10.3 / §10.4) */
  keptLonger: boolean
  days: number
}

/**
 * ステータスに応じた保護期間を計算する(§10.2〜§10.5)。
 * - 営業予定登録: 変更日を保護開始日とし、変更日 + plannedDays
 * - 商談 / 見積提出: 変更日 + 対応日数。既存期限の方が長い場合は短縮しない
 * - 受注確定 / 追加受注: 受注日を保護開始日とし、受注日 + orderDays
 */
export function calcProtection(input: ProtectionCalcInput): ProtectionCalcResult {
  const { status, changeDate, currentExpiresAt, currentStartAt, settings } = input
  const days = protectionDaysFor(status, settings)
  const candidate = addDays(changeDate, days)

  if (status === 'planned' || status === 'ordered') {
    // 保護開始日を変更日(受注日)へ更新する
    return { startAt: changeDate, expiresAt: candidate, keptLonger: false, days }
  }

  const startAt = currentStartAt ?? changeDate
  if (currentExpiresAt && currentExpiresAt > candidate) {
    return { startAt, expiresAt: currentExpiresAt, keptLonger: true, days }
  }
  return { startAt, expiresAt: maxDate(candidate, currentExpiresAt ?? candidate), keptLonger: false, days }
}

/** 追加受注の保護期限(§13.2): 受注日 + additionalOrderDays */
export function calcAdditionalOrderProtection(orderDate: string, settings: Settings) {
  const days = settings.additionalOrderDays
  return { startAt: orderDate, expiresAt: addDays(orderDate, days), days }
}

/** 残り日数(保存しない・毎回算出) */
export function remainingDays(expiresAt: string, base = today()): number {
  return diffDays(base, expiresAt)
}

export function isProtected(deal: Pick<Deal, 'protectionExpiresAt'>, base = today()): boolean {
  return deal.protectionExpiresAt >= base
}

export type ProtectionState = 'active' | 'warning' | 'expired'

export function protectionState(
  expiresAt: string,
  settings: Settings,
  base = today(),
): ProtectionState {
  const left = remainingDays(expiresAt, base)
  if (left < 0) return 'expired'
  if (left <= settings.warningDays) return 'warning'
  return 'active'
}

/** 有効な受注案件か(§4.2の「有効な受注案件」) */
export function isActiveOrder(deal: Deal, base = today()): boolean {
  return deal.status === 'ordered' && deal.reviewState !== 'blocked' && deal.protectionExpiresAt >= base
}
