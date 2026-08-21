/**
 * 試作版を「お伝えしたパスワードを知っている人だけ」に見せるためのゲート。
 *
 * wrangler.jsonc の assets.run_worker_first = true により、すべてのリクエストが
 * まずこの fetch() を通る。env.ASSETS.fetch() を呼ぶ箇所は下の1か所だけで、
 * そこへ到達する前に必ず認証を通す。認証を経ずにHTMLが配信される経路は無い。
 *
 * 照合と署名のロジックは ./session.ts にあり、tests/unit/gate-session.test.ts で検証している。
 * 公開をやめる / 締め出す手順は docs/deploy-preview.md を参照。
 */
import { gatePageHtml, type GateMessage } from './gate-page'
import {
  SESSION_MS,
  deriveSigningKey,
  issueToken,
  normalizePassword,
  passwordMatches,
  verifyToken,
} from './session'

interface Env {
  /** wrangler.jsonc の assets.binding に対応 */
  ASSETS: Fetcher
  /** wrangler secret put GATE_PASSWORD で設定する共有パスワード */
  GATE_PASSWORD?: string
  /** wrangler secret put GATE_SESSION_SECRET で設定する署名用の秘密 */
  GATE_SESSION_SECRET?: string
}

const LOGIN_PATH = '/__gate/login'

/** 失敗回数の窓。実効的な防御はパスワードの強度で、これは速度を落とすだけ */
const FAIL_WINDOW_MS = 5 * 60 * 1000
const FAIL_BUDGET = 10
/** ログインのbodyはこれより大きいはずがない */
const MAX_LOGIN_BODY = 4096

const SECURITY_HEADERS: Record<string, string> = {
  'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const keyFor = (env: Env) =>
  deriveSigningKey(env.GATE_SESSION_SECRET ?? '', env.GATE_PASSWORD ?? '')

// -------------------------------------------------------------- Cookie

/**
 * 本番(https)では __Host- を使う。ローカルのwrangler devはhttpで、
 * ブラウザによっては Secure 付きCookieを保存しないため名前を分ける。
 */
function cookieNameFor(url: URL): string {
  return url.protocol === 'https:' ? '__Host-preview_gate' : 'preview_gate_dev'
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return null
}

function setCookieValue(url: URL, token: string): string {
  const maxAge = Math.floor(SESSION_MS / 1000)
  const base = `${cookieNameFor(url)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
  return url.protocol === 'https:' ? `${base}; Secure` : base
}

// -------------------------------------------------------- 失敗回数の制限

type FailEntry = { n: number; reset: number }
const failures = new Map<string, FailEntry>()

/** 判定より先に数える(同時リクエストで素通りさせないため)。超過していたらtrue */
function chargeFailureBudget(key: string, now: number): boolean {
  if (failures.size > 5000) failures.clear()
  const e = failures.get(key)
  if (!e || now > e.reset) {
    failures.set(key, { n: 1, reset: now + FAIL_WINDOW_MS })
    return false
  }
  e.n += 1
  return e.n > FAIL_BUDGET
}

// ------------------------------------------------------------ レスポンス

function withSecurityHeaders(res: Response): Response {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v)
  return res
}

function gateResponse(message: GateMessage, status: number): Response {
  return withSecurityHeaders(
    new Response(gatePageHtml(message), {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0',
      },
    }),
  )
}

function textResponse(body: string, status: number): Response {
  return withSecurityHeaders(
    new Response(body, {
      status,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0',
      },
    }),
  )
}

// ---------------------------------------------------------------- 本体

async function handleLogin(request: Request, env: Env, url: URL, now: number): Promise<Response> {
  const size = Number(request.headers.get('Content-Length') ?? '0')
  if (size > MAX_LOGIN_BODY) return textResponse('413 Payload Too Large\n', 413)

  const clientKey = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  const over = chargeFailureBudget(clientKey, now)

  let input = ''
  try {
    const raw = (await request.formData()).get('password')
    if (typeof raw === 'string') input = normalizePassword(raw)
  } catch {
    return gateResponse('wrong', 400)
  }

  // 正しいパスワードは回数制限では弾かない(相手先が共有回線でも締め出さない)
  if (input && (await passwordMatches(input, normalizePassword(env.GATE_PASSWORD ?? '')))) {
    failures.delete(clientKey)
    const token = await issueToken(await keyFor(env), now)
    return withSecurityHeaders(
      new Response(null, {
        status: 303,
        headers: {
          Location: '/',
          'Set-Cookie': setCookieValue(url, token),
          'Cache-Control': 'no-store, max-age=0',
        },
      }),
    )
  }

  await sleep(400)
  return over ? gateResponse('throttled', 429) : gateResponse('wrong', 401)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const now = Date.now()

    // 認証の前に返す。クローラに全パス401を返し続けないため
    if (url.pathname === '/robots.txt') {
      return textResponse('User-agent: *\nDisallow: /\n', 200)
    }

    // シークレット未設定のまま公開してしまう事故を防ぐ(フェイルクローズ)
    if (!env.GATE_PASSWORD || !env.GATE_SESSION_SECRET) {
      return gateResponse('notReady', 503)
    }

    if (url.pathname === LOGIN_PATH) {
      if (request.method !== 'POST') return textResponse('405 Method Not Allowed\n', 405)
      return handleLogin(request, env, url, now)
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return textResponse('405 Method Not Allowed\n', 405)
    }

    const token = readCookie(request.headers.get('Cookie'), cookieNameFor(url))
    const state = token ? await verifyToken(await keyFor(env), token, now) : 'bad'
    if (state !== 'ok') {
      // 期限切れと初回訪問で文言を分ける(「データが消えた」と誤解させないため)
      return gateResponse(state === 'expired' ? 'expired' : 'first', 401)
    }

    // ここまで来て初めてアセットを取りに行く
    const asset = await env.ASSETS.fetch(request)
    const res = new Response(asset.body, asset)
    // no-store にすると毎回400KBを取り直すので、304で済ませられるようにする
    res.headers.set('Cache-Control', 'private, no-cache')
    res.headers.set('Vary', 'Cookie')
    return withSecurityHeaders(res)
  },
} satisfies ExportedHandler<Env>
