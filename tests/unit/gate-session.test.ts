import { describe, expect, it } from 'vitest'
import {
  SESSION_MS,
  constantTimeEqual,
  deriveSigningKey,
  fromBase64Url,
  issueToken,
  normalizePassword,
  passwordMatches,
  toBase64Url,
  verifyToken,
} from '../../worker/session'

const SECRET = 'test-session-secret-0123456789'
const PW = 'harbor-lantern-42-quiet-moss'
const NOW = 1_787_000_000_000

const keyFor = (pw: string, secret = SECRET) => deriveSigningKey(secret, pw)

describe('公開用ゲート: パスワード照合', () => {
  it('一致すれば通る', async () => {
    expect(await passwordMatches(PW, PW)).toBe(true)
  })

  it('違えば通らない', async () => {
    expect(await passwordMatches('harbor-lantern-42-quiet-mos', PW)).toBe(false)
    expect(await passwordMatches('', PW)).toBe(false)
    expect(await passwordMatches(PW + ' ', PW)).toBe(false)
  })

  it('前後の空白と全角は正規化して受け付ける', () => {
    // 貼り付け事故を吸収する。ここが無いと「合っているのに通らない」問い合わせが出る
    expect(normalizePassword(`  ${PW}  `)).toBe(PW)
    expect(normalizePassword(`　${PW}\n`)).toBe(PW)
    expect(normalizePassword('ＡＢＣ１２３')).toBe('ABC123')
  })

  it('正規化しても中身は変えない', () => {
    expect(normalizePassword('a b')).toBe('a b')
    expect(normalizePassword('a-b_c')).toBe('a-b_c')
  })
})

describe('公開用ゲート: セッショントークン', () => {
  it('発行したトークンは検証を通る', async () => {
    const key = await keyFor(PW)
    expect(await verifyToken(key, await issueToken(key, NOW), NOW)).toBe('ok')
  })

  it('12時間を過ぎたら expired になる', async () => {
    const key = await keyFor(PW)
    const token = await issueToken(key, NOW)
    expect(await verifyToken(key, token, NOW + SESSION_MS - 1000)).toBe('ok')
    expect(await verifyToken(key, token, NOW + SESSION_MS + 1000)).toBe('expired')
  })

  it('★パスワードを変えると、発行済みのトークンが全部無効になる', async () => {
    const before = await keyFor(PW)
    const token = await issueToken(before, NOW)
    expect(await verifyToken(before, token, NOW)).toBe('ok')

    // 見せるのをやめる／締め出す手段はこれ。差し替えた瞬間に効く必要がある
    const after = await keyFor('rotated-password-9999')
    expect(await verifyToken(after, token, NOW)).toBe('bad')
  })

  it('署名の秘密を変えても、発行済みのトークンは無効になる', async () => {
    const before = await keyFor(PW)
    const token = await issueToken(before, NOW)
    const after = await keyFor(PW, 'another-session-secret')
    expect(await verifyToken(after, token, NOW)).toBe('bad')
  })

  it('期限だけ書き換えても通らない', async () => {
    const key = await keyFor(PW)
    const token = await issueToken(key, NOW)
    const [, , sig] = token.split('.')
    const forged = `v1.${NOW + 365 * 24 * 60 * 60 * 1000}.${sig}`
    expect(await verifyToken(key, forged, NOW)).toBe('bad')
  })

  it('壊れた形のトークンは bad として扱う', async () => {
    const key = await keyFor(PW)
    const token = await issueToken(key, NOW)
    const [, exp, sig] = token.split('.')
    const broken = [
      '',
      'garbage',
      'v1',
      `v1.${exp}`,
      `v1.${exp}.`,
      `v1.${exp}.AAAA`,
      `v2.${exp}.${sig}`,
      `v1.abc.${sig}`,
      `v1.-1.${sig}`,
      `v1.1e20.${sig}`,
      `v1.0x10.${sig}`,
      `v1. ${exp} .${sig}`,
      `v1.${exp}.${sig}.extra`,
      `v1.${exp}.${sig}=`,
      `v1.${exp}.${sig}+`,
      `v1.${exp}.${sig?.slice(0, -1)}`,
    ]
    for (const t of broken) {
      expect(await verifyToken(key, t, NOW), JSON.stringify(t)).toBe('bad')
    }
  })

  it('署名を1ビット変えるだけで落ちる', async () => {
    const key = await keyFor(PW)
    const token = await issueToken(key, NOW)
    const [, exp, sig] = token.split('.')
    const bytes = fromBase64Url(sig!)!
    bytes[0] = bytes[0]! ^ 0x01
    expect(await verifyToken(key, `v1.${exp}.${toBase64Url(bytes)}`, NOW)).toBe('bad')
  })
})

describe('公開用ゲート: 部品', () => {
  it('base64urlは往復する', () => {
    const src = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255])
    expect(toBase64Url(src)).not.toMatch(/[+/=]/)
    expect(Array.from(fromBase64Url(toBase64Url(src))!)).toEqual(Array.from(src))
  })

  it('base64urlでない文字列は null を返す', () => {
    for (const s of ['', 'a+b', 'a/b', 'a=', 'あ']) expect(fromBase64Url(s), s).toBeNull()
  })

  it('長さが違えば等しくない', () => {
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false)
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true)
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false)
  })
})
