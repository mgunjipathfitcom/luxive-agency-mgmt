import { useMemo, useState } from 'react'
import { useStore } from '../data/store'
import { formatDate, formatDateTime } from '../domain/dates'
import { STATUS_LABEL, formatYen } from '../domain/format'
import { totalOrders } from '../domain/dealOps'
import { normalizeFields } from '../domain/duplicate'
import type { DuplicateCandidate, ReviewCase, ReviewDecision } from '../domain/types'
import {
  Badge,
  Callout,
  Card,
  EmptyState,
  Icon,
  Meter,
  Modal,
  PageHead,
  ProtectionBadge,
} from '../components/ui'
import { navigate } from '../router/useHashRoute'

const RECOMMEND: Record<DuplicateCandidate['recommendation'], { label: string; tone: 'ok' | 'warn' | 'danger' }> = {
  approve: { label: '承認推奨', tone: 'ok' },
  check: { label: '要確認', tone: 'warn' },
  block: { label: '営業不可推奨', tone: 'danger' },
}

const DECISION_LABEL: Record<ReviewDecision, string> = {
  approve: '承認',
  block: '営業不可',
  return: '差し戻し',
}

export function ReviewQueue() {
  const { db, userById, agencyById, dealById, decideReview } = useStore()
  const [tab, setTab] = useState<'pending' | 'done'>('pending')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [decision, setDecision] = useState<ReviewDecision | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const pending = db.reviews.filter((r) => r.state === 'pending')
  const done = db.reviews.filter((r) => r.state !== 'pending')
  const list = tab === 'pending' ? pending : done

  const selected = useMemo(
    () => db.reviews.find((r) => r.id === selectedId) ?? null,
    [db.reviews, selectedId],
  )

  const openDecision = (d: ReviewDecision) => {
    setDecision(d)
    setMessage('')
    setError(null)
    setSubmitting(false)
  }

  const confirm = () => {
    if (!selected || !decision || submitting) return
    // §14.3 メッセージ必須条件: 承認は任意 / 営業不可・差し戻しは必須
    if (decision !== 'approve' && !message.trim()) {
      setError('この操作にはメッセージが必要です')
      return
    }
    setSubmitting(true)
    decideReview(selected.id, decision, message.trim())
    setDecision(null)
    setSelectedId(null)
    setSubmitting(false)
  }

  return (
    <>
      <PageHead
        title="重複審査"
        desc="代理店から上がってきた「重複の可能性あり」の登録を確認します。既存の登録と今回の登録を並べて比べてください。"
      />

      <div className="tabs" style={{ marginBottom: 14 }}>
        <button
          className={tab === 'pending' ? 'tab tab--on' : 'tab'}
          onClick={() => {
            setTab('pending')
            setSelectedId(null)
          }}
          data-testid="review-tab-pending"
        >
          未処理({pending.length})
        </button>
        <button
          className={tab === 'done' ? 'tab tab--on' : 'tab'}
          onClick={() => {
            setTab('done')
            setSelectedId(null)
          }}
          data-testid="review-tab-done"
        >
          処理済み({done.length})
        </button>
      </div>

      <div className="grid grid--detail">
        <div>
          <Card title={tab === 'pending' ? '未処理の審査' : '処理済みの審査'} flush>
            {list.length === 0 ? (
              <EmptyState title={tab === 'pending' ? '未処理の審査はありません' : '処理済みの審査はありません'} />
            ) : (
              <div className="table-wrap">
                <table className="data stackable">
                  <thead>
                    <tr>
                      <th>申請企業 / 施設</th>
                      <th>申請代理店</th>
                      <th>申請日時</th>
                      <th className="num">重複可能性</th>
                      <th>状態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => {
                      const deal = dealById(r.dealId)
                      return (
                        <tr
                          key={r.id}
                          className="is-clickable"
                          onClick={() => setSelectedId(r.id)}
                          style={selectedId === r.id ? { background: 'var(--accent-soft)' } : undefined}
                          data-testid={`review-row-${r.id}`}
                        >
                          <td data-label="申請企業">
                            <div className="cell-strong">{deal?.companyName ?? '—'}</div>
                            <div className="cell-sub">{deal?.facilityName || '施設名なし'}</div>
                          </td>
                          <td data-label="申請代理店">{agencyById(r.agencyId)?.name ?? '—'}</td>
                          <td className="num nowrap" data-label="申請日時">
                            {formatDateTime(r.submittedAt)}
                          </td>
                          <td className="num" data-label="重複可能性">
                            <Meter value={r.topScore} />
                          </td>
                          <td data-label="状態">
                            {r.state === 'pending' ? (
                              <Badge tone="warn">重複審査待ち</Badge>
                            ) : r.state === 'approved' ? (
                              <Badge tone="ok">承認</Badge>
                            ) : r.state === 'blocked' ? (
                              <Badge tone="danger">営業不可</Badge>
                            ) : (
                              <Badge tone="info">差し戻し</Badge>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {selected && <ReviewCompare review={selected} />}
        </div>

        <div>
          {!selected ? (
            <Card title="審査の進め方">
              <ol className="small" style={{ paddingLeft: 18, margin: 0, lineHeight: 2 }}>
                <li>左の一覧から1件選ぶ</li>
                <li>「既に登録されている情報」と「今回新しく登録された情報」を見比べる</li>
                <li>承認・営業不可・差し戻しのどれかを選ぶ</li>
              </ol>
              <div className="hr" />
              <p className="xsmall muted">
                営業不可と差し戻しはメッセージが必須です。結果は申請したご本人にだけ通知します。
              </p>
            </Card>
          ) : (
            <>
              <Card title="判定と操作">
                <div className="stack">
                  <Callout tone="warn" title={`重複可能性 ${selected.topScore}%`}>
                    {selected.reasonText}
                  </Callout>

                  {selected.state === 'pending' ? (
                    <div className="btn-row">
                      <button
                        className="btn btn--primary"
                        onClick={() => openDecision('approve')}
                        data-testid="review-approve"
                      >
                        <Icon name="check" />
                        承認
                      </button>
                      <button className="btn btn--danger" onClick={() => openDecision('block')} data-testid="review-block">
                        営業不可
                      </button>
                      <button className="btn" onClick={() => openDecision('return')} data-testid="review-return">
                        差し戻し
                      </button>
                    </div>
                  ) : (
                    <div className="dl">
                      <div className="dl__k">判定結果</div>
                      <div className="dl__v strong">
                        {selected.decision ? DECISION_LABEL[selected.decision] : '—'}
                      </div>
                      <div className="dl__k">操作した本部ユーザー</div>
                      <div className="dl__v">{userById(selected.decidedByUserId)?.name ?? '—'}</div>
                      <div className="dl__k">操作日時</div>
                      <div className="dl__v num">{formatDateTime(selected.decidedAt)}</div>
                      <div className="dl__k">メッセージ</div>
                      <div className="dl__v">{selected.message || '(なし)'}</div>
                    </div>
                  )}

                  <div className="hr" />
                  <div className="dl">
                    <div className="dl__k">申請代理店</div>
                    <div className="dl__v">{agencyById(selected.agencyId)?.name ?? '—'}</div>
                    <div className="dl__k">登録者</div>
                    <div className="dl__v">{userById(selected.applicantUserId)?.name ?? '—'}</div>
                    <div className="dl__k">登録日時</div>
                    <div className="dl__v num">{formatDateTime(selected.submittedAt)}</div>
                  </div>
                  <button className="btn btn--sm" onClick={() => navigate(`deal/${selected.dealId}`)}>
                    <Icon name="doc" />
                    案件詳細を開く
                  </button>
                </div>
              </Card>

              <Card title="審査履歴" desc="この案件に対する本部の操作">
                {db.audits.filter((a) => a.targetId === selected.dealId && a.action.startsWith('重複審査')).length === 0 ? (
                  <p className="muted small">まだ操作はありません。</p>
                ) : (
                  <div className="timeline">
                    {db.audits
                      .filter((a) => a.targetId === selected.dealId && a.action.startsWith('重複審査'))
                      .map((a) => (
                        <div className="tl-item" key={a.id}>
                          <div className="tl-item__head">
                            <span className="tl-item__date num">{formatDateTime(a.at)}</span>
                            <span>{userById(a.actorUserId)?.name ?? a.actorUserId}</span>
                          </div>
                          <div className="tl-item__body">{a.action}</div>
                          {a.detail && <div className="tl-item__note">{a.detail}</div>}
                        </div>
                      ))}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>

      {decision && selected && (
        <Modal
          title={`${DECISION_LABEL[decision]}として処理する`}
          onClose={() => setDecision(null)}
          footer={
            <>
              <button className="btn" onClick={() => setDecision(null)}>
                やめる
              </button>
              <button
                className={decision === 'block' ? 'btn btn--danger' : 'btn btn--primary'}
                onClick={confirm}
                disabled={submitting}
                data-testid="review-confirm"
              >
                {DECISION_LABEL[decision]}にする
              </button>
            </>
          }
        >
          <Callout tone={decision === 'approve' ? 'ok' : decision === 'block' ? 'danger' : 'info'}>
            {decision === 'approve' && 'この登録を承認します。メッセージは任意です。'}
            {decision === 'block' && 'この登録を営業不可にします。理由のメッセージが必要です。'}
            {decision === 'return' && '申請者に差し戻します。何を直せばよいかを書いてください。'}
          </Callout>
          <label className="field" style={{ marginTop: 14 }}>
            <span className="field__label">
              メッセージ
              {decision === 'approve' ? <span className="opt">任意</span> : <span className="req">必須</span>}
            </span>
            <textarea
              className="textarea"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                decision === 'approve'
                  ? '例: 別施設のため重複にあたりません。'
                  : decision === 'block'
                    ? '例: Reserved案件と一致します。本社ビルは本部直轄です。'
                    : '例: 先方の担当部署名を追記して再申請してください。'
              }
              data-testid="review-message"
            />
            {error && <span className="field__error">{error}</span>}
          </label>
          <p className="xsmall muted">
            結果は申請した本人({userById(selected.applicantUserId)?.name ?? '—'})にだけ通知します。
            代理店管理者や同じ代理店の他のユーザー、既存案件の担当者には通知しません。
          </p>
        </Modal>
      )}
    </>
  )
}

// ------------------------------------------------------------------ 比較画面(§14.1)
const COMPARE_VISIBLE = 3

function ReviewCompare({ review }: { review: ReviewCase }) {
  const { db, dealById, agencyById, userById, settings } = useStore()
  const [showAll, setShowAll] = useState(false)
  const deal = dealById(review.dealId)
  if (!deal) return null
  const shown = showAll ? review.candidates : review.candidates.slice(0, COMPARE_VISIBLE)

  const newFields = normalizeFields({
    companyName: deal.companyName,
    facilityName: deal.facilityName,
    phone: deal.phone,
    website: deal.website,
  })

  return (
    <Card title="比較" desc="重複可能性の高い順に、既存の登録と今回の登録を並べます">
      <div className="stack">
        {shown.map((c) => {
          const existDeal = c.kind === 'deal' ? db.deals.find((d) => d.id === c.refId) : null
          const existRes = c.kind === 'reserved' ? db.reserved.find((r) => r.id === c.refId) : null
          const hit = (label: string) => c.matched.includes(label)
          const rec = RECOMMEND[c.recommendation]

          return (
            <div key={`${c.kind}-${c.refId}`} data-testid="compare-block">
              <div className="row" style={{ marginBottom: 8 }}>
                <Badge tone={c.protectionState === 'reserved' ? 'danger' : c.protectionState === 'active' ? 'warn' : 'neutral'}>
                  {c.protectionState === 'reserved'
                    ? 'Reserved案件'
                    : c.protectionState === 'active'
                      ? '有効保護中'
                      : '保護期限切れ'}
                </Badge>
                <Badge tone={rec.tone}>{rec.label}</Badge>
                <span className="spacer" />
                <Meter value={c.score} />
              </div>

              <div className="compare">
                <div className="compare__col">
                  <div className="compare__head compare__head--existing">既に登録されている情報</div>
                  <div className="compare__body">
                    <Row k="企業名" v={existDeal?.companyName ?? existRes?.companyName ?? '—'} hit={hit('企業名')} />
                    <Row
                      k="施設名"
                      v={(existDeal?.facilityName || existRes?.facilityName) ?? ''}
                      hit={hit('施設名')}
                    />
                    <Row k="電話番号" v={(existDeal?.phone || existRes?.phone) ?? ''} hit={hit('電話番号')} />
                    <Row k="Webサイト" v={(existDeal?.website || existRes?.website) ?? ''} hit={hit('Webドメイン')} />
                    {existDeal && (
                      <>
                        <Row k="登録済み代理店" v={agencyById(existDeal.agencyId)?.name ?? '—'} />
                        <Row k="担当者" v={userById(existDeal.ownerUserId)?.name ?? '—'} />
                        <Row k="ステータス" v={STATUS_LABEL[existDeal.status]} />
                        <div className="compare__row">
                          <div className="compare__k">保護状態</div>
                          <div className="compare__v">
                            <ProtectionBadge expiresAt={existDeal.protectionExpiresAt} settings={settings} />
                          </div>
                        </div>
                        <Row k="保護期限" v={formatDate(existDeal.protectionExpiresAt)} />
                        <Row k="登録日" v={formatDate(existDeal.createdAt)} />
                        <Row
                          k="受注"
                          v={totalOrders(existDeal) > 0 ? formatYen(totalOrders(existDeal)) : '受注なし'}
                        />
                      </>
                    )}
                    {existRes && (
                      <>
                        <Row k="登録理由" v={existRes.reason} />
                        <Row k="登録日" v={formatDate(existRes.registeredAt)} />
                      </>
                    )}
                  </div>
                </div>

                <div className="compare__col">
                  <div className="compare__head compare__head--new">今回新しく登録された情報</div>
                  <div className="compare__body">
                    <Row k="企業名" v={deal.companyName} hit={hit('企業名')} />
                    <Row k="施設名" v={deal.facilityName} hit={hit('施設名')} />
                    <Row k="電話番号" v={deal.phone} hit={hit('電話番号')} />
                    <Row k="Webサイト" v={deal.website} hit={hit('Webドメイン')} />
                    <Row k="申請代理店" v={agencyById(review.agencyId)?.name ?? '—'} />
                    <Row k="登録者" v={userById(review.applicantUserId)?.name ?? '—'} />
                    <Row k="登録日時" v={formatDateTime(review.submittedAt)} />
                    <Row
                      k="提案商品"
                      v={deal.lines.map((l) => l.productName).join(' / ') || '—'}
                    />
                    <div className="compare__row">
                      <div className="compare__k">重複可能性</div>
                      <div className="compare__v">
                        <Meter value={c.score} />
                      </div>
                    </div>
                    <Row k="判定理由" v={c.reason} />
                  </div>
                </div>
              </div>

              <details style={{ marginTop: 8 }}>
                <summary className="xsmall muted" style={{ cursor: 'pointer' }}>
                  判定の詳細(正規化した値)
                </summary>
                <div className="compare" style={{ marginTop: 8 }}>
                  <div className="compare__col">
                    <div className="compare__head compare__head--existing">既存</div>
                    <div className="compare__body">
                      <Row k="企業名" v={(existDeal?.companyNameNorm || existRes?.companyNameNorm) ?? '—'} mono />
                      <Row k="施設名" v={(existDeal?.facilityNameNorm || existRes?.facilityNameNorm) ?? '—'} mono />
                      <Row k="電話番号" v={(existDeal?.phoneNorm || existRes?.phoneNorm) ?? '—'} mono />
                      <Row k="Webドメイン" v={(existDeal?.websiteDomain || existRes?.websiteDomain) ?? '—'} mono />
                    </div>
                  </div>
                  <div className="compare__col">
                    <div className="compare__head compare__head--new">今回</div>
                    <div className="compare__body">
                      <Row k="企業名" v={newFields.companyNameNorm} mono />
                      <Row k="施設名" v={newFields.facilityNameNorm} mono />
                      <Row k="電話番号" v={newFields.phoneNorm} mono />
                      <Row k="Webドメイン" v={newFields.websiteDomain} mono />
                    </div>
                  </div>
                </div>
              </details>
              <div className="hr" />
            </div>
          )
        })}
        {review.candidates.length === 0 && <p className="muted small">比較対象がありません。</p>}
        {review.candidates.length > COMPARE_VISIBLE && (
          <button className="btn btn--sm" onClick={() => setShowAll((v) => !v)} data-testid="compare-more">
            {showAll
              ? '上位3件だけ表示する'
              : `残り${review.candidates.length - COMPARE_VISIBLE}件の候補も表示する`}
          </button>
        )}
      </div>
    </Card>
  )
}

function Row({ k, v, hit, mono }: { k: string; v: string; hit?: boolean; mono?: boolean }) {
  return (
    <div className="compare__row">
      <div className="compare__k">{k}</div>
      <div className={mono ? 'compare__v mono' : 'compare__v'}>
        {hit ? <span className="compare__v--hit">{v || '—'}</span> : v || '—'}
      </div>
    </div>
  )
}
