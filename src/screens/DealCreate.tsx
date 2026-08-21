import { useEffect, useRef, useState } from 'react'
import { useStore } from '../data/store'
import { clearDraft, loadDraft } from '../data/storage'
import { isValidPhone, isValidWebsite } from '../domain/normalize'
import { activeProductNames } from '../domain/products'
import { JUDGEMENT_LABEL } from '../domain/format'
import type { JudgeResult } from '../domain/types'
import { navigate } from '../router/useHashRoute'
import { Callout, Card, Icon, PageHead } from '../components/ui'
import { CandidateList } from '../components/CandidateList'

export function DealCreate() {
  const { db, currentUser, registerDeal, agencyById } = useStore()
  const [companyName, setCompanyName] = useState('')
  const [facilityName, setFacilityName] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [contactPersonName, setContactPersonName] = useState('')
  const [contactPersonContact, setContactPersonContact] = useState('')
  const [productNames, setProductNames] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [blocked, setBlocked] = useState<JudgeResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [fromDraft, setFromDraft] = useState(false)
  const submittedRef = useRef(false)

  // §5.2 営業可否照会からの引継ぎ。初期値として使い、すべて編集できる。
  useEffect(() => {
    const draft = loadDraft()
    if (draft) {
      setCompanyName(draft.companyName)
      setFacilityName(draft.facilityName)
      setPhone(draft.phone)
      setWebsite(draft.website)
      setFromDraft(true)
    }
  }, [])

  const active = activeProductNames(db.products)

  const toggleProduct = (name: string) => {
    setProductNames((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]))
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (submittedRef.current || submitting) return

    const next: Record<string, string> = {}
    if (!companyName.trim()) next.companyName = '企業名を入力してください'
    if (!phone.trim()) next.phone = '電話番号を入力してください'
    else if (!isValidPhone(phone)) next.phone = '電話番号の形式が正しくありません(市外局番から入力)'
    if (!website.trim()) next.website = 'Webサイトを入力してください'
    else if (!isValidWebsite(website)) next.website = 'URLの形式が正しくありません(例: example.co.jp)'
    if (!contactPersonName.trim()) next.contactPersonName = '担当者を入力してください'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setSubmitting(true)
    submittedRef.current = true
    // §6.3 登録ボタン押下時に、いま入力されている最新値で必ず再判定する
    const res = registerDeal({
      companyName,
      facilityName,
      phone,
      website,
      contactPersonName,
      contactPersonContact,
      productNames,
    })

    if (!res.ok || !res.dealId) {
      setBlocked(res.result)
      setSubmitting(false)
      submittedRef.current = false
      return
    }
    navigate(`deal-done?deal=${res.dealId}`, true)
  }

  if (!currentUser) return null

  return (
    <>
      <PageHead
        title="営業予定登録"
        desc="登録ボタンを押した時点の入力内容で、もう一度重複チェックを行います。営業可否照会の結果はそのまま使いません。"
      />

      {fromDraft && (
        <Callout tone="info" title="営業可否照会の内容を引き継ぎました">
          企業名・施設名・電話番号・Webサイトを初期値として入れています。ここで直した内容で再判定します。
        </Callout>
      )}

      {blocked && (
        <div style={{ marginTop: fromDraft ? 16 : 0 }}>
          <Callout tone="danger" title={JUDGEMENT_LABEL[blocked.judgement]}>
            {blocked.reasonText}
            <br />
            この企業は案件として登録できません。判定の記録は申請履歴と監査ログに残しました。
          </Callout>
          <Card title="一致した登録" desc="重複可能性の高い順">
            <CandidateList candidates={blocked.candidates} compact />
          </Card>
        </div>
      )}

      <div className="grid grid--detail" style={{ marginTop: 16 }}>
        <Card title="登録内容" desc="必須の項目はすべて埋めてください">
          <form onSubmit={submit} noValidate data-testid="deal-form">
            <div className="form-grid">
              <label className="field span-2">
                <span className="field__label">
                  企業名<span className="req">必須</span>
                </span>
                <input
                  className="input"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="例: 東都ホテル株式会社"
                  aria-invalid={!!errors.companyName}
                  data-testid="dl-companyName"
                />
                {errors.companyName && <span className="field__error">{errors.companyName}</span>}
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
                  data-testid="dl-facilityName"
                />
              </label>

              <label className="field">
                <span className="field__label">
                  電話番号<span className="req">必須</span>
                </span>
                <input
                  className="input"
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="例: 03-5555-1010"
                  aria-invalid={!!errors.phone}
                  data-testid="dl-phone"
                />
                {errors.phone && <span className="field__error">{errors.phone}</span>}
              </label>

              <label className="field span-2">
                <span className="field__label">
                  Webサイト<span className="req">必須</span>
                </span>
                <input
                  className="input"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="例: https://www.toto-hotel.example.jp/"
                  aria-invalid={!!errors.website}
                  data-testid="dl-website"
                />
                {errors.website ? (
                  <span className="field__error">{errors.website}</span>
                ) : (
                  <span className="field__hint">
                    表示はそのまま残し、比較用のドメインは別に保存します。
                  </span>
                )}
              </label>

              <label className="field">
                <span className="field__label">
                  担当者<span className="req">必須</span>
                </span>
                <input
                  className="input"
                  value={contactPersonName}
                  onChange={(e) => setContactPersonName(e.target.value)}
                  placeholder="例: 総務部 岩瀬様"
                  aria-invalid={!!errors.contactPersonName}
                  data-testid="dl-contactPersonName"
                />
                {errors.contactPersonName ? (
                  <span className="field__error">{errors.contactPersonName}</span>
                ) : (
                  <span className="field__hint">先方の窓口になる方を入れてください。</span>
                )}
              </label>

              <label className="field">
                <span className="field__label">
                  担当者の連絡先<span className="opt">任意</span>
                </span>
                <input
                  className="input"
                  value={contactPersonContact}
                  onChange={(e) => setContactPersonContact(e.target.value)}
                  placeholder="例: 03-5555-1011 / iwase@example.jp"
                  data-testid="dl-contactPersonContact"
                />
              </label>

              <div className="field span-2">
                <span className="field__label">
                  提案商品<span className="opt">任意</span>
                </span>
                <div className="stack stack--sm" data-testid="dl-products">
                  {active.map((name) => (
                    <label className="checkbox" key={name}>
                      <input
                        type="checkbox"
                        checked={productNames.includes(name)}
                        onChange={() => toggleProduct(name)}
                        data-testid={`dl-product-${name}`}
                      />
                      <span>{name}</span>
                    </label>
                  ))}
                </div>
                <span className="field__hint">
                  いま販売中の商品だけが出ます。商品名だけを選べばよく、SKU・香り・サイズの入力は不要です。
                </span>
              </div>
            </div>

            <div className="btn-row" style={{ marginTop: 6 }}>
              <button
                className="btn btn--primary"
                type="submit"
                disabled={submitting}
                data-testid="dl-submit"
              >
                <Icon name="check" />
                {submitting ? '登録中…' : '重複チェックして登録する'}
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  clearDraft()
                  navigate('eligibility')
                }}
              >
                営業可否照会に戻る
              </button>
            </div>
          </form>
        </Card>

        <div>
          <Card title="登録する人">
            <div className="dl">
              <div className="dl__k">担当営業</div>
              <div className="dl__v">{currentUser.name}</div>
              <div className="dl__k">所属代理店</div>
              <div className="dl__v">{agencyById(currentUser.agencyId)?.name ?? '—'}</div>
              <div className="dl__k">登録者</div>
              <div className="dl__v">{currentUser.name}</div>
            </div>
            <p className="xsmall muted" style={{ marginTop: 10 }}>
              担当営業はあとから案件詳細では変更できません。変更するときは代理店管理者の引継ぎ操作を使います。
            </p>
          </Card>

          <Card title="登録後の流れ">
            <ol className="small" style={{ paddingLeft: 18, margin: 0, lineHeight: 2 }}>
              <li>
                <strong>重複なし</strong> — そのまま自動承認。保護期間{db.settings.plannedDays}日が付きます。
              </li>
              <li>
                <strong>重複の可能性あり</strong> — 案件は作られますが、本部の重複審査待ちになります。
              </li>
              <li>
                <strong>Reserved / 受注案件</strong> — 営業できません。案件は作られません。
              </li>
            </ol>
          </Card>
        </div>
      </div>
    </>
  )
}
