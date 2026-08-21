/**
 * パスワード入力画面のHTML。
 * Workerの実行環境に依存しない純粋な文字列生成なので、単体テストから直接読める。
 *
 * 画面に出す文言では「モック」というカタカナ語を使わない(相手に通じないため)。
 *
 * この画面はパスワードの手前にあり、URLを知っていれば誰でも見える。
 * そのため会社名・ブランド・案件が分かる語を一切置かない。
 * tests/unit/gate-page.test.ts で検証している。
 *
 * ここに利用者の入力値を差し込むことはしない。差し込む文言はすべて下の定数で、
 * 外から来た文字列をHTMLへ入れる経路を作らない(エスケープ漏れの余地をなくす)。
 */

export type GateMessage = 'first' | 'wrong' | 'expired' | 'throttled' | 'notReady'

const MESSAGES: Record<GateMessage, { tone: 'info' | 'warn'; text: string }> = {
  first: {
    tone: 'info',
    text: 'お伝えしたパスワードを入力してください。',
  },
  wrong: {
    tone: 'warn',
    text: 'パスワードが違います。前後の空白が入っていないかご確認のうえ、もう一度お試しください。',
  },
  expired: {
    tone: 'info',
    text: '前回の入力から時間が経ちました。お手数ですが、もう一度パスワードを入力してください。入力途中の内容は消えていません。',
  },
  throttled: {
    tone: 'warn',
    text: '入力の失敗が続いたため、しばらくお待ちいただいています。1分ほど置いてからもう一度お試しください。',
  },
  notReady: {
    tone: 'warn',
    text: 'ただいま準備中です。お手数ですが、お渡しした担当者までご連絡ください。',
  },
}

const STYLE = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  margin: 0; min-height: 100vh;
  display: grid; place-items: center; padding: 24px;
  background: #f6f4f0; color: #1c1a17;
  font-family: "Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic UI","Yu Gothic","Noto Sans JP",Meiryo,system-ui,-apple-system,"Segoe UI",sans-serif;
  font-size: 14px; line-height: 1.7;
  -webkit-text-size-adjust: 100%;
}
.box {
  width: min(420px, 100%);
  background: #fff; border: 1px solid #e4ded4; border-radius: 14px;
  box-shadow: 0 2px 8px rgba(28,26,23,.07), 0 1px 2px rgba(28,26,23,.04);
  padding: 28px 26px;
}
.badge {
  display: inline-block; background: #7c5510; color: #fff;
  border-radius: 999px; padding: 3px 10px;
  font-size: 10.5px; font-weight: 700; letter-spacing: .04em;
}
h1 { font-size: 17px; margin: 14px 0 0; font-weight: 700; }
.lead { color: #4c463d; margin: 6px 0 0; font-size: 13px; }
.msg { margin-top: 16px; padding: 11px 13px; border-radius: 6px; font-size: 13px; }
.msg--info { background: #eaf1f8; border: 1px solid #c2d6e9; color: #2b4f70; }
.msg--warn { background: #fbf1dc; border: 1px solid #e8cf9e; color: #7c5510; }
label { display: block; margin-top: 18px; font-size: 12px; font-weight: 600; color: #4c463d; }
input[type=password] {
  width: 100%; margin-top: 6px; padding: 11px 12px;
  border: 1px solid #cfc6b8; border-radius: 6px; background: #fff; color: #1c1a17;
  /* 16px未満だとiOSで画面が自動拡大するため下げない */
  font-size: 16px; font-family: inherit;
}
input[type=password]:focus { outline: 2px solid #8a6d3b; outline-offset: 1px; border-color: #8a6d3b; }
button {
  width: 100%; margin-top: 16px; padding: 12px 14px;
  border: 0; border-radius: 6px; background: #6d5429; color: #fff;
  font-size: 15px; font-weight: 700; font-family: inherit; cursor: pointer;
}
button:hover { background: #55442b; }
.foot { margin-top: 18px; font-size: 11.5px; color: #7f7669; }
`

/** パスワード入力画面 */
export function gatePageHtml(message: GateMessage): string {
  const m = MESSAGES[message]
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>営業管理システム(試作版)</title>
<style>${STYLE}</style>
</head>
<body>
<main class="box">
  <span class="badge">試作版</span>
  <h1>営業管理システム</h1>
  <p class="lead">動作確認用の画面です。表示される企業名・担当者・連絡先・金額はすべて架空のものです。</p>
  <div class="msg msg--${m.tone}">${m.text}</div>
  <form method="post" action="/__gate/login">
    <input type="text" name="username" value="luxive" autocomplete="username" hidden readonly>
    <label for="pw">パスワード</label>
    <input id="pw" type="password" name="password" autocomplete="current-password"
           autocapitalize="off" autocorrect="off" spellcheck="false" required autofocus>
    <button type="submit">開く</button>
  </form>
  <p class="foot">うまく開けないときは、お渡しした担当者までご連絡ください。</p>
</main>
</body>
</html>
`
}
