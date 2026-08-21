/**
 * データ永続化(§20.1)
 * 業務データ: localStorage / 営業可否照会の引継ぎ: sessionStorage / 商品画像: Data URL
 * 本番では認証済みAPI・サーバー側認可・クラウドストレージへ差し替える(§20.2)。
 */
import type { DB, EligibilityDraft } from '../domain/types'
import { SCHEMA_VERSION, buildSeed } from './seed'

const DB_KEY = 'luxive.db'
const DB_BACKUP_KEY = 'luxive.db.backup'
const SESSION_KEY = 'luxive.session'
const DRAFT_KEY = 'luxive.eligibilityDraft'

function safeLocal(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function safeSession(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function loadDB(): DB {
  const ls = safeLocal()
  if (!ls) return buildSeed()
  const raw = ls.getItem(DB_KEY)
  if (!raw) {
    const fresh = buildSeed()
    saveDB(fresh)
    return fresh
  }
  try {
    const parsed = JSON.parse(raw) as DB
    if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION) {
      // 形が変わったので初期データを作り直す。ただし元の中身は消さずに退避する。
      backupRaw(ls, raw, parsed?.schemaVersion)
      const fresh = buildSeed()
      saveDB(fresh)
      return fresh
    }
    return parsed
  } catch {
    backupRaw(ls, raw, 'broken')
    const fresh = buildSeed()
    saveDB(fresh)
    return fresh
  }
}

/** 作り直す前のデータを退避する。上書きで失うことを避けるための保険。 */
function backupRaw(ls: Storage, raw: string, version: number | string | undefined): void {
  try {
    const base = `${DB_BACKUP_KEY}.v${version ?? 'unknown'}`
    // 同じバージョンのバックアップが既にあるときは上書きせず、連番を足す
    let key = base
    for (let i = 2; ls.getItem(key) !== null && i < 100; i++) key = `${base}.${i}`
    ls.setItem(key, raw)
    console.warn(
      `[luxive] 保存形式が変わったため初期データを作り直しました。元のデータは ${key} に残しています。`,
    )
  } catch {
    // 退避に失敗しても画面は継続させる
  }
}

export function saveDB(db: DB): void {
  const ls = safeLocal()
  if (!ls) return
  try {
    ls.setItem(DB_KEY, JSON.stringify(db))
  } catch {
    // 画像を含むと容量超過しうる。保存できなくても画面操作は継続させる。
    console.warn('[luxive] localStorageへの保存に失敗しました(容量超過の可能性)')
  }
}

export function resetDB(): DB {
  const fresh = buildSeed()
  saveDB(fresh)
  clearDraft()
  return fresh
}

export function loadSessionUserId(): string | null {
  const ls = safeLocal()
  if (!ls) return null
  return ls.getItem(SESSION_KEY)
}

export function saveSessionUserId(userId: string | null): void {
  const ls = safeLocal()
  if (!ls) return
  if (userId) ls.setItem(SESSION_KEY, userId)
  else ls.removeItem(SESSION_KEY)
}

/** 営業可否照会 → 営業予定登録 の引継ぎ(§5.2) */
export function saveDraft(draft: EligibilityDraft): void {
  const ss = safeSession()
  if (!ss) return
  ss.setItem(DRAFT_KEY, JSON.stringify(draft))
}

export function loadDraft(): EligibilityDraft | null {
  const ss = safeSession()
  if (!ss) return null
  const raw = ss.getItem(DRAFT_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as EligibilityDraft
  } catch {
    return null
  }
}

/** 登録処理の開始時に引継ぎ用データを削除する(§5.3) */
export function clearDraft(): void {
  const ss = safeSession()
  if (!ss) return
  ss.removeItem(DRAFT_KEY)
}
