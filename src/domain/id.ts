let counter = 0

/** 連番＋時刻ベースのID。モック用途のため衝突耐性は簡易で足りる。 */
export function newId(prefix: string): string {
  counter += 1
  const t = Date.now().toString(36).slice(-6)
  const c = counter.toString(36).padStart(3, '0')
  return `${prefix}-${t}${c}`.toUpperCase()
}

/** 案件IDは人が読める形式にする(例: DL-2026-0007) */
export function newDealId(existing: string[], year: number): string {
  const prefix = `DL-${year}-`
  const nums = existing
    .filter((id) => id.startsWith(prefix))
    .map((id) => Number(id.slice(prefix.length)))
    .filter((n) => Number.isFinite(n))
  const next = (nums.length ? Math.max(...nums) : 0) + 1
  return `${prefix}${String(next).padStart(4, '0')}`
}
