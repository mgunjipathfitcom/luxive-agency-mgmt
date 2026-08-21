/**
 * 公開用ゲートの、パスワード照合とセッショントークンの発行・検証。
 *
 * Workerの実行環境に依存しないWeb Crypto APIだけを使う。
 * ここが一番間違えると危ないところなので、`npm test` から直接呼べるようにしてある
 * (tests/unit/gate-session.test.ts)。
 */

const encoder = new TextEncoder()

/** 一度入れたら12時間は再入力なし。延長はしない(居座りを作らない) */
export const SESSION_MS = 12 * 60 * 60 * 1000

export type TokenState = 'ok' | 'expired' | 'bad'

// ------------------------------------------------------------ 文字列の扱い

/**
 * 貼り付けたときに混ざりがちな全角・前後の空白を吸収する。
 * これが無いと「合っているのに通らない」という問い合わせが必ず出る。
 */
export function normalizePassword(raw: string): string {
  return raw.normalize('NFKC').trim()
}

export function toBase64Url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(s: string): Uint8Array | null {
  if (s.length === 0 || !/^[A-Za-z0-9_-]+$/.test(s)) return null
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  try {
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

/**
 * 長さの等しいバイト列を、内容によって早く抜けない形で比べる。
 * Cloudflare には crypto.subtle.timingSafeEqual があるが、
 * Node(テスト)には無いので自前の実装へ落とす。
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

// ---------------------------------------------------------------- 署名鍵

/**
 * 署名鍵をパスワードから導出する。
 *
 * こうしておくと、パスワードを差し替えた瞬間に発行済みのトークンが全部無効になる。
 * 「パスワードを変えても、既に入っている人を締め出せない」という穴を塞ぐための要。
 */
export async function deriveSigningKey(sessionSecret: string, password: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw',
    encoder.encode(sessionSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const material = await crypto.subtle.sign(
    'HMAC',
    base,
    encoder.encode(`preview-gate:v1:${password}`),
  )
  return crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

// -------------------------------------------------------------- トークン

export async function issueToken(key: CryptoKey, now: number): Promise<string> {
  const payload = `v1.${now + SESSION_MS}`
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return `${payload}.${toBase64Url(sig)}`
}

export async function verifyToken(key: CryptoKey, token: string, now: number): Promise<TokenState> {
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return 'bad'

  const exp = Number(parts[1])
  // 「1e20」「0x10」「 12 」のような書き方を弾く
  if (!/^[0-9]+$/.test(parts[1]!) || !Number.isSafeInteger(exp) || exp <= 0) return 'bad'

  const given = fromBase64Url(parts[2]!)
  if (!given) return 'bad'

  const expected = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(`v1.${parts[1]}`)),
  )
  if (!constantTimeEqual(given, expected)) return 'bad'

  return exp > now ? 'ok' : 'expired'
}

// ------------------------------------------------------------ パスワード

export async function passwordMatches(input: string, expected: string): Promise<boolean> {
  // 入力の長さがタイミングから漏れないよう、先にハッシュで長さを揃える
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(input)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ])
  return constantTimeEqual(new Uint8Array(a), new Uint8Array(b))
}
