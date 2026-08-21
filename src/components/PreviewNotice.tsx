/**
 * 全画面の最上部に出す「試作版」の告知。
 * ログイン画面も含めて常に見えるように、AppShellではなくApp直下に置く。
 * 先方に見せる想定のため「モック」というカタカナ語は使わない。
 */
export function PreviewNotice() {
  return (
    <div className="previewbar" role="note" data-testid="preview-notice">
      <span className="previewbar__tag">試作版</span>
      <span className="previewbar__long">
        動作確認用の画面です。表示している企業名・担当者・連絡先・金額はすべて架空のものです。
      </span>
      <span className="previewbar__short">動作確認用。表示内容はすべて架空です。</span>
    </div>
  )
}
