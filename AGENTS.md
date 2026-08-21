# luxive-agency-mgmt 作業ルール

Luxive Agency Management(代理店営業管理システム)の**動作するモック**。
本部と代理店のあいだで営業先が重ならないように管理する画面一式で、
フロントエンド単体で動く(サーバなし・データはブラウザのlocalStorageのみ)。

このリポジトリだけで完結している。作業のルールはこのファイルが正本。

## 必要なもの

Node.js 22以上(`wrangler` が22以上を要求する。画面を動かすだけなら20でも動く)。

```bash
npm install
```

## この案件の正本

- 仕様: `docs/spec.md`(受領した統合仕様書の原文)。**実装より仕様が正**
- 実装の解釈・決めごと: `docs/implementation-notes.md`
- 受入テストの対応: `docs/acceptance-matrix.md`

仕様と実装が食い違ったら、まず `docs/spec.md` を読む。仕様に書いていない挙動を変えるときは `implementation-notes.md` に理由を1行足す。

## 触るときの順番

1. `src/domain/` のロジックを直す(画面に依存しない純粋な関数)
2. `tests/unit/` にテストを足す
3. 画面(`src/screens/`)を直す
4. `tests/e2e/` にブラウザテストを足す
5. `npm test` と `npm run test:e2e` が両方通ることを確認する

判定・計算を画面の中に書かない。画面から呼ぶのは `src/domain/` と `src/data/store.tsx` の操作だけにする。

## やってはいけないこと

- **実在の企業名・人名・電話番号・メールアドレス・URLを入れない。** 初期データはすべて架空、ドメインは `example.jp` を使う
- 重複判定の優先順位(Reserved → 有効受注 → 企業名完全一致 → 連絡先完全一致 → スコア)を崩さない
- 企業名の完全一致をスコア・閾値の設定で上書きできるようにしない(§4.4)
- 保護期間の単位を日数以外にしない。残り日数を保存しない(§10.6)
- 通知の絞り込みを `recipientUserId` の完全一致以外にしない(§15.2)
- 申請者向けの画面に、既存案件の代理店・担当者・連絡先・金額を出さない(§15.3)

## テスト

```bash
npm test
```

```bash
npm run test:e2e
```

ブラウザテストは初回だけ `npx playwright install chromium` が必要。

## 動作確認

```bash
npm run dev
```

`http://localhost:5183`。ログイン画面で立場を選ぶ。左下の「データ初期化」で初期状態に戻せる。

## 1ファイル版の書き出し

```bash
npm run build:single
```

`dist-single/index.html` が単体で動くHTMLになる。共有・確認用。
