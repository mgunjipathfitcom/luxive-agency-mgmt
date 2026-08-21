import { describe, expect, it } from 'vitest'
import { gatePageHtml, type GateMessage } from '../../worker/gate-page'

/**
 * 公開用ゲートの画面はViteアプリの外にあり、E2Eの「モックと出さない」検査が届かない。
 * ここで同じルールを掛ける。
 */

const ALL: GateMessage[] = ['first', 'wrong', 'expired', 'throttled', 'notReady']

describe('公開用ゲートの画面', () => {
  it.each(ALL)('「モック」というカタカナ語を出さない (%s)', (message) => {
    expect(gatePageHtml(message)).not.toContain('モック')
  })

  it.each(ALL)('試作版であることと架空データであることを必ず書く (%s)', (message) => {
    const html = gatePageHtml(message)
    expect(html).toContain('試作版')
    expect(html).toContain('架空')
  })

  it.each(ALL)('検索エンジンに拾わせない指定が入っている (%s)', (message) => {
    expect(gatePageHtml(message)).toContain('name="robots" content="noindex, nofollow"')
  })

  // この画面はパスワードの手前にあり、URLを知っていれば誰でも見える
  it.each(ALL)('パスワードの手前に会社名・ブランドを出さない (%s)', (message) => {
    const html = gatePageHtml(message)
    for (const word of ['LUXIVE', 'Luxive', 'ルクシブ', 'AGENCY MANAGEMENT']) {
      expect(html, word).not.toContain(word)
    }
  })

  it('初回・失敗・期限切れ・回数制限で文言が変わる', () => {
    const texts = ALL.map((m) => gatePageHtml(m))
    expect(new Set(texts).size).toBe(ALL.length)
    expect(gatePageHtml('expired')).toContain('入力途中の内容は消えていません')
    expect(gatePageHtml('wrong')).toContain('前後の空白')
  })

  it('パスワード欄はiOSで自動拡大しないサイズで、自動入力に必要な指定が入っている', () => {
    const html = gatePageHtml('first')
    expect(html).toContain('autocomplete="current-password"')
    expect(html).toContain('autocomplete="username"')
    expect(html).toMatch(/input\[type=password\][^}]*font-size:\s*16px/)
  })

  it('利用者の入力を画面へ差し込まない(差し込み口を作らない)', () => {
    // 引数はGateMessageの列挙だけで、任意文字列を受け取る口が無いことを型と実装の両面で担保する
    const html = gatePageHtml('first')
    expect(html).not.toContain('undefined')
    expect(html).toContain('<form method="post" action="/__gate/login">')
  })
})
