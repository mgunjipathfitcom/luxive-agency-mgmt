# 引き継ぎ手順

このリポジトリを受け取って、改修し、自分の環境で公開できるようにするまでの手順。

- **渡す側** = このリポジトリを作った側(以下「軍司」)
- **受け取る側** = 改修を引き継ぐ側(以下「引き継ぐ側」)

前提として、これは**フロントエンド単体で動くモック**。サーバもデータベースも無く、
データはブラウザの localStorage にだけ入る。本番化するときに何を置き換えるかは
[README.md](README.md) の「本番化するときに置き換えるところ」を参照。

---

## 軍司がやること

### 1. GitHubリポジトリへ招待する

リポジトリは **Private**。引き継ぐ側のGitHubユーザー名を聞いて、Collaboratorに追加する。

```bash
gh api -X PUT repos/mgunjipathfitcom/luxive-agency-mgmt/collaborators/<相手のユーザー名> -f permission=push
```

GitHubの画面からやる場合は Settings → Collaborators → Add people。

### 2. 引き継ぐ側に伝える

- リポジトリのURL
- 「まず `HANDOFF.md` を読んでほしい」ということ
- **仕様書 `docs/spec.md` が正本で、実装より仕様が正**だということ
- 動くモックであって、本番システムではないこと

### 3. Cloudflareについて決める

現在 `sales-test` という名前のWorkerが**軍司のCloudflareアカウントで動いている**。

**Cloudflare WorkerはアカウントをまたいだWorkerの移管ができない。**
引き継ぐ側は自分のアカウントに新しくデプロイすることになる(下記)。
つまり軍司側のWorkerは引き継ぎには使われない。どうするか決める。

- **残す** — 何もしなくてよい。軍司側でいつでも見られる状態が続く
- **消す** — `npx wrangler delete` を実行する。URLは即座に死ぬ

軍司側のURLとパスワードを引き継ぐ側に見せる必要は無い(相手は自分で立てるため)。
参考として見せたい場合だけ、**URLとパスワードは別の経路で送る**(同じメールに両方書かない)。

### 4. 今後の更新について決める

このリポジトリは、軍司の手元の作業ディレクトリから**履歴なしで書き出したスナップショット**。
今後この2つは別々に育つ。軍司側で直したものを引き継ぐ側へ渡したい場合は、
書き出しをやり直す必要がある。渡し切りならこの項目は不要。

---

## 引き継ぐ側がやること

### 1. 手元で動かす

必要なもの: **Node.js 22以上**(`wrangler` が22以上を要求する。画面を動かすだけなら20でも動く)。

```bash
git clone https://github.com/mgunjipathfitcom/luxive-agency-mgmt.git
cd luxive-agency-mgmt
npm install
npm run dev
```

`http://localhost:5183` が開く。ログイン画面で立場を選ぶ(パスワードは無い)。
左下の「データ初期化」でいつでも初期状態に戻せる。

まず [README.md](README.md) の「ひととおり試す道すじ」を上から順にやると、
このシステムが何をするものか一周で分かる。

### 2. テストが通ることを確認する

```bash
npm test
```

ユニットテスト220件。ロジック183件と公開ゲート37件。数秒で終わる。

```bash
npx playwright install chromium
npm run test:e2e
```

ブラウザテスト71件。1分ほどかかる。`playwright install` は初回だけ。

**改修を始める前に、この2つが通ることを確認しておく。**
通らない状態から始めると、自分の変更が壊したのか元から壊れていたのかが分からなくなる。

### 3. 改修する

作業のルールは [AGENTS.md](AGENTS.md) にまとまっている。要点だけ:

- **判定・計算を画面の中に書かない。** ロジックは `src/domain/` に置く。画面から呼ぶのは
  `src/domain/` と `src/data/store.tsx` の操作だけ
