/**
 * 重複判定(§4)
 * 営業可否照会と営業予定登録は、この共通判定関数を使用する(§4.1)。
 *
 * 判定優先順位(§4.2)
 *   1. Reserved案件一致        -> reserved
 *   2. 有効な受注案件一致      -> ordered
 *   3. 正規化企業名の完全一致  -> similar(スコア・閾値に関係なく必ず重複候補)
 *   4. 連絡先の完全一致        -> similar(設定でON/OFF)
 *   5. スコアが閾値以上        -> similar
 *   6. いずれも該当なし        -> clear
 */
import { today } from './dates'
import {
  normalizeCompanyName,
  normalizeDomain,
  normalizeFacilityName,
  normalizePhone,
  similarity,
} from './normalize'
import { isActiveOrder } from './protection'
import type {
  DB,
  Deal,
  DuplicateCandidate,
  JudgeInput,
  JudgeResult,
  ReservedCase,
  Settings,
} from './types'

interface Fields {
  companyNameNorm: string
  facilityNameNorm: string
  phoneNorm: string
  websiteDomain: string
}

export function normalizeFields(input: {
  companyName: string
  facilityName: string
  phone: string
  website: string
}): Fields {
  return {
    companyNameNorm: normalizeCompanyName(input.companyName),
    facilityNameNorm: normalizeFacilityName(input.facilityName),
    phoneNorm: normalizePhone(input.phone),
    websiteDomain: normalizeDomain(input.website) ?? '',
  }
}

/** 同一企業とみなせるか(企業名・電話番号・Webドメインのいずれかが完全一致) */
function identityMatch(a: Fields, b: Fields): boolean {
  if (a.companyNameNorm && a.companyNameNorm === b.companyNameNorm) return true
  if (a.phoneNorm && a.phoneNorm === b.phoneNorm) return true
  if (a.websiteDomain && a.websiteDomain === b.websiteDomain) return true
  return false
}

/**
 * 施設の整合性。
 * どちらかが施設名を持たない場合は「企業全体」を指すとみなして一致扱いにする。
 * 双方が施設名を持ち、それが異なる場合のみ別施設として即時停止の対象外にする
 * (企業名完全一致による重複候補としては引き続き拾う)。
 */
function facilityCompatible(a: Fields, b: Fields): boolean {
  if (!a.facilityNameNorm || !b.facilityNameNorm) return true
  return a.facilityNameNorm === b.facilityNameNorm
}

/**
 * Webドメインの一致度。
 * 完全一致は満点。片方がもう片方のサブドメイン(例: shop.example.co.jp と example.co.jp)のときだけ部分点。
 * 「登録可能ドメインが同じ」だけでは加点しない(example.jp のような共通の親を持つ別会社を拾ってしまうため)。
 */
function domainScore(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.endsWith(`.${b}`) || b.endsWith(`.${a}`)) return 0.7
  return 0
}

export interface ScoreBreakdown {
  score: number
  matched: string[]
  unmatched: string[]
  parts: { label: string; weight: number; ratio: number; points: number }[]
}

/** 重複可能性スコア(§4.6)。0〜100の補助スコア。 */
export function scoreCandidate(a: Fields, b: Fields, settings: Settings): ScoreBreakdown {
  const parts = [
    {
      label: '企業名',
      weight: settings.weightCompanyName,
      ratio: similarity(a.companyNameNorm, b.companyNameNorm),
    },
    {
      label: '電話番号',
      weight: settings.weightPhone,
      ratio: a.phoneNorm && b.phoneNorm && a.phoneNorm === b.phoneNorm ? 1 : 0,
    },
    {
      label: 'Webドメイン',
      weight: settings.weightWebDomain,
      ratio: domainScore(a.websiteDomain, b.websiteDomain),
    },
    {
      label: '施設名',
      weight: settings.weightFacilityName,
      ratio: similarity(a.facilityNameNorm, b.facilityNameNorm),
    },
  ].map((p) => ({ ...p, points: p.weight * p.ratio }))

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0)
  const achieved = parts.reduce((s, p) => s + p.points, 0)
  const score = totalWeight > 0 ? Math.round((achieved / totalWeight) * 100) : 0

  const matched = parts.filter((p) => p.ratio >= 0.999).map((p) => p.label)
  const unmatched = parts.filter((p) => p.ratio < 0.999).map((p) => p.label)
  return { score, matched, unmatched, parts }
}

