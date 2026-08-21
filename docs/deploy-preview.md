# 先方に見せるための公開手順(Cloudflare Workers)

1ファイル版のHTMLを、**パスワードを知っている人だけ**が開けるURLに置く手順。
無料枠のみで完結する。相手にアカウント登録は要らない。

## 引き継ぐとき

**Cloudflare WorkerはアカウントをまたいだWorkerの移管ができない。**
引き継ぐ側は、このリポジトリから**自分のCloudflareアカウントへデプロイし直す**。
下の「初回の手順」をそのまま実行すれば、自分のアカウントに同じものが立ち上がる。

- URLは `https://sales-test.<自分のサブドメイン>.workers.dev` に変わる
- `GATE_PASSWORD` と `GATE_SESSION_SECRET` は自分で設定し直す(元の値は渡らないし、渡す必要もない)
- Worker名を変えたいときは `wrangler.jsonc` の `name` を変える

## 何が動いているか

```
リクエスト
  └─ Worker (worker/index.ts)   ← すべてのリクエストが必ずここを通る
       ├─ /robots.txt          → 認証なしで Disallow: / を返す
       ├─ パスワード未入力      → パスワード入力画面(401)
       ├─ パスワード送信        → 合えば署名付きCookieを発行(12時間)
       └─ Cookieが有効          → dist-single/index.html を配信
```

`wrangler.jsonc` の `assets.run_worker_first: true` がこの構成の要。
**これが `false`(既定)だと、`index.html` が認証を通らずに直接配信される。**

判定と署名のロジックは `worker/session.ts` にあり、`npm test` で検証している
(`tests/unit/gate-session.test.ts` / `tests/unit/gate-page.test.ts`)。

## 初回の手順

```bash
npx wrangler login
```

ブラウザでCloudflareの認可画面が開く。**ここだけは人が操作する必要がある。**

```bash
npx wrangler whoami
```

意図したアカウントか確認する。`workers.dev` のサブドメイン名もここで分かる。
**サブドメインに会社名が入っている場合は、公開URLにそれが出る。**
変えるならダッシュボードの Workers & Pages → サブドメインの Change から。

```bash
npm run cf:deploy
```

`npm run build:single` してから `wrangler deploy` する。
初回は「workers.devのサブドメインを登録するか」と聞かれる。

URLは `https://sales-test.<サブドメイン>.workers.dev`。
Worker名は `wrangler.jsonc` の `name` で変えられる。

```bash
npx wrangler secret put GATE_PASSWORD
npx wrangler secret put GATE_SESSION_SECRET
```

- `GATE_PASSWORD`: 相手に伝えるパスワード。**人が考えたものは使わない。**
  この構成の実効的な防御はパスワードの強さだけなので、ランダム生成した
  読み上げやすい語の組み合わせ(60ビット以上)を使う
- `GATE_SESSION_SECRET`: Cookieの署名に使う。誰にも伝えない。32バイト以上のランダム文字列

**どちらかが未設定のうちは、ゲートは中身を出さずに「準備中です」を返す**(フェイルクローズ)。
設定前にデプロイしても中身は漏れない。

## デプロイのたびに確認すること

```bash
npm run cf:verify https://sales-test.<サブドメイン>.workers.dev '<パスワード>'
```

未認証で中身が返らないこと・改ざんしたCookieが弾かれること・
検索避けのヘッダが付いていることを実際に叩いて確かめる。
**1件でもNGが出たら、そのURLを相手に渡さない。**

## 相手に伝えること

- URL
- パスワード(**URLとは別の経路で伝える**。同じメールに両方書かない)
- 12時間で入力を求められること
- スマートフォンでも開けること

## 見せるのをやめる / 締め出す

パスワードを差し替えると、**すでに入っている人のCookieも同時に無効になる**。
署名鍵をパスワードから導出しているため(`worker/session.ts` の `deriveSigningKey`)。

```bash
npx wrangler secret put GATE_PASSWORD
```

完全に消すなら:

```bash
npx wrangler delete
```

## 分かっていること・割り切っていること

- **中身に認証は無い。** 開いた人は本部の立場に切り替えて、全代理店の案件・金額・
  監査ログまで見られる。試作版としては意図どおり
- **回数制限は気休め。** Workerのインスタンスごとのカウントなので、
  時間や接続元を変えれば回避できる。防御はパスワードの強さに一本化している。
  だから人が考えたパスワードを使わない
- **`run_worker_first: true` にすると、アセットのリクエストも無料枠の
  10万件/日にカウントされる。** 数人で見る分には問題ない
- **1つのURLを共有するので、誰が見たかは分からない。** 記録が要るなら
  Cloudflare Access(メールにワンタイムPINを送る)を重ねる
- `preview_urls: false` にしてある。これを外すと、ゲートが壊れた過去バージョンの
  URLが残り続ける

## ローカルで試す

```bash
npm run cf:dev
```

`.dev.vars`(gitignore済み)に `GATE_PASSWORD` と `GATE_SESSION_SECRET` を書いておく。
`http://localhost:8787` で同じゲートが動く。
`.dev.vars` を書き換えたら、**サーバを止めて立て直す**(自動では読み直さない)。

```bash
npm run cf:verify http://127.0.0.1:8787 '<.dev.varsのパスワード>'
```
