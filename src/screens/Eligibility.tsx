import { useState } from 'react'
import { useStore } from '../data/store'
import { saveDraft } from '../data/storage'
import { isValidWebsite } from '../domain/normalize'
import { JUDGEMENT_LABEL } from '../domain/format'
import { nowISO } from '../domain/dates'
import type { JudgeResult } from '../domain/types'
import { navigate } from '../router/useHashRoute'
import { Callout, Card, Icon, JudgementBadge, PageHead } from '../components/ui'
import { CandidateList } from '../components/CandidateList'

export function Eligibility() {
  const { runEligibility } = useStore()
  const [companyName, setCompanyName] = useState('')
  const [facilityName, setFacilityName] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<JudgeResult | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!companyName.trim()) next.companyName = '企業名を入力してください'
    // 簡易照会では電話番号・Webサイトは任意。入力された場合だけ形式を確認する(§3.3)
    if (website.trim() && !isValidWebsite(website)) next.website = 'URLの形式が正しくありません(例: example.co.jp)'
    setErrors(next)
    if (Object.keys(next).length > 0) {
      setResult(null)
      return
    }
    const { result: r } = runEligibility({ companyName, facilityName, phone, website })
    setResult(r)
  }

  const proceed = () => {
    saveDraft({ companyName, facilityName, phone, website, createdAt: nowISO() })
    navigate('deal-new')
  }

  const reset = () => {
    setCompanyName('')
    setFacilityName('')
    setPhone('')
    setWebsite('')
    setResult(null)
    setErrors({})
  }

  return (
    <>
      <PageHead
        title="営業可否照会(簡易バージョン)"
        desc="営業予定登録の前に、その企業へ営業してよいかをざっと確かめる画面です。企業名だけでも照会できます。"
      />

      <Callout tone="info" title="この照会は簡易チェックです">
        営業予定登録のときは、必須項目を含めてもう一度重複チェックを行います。
        そのため、ここで問題がなくても、営業予定登録で重複審査になる場合があります。
      </Callout>

      <div className="grid grid--detail" style={{ marginTop: 16 }}>
        <Card title="照会する企業" desc="わかっている情報だけで構いません">
          <form onSubmit={submit} noValidate data-testid="eligibility-form">
            <div className="form-grid">
              <label className="field span-2">
                <span className="field__label">
                  企業名<span className="req">必須</span>
                </span>
                <input
                  className="input"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="例: 東都ホテル"
                  aria-invalid={!!errors.companyName}
                  data-testid="el-companyName"
                />
                {errors.companyName ? (
                  <span className="field__error">{errors.companyName}</span>
                ) : (
                  <span className="field__hint">
                    「株式会社」「(株)」「全角・半角」の違いは自動で吸収して比べます。
                  </span>
                )}
              </label>

              <label className="field">
                <span className="field__label">
                  施設名<span className="opt">任意</span>
                </span>
                <input
                  className="input"
                  value={facilityName}
                  onChange={(e) => setFacilityName(e.target.value)}
                  placeholder="例: 本館"
                  data-testid="el-facilityName"
                />
                <span className="field__hint">特定の施設を見分けたいときだけ入れてください。</span>
              </label>

              <label className="field">
                <span className="field__label">
                  電話番号<span className="opt">任意</span>
                </span>
                <input
                  className="input"
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="例: 03-5555-1010"
                  data-testid="el-phone"
                />
                <span className="field__hint">ハイフン・+81・内線の書き方の違いは吸収します。</span>
              </label>

              <label className="field span-2">
                <span className="field__label">
                  Webサイト<span className="opt">任意</span>
                </span>
                <input
                  className="input"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="例: https://www.toto-hotel.example.jp/"
                  aria-invalid={!!errors.website}
                  data-testid="el-website"
                />
                {errors.website ? (
                  <span className="field__error">{errors.website}</span>
                ) : (
                  <span className="field__hint">http/https・www.・末尾のスラッシュは無視して比べます。</span>
                )}
              </label>
            </div>

            <div className="btn-row" style={{ marginTop: 4 }}>
              <button className="btn btn--primary" type="submit" data-testid="el-submit">
                <Icon name="search" />
                照会する
              </button>
              <button className="btn" type="button" onClick={reset}>
                入力をクリア
              </button>
            </div>
          </form>
        </Card>

        <div>
          <Card title="照会結果">
            {!result ? (
              <p className="muted small">
                企業名を入れて「照会する」を押すと、ここに判定が出ます。
              </p>
            ) : (
              <div className="stack" data-testid="el-result">
                <div className="row">
                  <JudgementBadge judgement={result.judgement} />
                  <span className="muted xsmall">重複可能性 {result.topScore}%</span>
                </div>
                <Callout
                  tone={
                    result.judgement === 'clear'
                      ? 'ok'
                      : result.judgement === 'similar'
                        ? 'warn'
                        : 'danger'
                  }
                  title={JUDGEMENT_LABEL[result.judgement]}
                >
                  {result.reasonText}
                </Callout>

                {result.judgement === 'clear' && (
                  <button className="btn btn--primary btn--block" onClick={proceed} data-testid="el-proceed">
                    <Icon name="plus" />
                    営業予定登録へ進む
                  </button>
                )}
                {result.judgement === 'similar' && (
                  <p className="xsmall muted">
                    このまま営業予定登録に進むこともできますが、登録時の再判定で重複審査に入る見込みです。
                  </p>
                )}
                {(result.judgement === 'reserved' || result.judgement === 'ordered') && (
                  <p className="xsmall muted">
                    営業できません。別の企業で照会するか、本部へ問い合わせてください。
                  </p>
                )}

                <details>
                  <summary className="xsmall muted" style={{ cursor: 'pointer' }}>
                    判定の詳細(正規化した値)
                  </summary>
                  <div className="dl" style={{ marginTop: 6 }}>
                    <div className="dl__k">企業名</div>
                    <div className="dl__v mono">{result.normalized.companyNameNorm || '—'}</div>
                    <div className="dl__k">施設名</div>
                    <div className="dl__v mono">{result.normalized.facilityNameNorm || '—'}</div>
                    <div className="dl__k">電話番号</div>
                    <div className="dl__v mono">{result.normalized.phoneNorm || '—'}</div>
                    <div className="dl__k">Webドメイン</div>
                    <div className="dl__v mono">{result.normalized.websiteDomain || '—'}</div>
                  </div>
                </details>
              </div>
            )}
          </Card>

          {result && result.candidates.length > 0 && (
            <Card title="一致・類似した登録" desc="重複可能性の高い順に表示します">
              <CandidateList candidates={result.candidates} compact />
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