function reservedFields(r: ReservedCase): Fields {
  return {
    companyNameNorm: r.companyNameNorm,
    facilityNameNorm: r.facilityNameNorm,
    phoneNorm: r.phoneNorm,
    websiteDomain: r.websiteDomain,
  }
}

function dealFields(d: Deal): Fields {
  return {
    companyNameNorm: d.companyNameNorm,
    facilityNameNorm: d.facilityNameNorm,
    phoneNorm: d.phoneNorm,
    websiteDomain: d.websiteDomain,
  }
}

/** 重複候補として画面に出す下限スコア(これ未満は審査の参考にならない) */
const CANDIDATE_FLOOR = 25

const JUDGEMENT_LABEL: Record<JudgeResult['judgement'], string> = {
  clear: '重複なし:自動承認',
  similar: '重複の可能性あり:重複審査待ち',
  reserved: 'Reserved案件:営業不可',
  ordered: '受注案件:営業不可',
}

export function judgementLabel(j: JudgeResult['judgement']): string {
  return JUDGEMENT_LABEL[j]
}

/**
 * 共通の重複判定関数。
 * 営業可否照会・営業予定登録の双方から呼び、簡易照会の結果を最終判定に流用しない(§4.1)。
 */
export function judge(
  input: JudgeInput,
  db: Pick<DB, 'deals' | 'reserved'>,
  settings: Settings,
  base = today(),
): JudgeResult {
  const q = normalizeFields(input)
  const candidates: DuplicateCandidate[] = []

  let reservedHit: DuplicateCandidate | null = null
  let orderedHit: DuplicateCandidate | null = null
  let companyExact = false
  let contactExact = false
  // 企業名・連絡先が完全一致した候補は、スコアが低くても比較画面から落とさない
  const mustKeep = new Set<string>()

  for (const r of db.reserved) {
    if (!r.active) continue
    const f = reservedFields(r)
    const sb = scoreCandidate(q, f, settings)
    const idMatch = identityMatch(q, f)
    if (!idMatch && sb.score <= 0) continue
    const blocked = idMatch && facilityCompatible(q, f)
    const cand: DuplicateCandidate = {
      kind: 'reserved',
      refId: r.id,
      score: blocked ? Math.max(sb.score, 100) : sb.score,
      matched: sb.matched,
      unmatched: sb.unmatched,
      reason: blocked
        ? 'Reserved案件として本部が営業対象外に指定しています'
        : 'Reserved案件と企業情報が近いため確認が必要です',
      protectionState: 'reserved',
      recommendation: blocked ? 'block' : 'check',
    }
    candidates.push(cand)
    if (blocked && !reservedHit) reservedHit = cand
    if (blocked) mustKeep.add(r.id)
    if (q.companyNameNorm && q.companyNameNorm === f.companyNameNorm) {
      companyExact = true
      mustKeep.add(r.id)
    }
  }

  for (const d of db.deals) {
    if (input.excludeDealId && d.id === input.excludeDealId) continue
    if (d.reviewState === 'blocked') continue
    const f = dealFields(d)
    const sb = scoreCandidate(q, f, settings)
    const idMatch = identityMatch(q, f)
    if (!idMatch && sb.score <= 0) continue

    const active = isActiveOrder(d, base)
    const stillProtected = d.protectionExpiresAt >= base
    const blockedByOrder = active && idMatch && facilityCompatible(q, f)

    const cand: DuplicateCandidate = {
      kind: 'deal',
      refId: d.id,
      score: blockedByOrder ? Math.max(sb.score, 100) : sb.score,
      matched: sb.matched,
      unmatched: sb.unmatched,
      reason: blockedByOrder
        ? '有効な受注案件が存在します(保護期限内)'
        : active
          ? '同一企業の受注案件がありますが、施設が異なります'
          : stillProtected
            ? '保護期間中の案件と一致・類似しています'
            : '保護期限切れの過去案件と一致・類似しています',
      protectionState: stillProtected ? 'active' : 'expired',
      recommendation: blockedByOrder ? 'block' : stillProtected ? 'check' : 'approve',
    }
    candidates.push(cand)
    if (blockedByOrder && !orderedHit) orderedHit = cand
    if (blockedByOrder) mustKeep.add(d.id)
    if (q.companyNameNorm && q.companyNameNorm === f.companyNameNorm) {
      companyExact = true
      mustKeep.add(d.id)
    }
    if (
      (q.phoneNorm && q.phoneNorm === f.phoneNorm) ||
      (q.websiteDomain && q.websiteDomain === f.websiteDomain)
    ) {
      contactExact = true
      mustKeep.add(d.id)
    }
  }

  // 参考にならないほど弱い候補は落とす。閾値未満の切り捨てなので判定結果は変わらない。
  const floor = Math.min(CANDIDATE_FLOOR, settings.duplicateThreshold)
  candidates.sort((a, b) => b.score - a.score)
  const trimmed = candidates
    .filter((c) => c.score >= floor || c.recommendation === 'block' || mustKeep.has(c.refId))
    .slice(0, 12)
  const topScore = trimmed.length > 0 ? Math.min(100, trimmed[0]!.score) : 0

  const normalized = {
    companyNameNorm: q.companyNameNorm,
    facilityNameNorm: q.facilityNameNorm,
    phoneNorm: q.phoneNorm,
    websiteDomain: q.websiteDomain,
  }

  if (reservedHit) {
    return {
      judgement: 'reserved',
      topScore: 100,
      candidates: trimmed,
      reasonCode: 'reserved-hit',
      reasonText: 'Reserved案件と一致しました。本部が営業対象外に指定しているため営業できません。',
      normalized,
    }
  }
  if (orderedHit) {
    return {
      judgement: 'ordered',
      topScore: 100,
      candidates: trimmed,
      reasonCode: 'active-order-hit',
      reasonText: '保護期限内の受注案件と一致しました。営業できません。',
      normalized,
    }
  }
  if (companyExact) {
    return {
      judgement: 'similar',
      topScore,
      candidates: trimmed,
      reasonCode: 'company-name-exact',
      reasonText:
        '法人格などを除いた企業名が既存の登録と完全に一致しました。スコアに関係なく重複審査へ回します。',
      normalized,
    }
  }
  if (contactExact && settings.forceContactExactSimilar) {
    return {
      judgement: 'similar',
      topScore,
      candidates: trimmed,
      reasonCode: 'contact-exact',
      reasonText: '電話番号またはWebドメインが既存の登録と完全に一致しました。重複審査へ回します。',
      normalized,
    }
  }
  if (topScore >= settings.duplicateThreshold) {
    return {
      judgement: 'similar',
      topScore,
      candidates: trimmed,
      reasonCode: 'score-threshold',
      reasonText: `重複可能性スコアが閾値(${settings.duplicateThreshold}%)以上です。重複審査へ回します。`,
      normalized,
    }
  }
  return {
    judgement: 'clear',
    topScore,
    candidates: trimmed,
    reasonCode: 'no-match',
    reasonText: '一致・類似する登録は見つかりませんでした。自動承認できます。',
    normalized,
  }
}

/** 判定が営業不可(即時停止)か */
export function isBlocking(j: JudgeResult['judgement']): boolean {
  return j === 'reserved' || j === 'ordered'
}