- 直す順番は `src/domain/` → `tests/unit/` → `src/screens/` → `tests/e2e/`
- **実在の企業名・人名・電話番号・メールアドレス・URLを入れない。** 初期データはすべて架空、
  ドメインは `example.jp` を使う
- 仕様と実装が食い違ったら `docs/spec.md` を読む。仕様に書いていない挙動を変えるときは
  `docs/implementation-notes.md` に理由を1行足す

AGENTS.md の「やってはいけないこと」には、**崩すと仕様違反になる判定順序や制約**が
書いてある(重複判定の優先順位、保護期間の単位、通知の絞り込み条件など)。改修前に必ず読む。

受入テストの各項目がどのテストに対応するかは [docs/acceptance-matrix.md](docs/acceptance-matrix.md)。

### 4. 自分のCloudflareアカウントへ公開する

先方に見せるためのパスワード付きURLを、自分のアカウントに立てる。無料枠で足りる。
詳細は [docs/deploy-preview.md](docs/deploy-preview.md)。ここでは最短の流れだけ。

```bash
npx wrangler login
```

ブラウザでCloudflareの認可画面が開く。**ここだけは人の操作が必要。**

```bash
npx wrangler whoami
```

意図したアカウントか確認する。`workers.dev` のサブドメイン名もここで分かる。
**サブドメインに会社名が入っていると公開URLにそれが出る**ので、気になるなら
ダッシュボードの Workers & Pages → サブドメインの Change で変えておく。

```bash
npm run cf:deploy
```

`npm run build:single` してから `wrangler deploy` する。
URLは `https://sales-test.<自分のサブドメイン>.workers.dev`。
Worker名を変えたいときは `wrangler.jsonc` の `name` を変える。

```bash
npx wrangler secret put GATE_PASSWORD
npx wrangler secret put GATE_SESSION_SECRET
```

- `GATE_PASSWORD` — 見せる相手に伝えるパスワード。**人が考えたものは使わない。**
  この構成の実効的な防御はパスワードの強さだけなので、ランダム生成した
  読み上げやすい語の組み合わせ(60ビット以上)にする
- `GATE_SESSION_SECRET` — Cookieの署名に使う。誰にも伝えない。32バイト以上のランダム文字列

**どちらかが未設定のうちは、ゲートは中身を出さずに「準備中です」を返す。**
設定前にデプロイしても中身は漏れない。

```bash
npm run cf:verify https://sales-test.<自分のサブドメイン>.workers.dev '<パスワード>'
```

未認証で中身が返らないこと・改ざんしたCookieが弾かれること・検索避けのヘッダが
付いていることを実際に叩いて確かめる。**1件でもNGが出たら、そのURLを人に渡さない。**

このスクリプトは bash で動く。Windowsなら Git Bash から実行する。

**デプロイのたびに `cf:verify` を実行する。** ゲートの設定は
`wrangler.jsonc` の `assets.run_worker_first` ひとつで壊れる(falseだと
`index.html` が認証を通らずに直接配信される)。

### 5. 見せる相手に伝える

- URL
- パスワード(**URLとは別の経路で伝える**。同じメールに両方書かない)
- 12時間で再入力を求められること
- スマートフォンでも開けること

---

## 分かっておくべき割り切り

- **中身に認証は無い。** ゲートを通った人は本部の立場に切り替えて、全代理店の案件・金額・
  監査ログまで見られる。試作版としては意図どおり
- **1つのURLを共有するので、誰が見たかは分からない。** 記録が要るなら
  Cloudflare Access(メールにワンタイムPINを送る)を重ねる
- **パスワードを差し替えると、すでに入っている人のCookieも同時に無効になる。**
  署名鍵をパスワードから導出しているため(`worker/session.ts` の `deriveSigningKey`)。
  締め出したいときはこれを使う
- **localStorageは開発者ツールから直接書き換えられる。** フロントエンド単体のモックでは
  防げない。本番では必ずサーバー側で判定する
