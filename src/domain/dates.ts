/**
 * 日付ユーティリティ。すべて 'YYYY-MM-DD' の日付文字列で扱う。
 * 保護期限は日数単位に統一する(§10.1)。
 */

let clockOverride: string | null = null

/** テスト・デモ用に「現在日」を固定する。nullで実時刻に戻す。 */
export function setClock(dateISO: string | null): void {
  clockOverride = dateISO
}

export function today(): string {
  if (clockOverride) return clockOverride
  return toDateISO(new Date())
}

export function nowISO(): string {
  if (clockOverride) return `${clockOverride}T09:00:00.000Z`
  return new Date().toISOString()
}

export function toDateISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parse(dateISO: string): Date {
  const [y, m, d] = dateISO.slice(0, 10).split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

/**
 * 'YYYY-MM-DD' として妥当か。空欄・不正日付をドメイン側でも弾くために使う。
 * 余分な文字が付いた値(例: 2026-08-21junk)も弾くため、文字列全体を検証する。
 */
export function isValidDateISO(value: string | null | undefined): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return false
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

export function addDays(dateISO: string, days: number): string {
  const d = parse(dateISO)
  d.setDate(d.getDate() + days)
  return toDateISO(d)
}

/** b - a を日数で返す */
export function diffDays(aISO: string, bISO: string): number {
  const a = parse(aISO).getTime()
  const b = parse(bISO).getTime()
  return Math.round((b - a) / 86400000)
}

export function maxDate(a: string, b: string): string {
  return a >= b ? a : b
}

export function isWithin(dateISO: string, fromISO: string, toISO: string): boolean {
  const d = dateISO.slice(0, 10)
  return d >= fromISO && d <= toISO
}

/**
 * 表示用: 2026-08-21 -> 2026/08/21
 * 日時(ISO文字列)を渡された場合は現地時刻の日付にする。
 * UTCの日付をそのまま切り出すと、日本時間の夜に前日が出てしまうため。
 */
export function formatDate(dateISO: string | null | undefined): string {
  if (!dateISO) return '—'
  if (dateISO.includes('T')) {
    const d = new Date(dateISO)
    if (!Number.isNaN(d.getTime())) return toDateISO(d).replace(/-/g, '/')
  }
  return dateISO.slice(0, 10).replace(/-/g, '/')
}

/** 表示用: ISO日時 -> 2026/08/21 09:00 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return formatDate(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 期間プリセット */
export type PeriodKey = 'this-month' | 'last-month' | 'last-90' | 'this-year' | 'all'

export function periodRange(key: PeriodKey, base = today()): { from: string; to: string; label: string } {
  const d = parse(base)
  const y = d.getFullYear()
  const m = d.getMonth()
  switch (key) {
    case 'this-month':
      return { from: toDateISO(new Date(y, m, 1)), to: toDateISO(new Date(y, m + 1, 0)), label: '今月' }
    case 'last-month':
      return { from: toDateISO(new Date(y, m - 1, 1)), to: toDateISO(new Date(y, m, 0)), label: '先月' }
    case 'last-90':
      return { from: addDays(base, -89), to: base, label: '直近90日' }
    case 'this-year':
      return { from: toDateISO(new Date(y, 0, 1)), to: toDateISO(new Date(y, 11, 31)), label: '今年' }
    case 'all':
    default:
      return { from: '1900-01-01', to: '2999-12-31', label: '全期間' }
  }
}
