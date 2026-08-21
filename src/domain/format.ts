import type { DealStatus, Judgement, ReviewState, SalesStatus } from './types'

/** 3桁区切り。空欄(null)と0円を区別する(§12.2)。 */
export function formatYen(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return `${v.toLocaleString('ja-JP')}円`
}

export function formatNumber(v: number): string {
  return v.toLocaleString('ja-JP')
}

/** 入力文字列を金額へ。空欄はnull、負数・数字以外はエラー(§12.2)。 */
export function parseAmount(raw: string): { value: number | null; error: string | null } {
  const s = (raw ?? '').trim()
  if (s === '') return { value: null, error: null }
  // マイナスは専用のメッセージを出したいので、符号だけは形式チェックを通す。
  // カンマは正しい3桁区切りのときだけ認める(「1,,2」のような入力は弾く)。
  if (!/^-?(\d+|\d{1,3}(,\d{3})+)$/.test(s)) {
    return { value: null, error: '半角数字で入力してください' }
  }
  const n = Number(s.replace(/,/g, ''))
  if (!Number.isFinite(n)) return { value: null, error: '金額として読み取れません' }
  if (n < 0) return { value: null, error: 'マイナスは入力できません' }
  return { value: n, error: null }
}

export const STATUS_LABEL: Record<DealStatus, string> = {
  planned: '営業予定登録',
  meeting: '商談',
  quoted: '見積提出',
  ordered: '受注確定',
}

export const STATUS_ORDER: DealStatus[] = ['planned', 'meeting', 'quoted', 'ordered']

/** 主要業務フロー5段階(§1) */
export const FLOW_STEPS = [
  { key: 'inquiry', label: '営業可否照会' },
  { key: 'planned', label: '営業予定登録' },
  { key: 'meeting', label: '商談' },
  { key: 'quoted', label: '見積提出' },
  { key: 'ordered', label: '受注確定' },
] as const

export const JUDGEMENT_LABEL: Record<Judgement, string> = {
  clear: '重複なし:自動承認',
  similar: '重複の可能性あり:重複審査待ち',
  reserved: 'Reserved案件:営業不可',
  ordered: '受注案件:営業不可',
}

export const JUDGEMENT_TONE: Record<Judgement, 'ok' | 'warn' | 'danger'> = {
  clear: 'ok',
  similar: 'warn',
  reserved: 'danger',
  ordered: 'danger',
}

export const REVIEW_STATE_LABEL: Record<ReviewState, string> = {
  none: '審査不要',
  pending: '重複審査待ち',
  approved: '承認済み',
  blocked: '営業不可',
  returned: '差し戻し',
}

export const SALES_STATUS_LABEL: Record<SalesStatus, string> = {
  active: '販売中',
  suspended: '停止中',
}

export function statusIndex(status: DealStatus): number {
  return STATUS_ORDER.indexOf(status)
}
