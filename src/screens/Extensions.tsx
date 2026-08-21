import { useMemo, useState } from 'react'
import { useStore } from '../data/store'
import { formatDate, formatDateTime } from '../domain/dates'
import { navigate } from '../router/useHashRoute'
import { Badge, Card, EmptyState, Icon, Modal, PageHead } from '../components/ui'

export function Extensions() {
  const { db, currentUser, userById, agencyById, dealById, decideExtension } = useStore()
  const [target, setTarget] = useState<{ id: string; approve: boolean } | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const isHq = currentUser?.role === 'hq'

  const rows = useMemo(() => {
    if (!currentUser) return []
    let list = [...db.extensions]
    if (!isHq) list = list.filter((e) => e.agencyId === currentUser.agencyId)
    // 一般ユーザーは自分が出した申請だけ(§2.3)。代理店管理者は自社分を見られる
    if (currentUser.role === 'agency_member') {
      list = list.filter((e) => e.requestedByUserId === currentUser.id)
    }
    return list.sort((a, b) => (a.state === b.state ? (a.createdAt < b.createdAt ? 1 : -1) : a.state === 'pending' ? -1 : 1))
  }, [db.extensions, currentUser, isHq])

  if (!currentUser) return null

  const confirm = () => {
    if (!target || submitting) return
    if (!target.approve && !message.trim()) {
      setError('却下する理由を書いてください')
      return
    }
    setSubmitting(true)
    decideExtension(target.id, target.approve, message.trim())
    setTarget(null)
    setMessage('')
    setError(null)
    setSubmitting(false)
  }

  return (
    <>
      <PageHead
        title="延長申請"
        desc={
          isHq
            ? '代理店からの保護期限の延長申請を確認します。承認すると、その案件の保護期限が日数分だけ延びます。'
            : currentUser?.role === 'agency_admin'
              ? '自社から出した延長申請の状況です。申請は案件詳細の保護情報から行います。'
              : '自分が出した延長申請の状況です。申請は案件詳細の保護情報から行います。'
        }
      />

      <Card flush>
        {rows.length === 0 ? (
          <EmptyState title="延長申請はありません">
            案件詳細の「保護情報」から申請できます。
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="data stackable">
              <thead>
                <tr>
                  <th>企業名</th>
                  {isHq && <th>代理店</th>}
                  <th>申請者</th>
                  <th className="num">希望日数</th>
                  <th>理由</th>
                  <th>現在の保護期限</th>
                  <th>状態</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const deal = dealById(e.dealId)
                  return (
                    <tr key={e.id} data-testid={`ext-row-${e.id}`}>
                      <td data-label="企業名">
                        <div className="cell-strong">{deal?.companyName ?? '—'}</div>
                        <div className="cell-sub">{deal?.facilityName || '施設名なし'}</div>
                      </td>
                      {isHq && <td data-label="代理店">{agencyById(e.agencyId)?.name ?? '—'}</td>}
                      <td data-label="申請者">{userById(e.requestedByUserId)?.name ?? '—'}</td>
                      <td className="num" data-label="希望日数">
                        {e.requestedDays}日
                      </td>
                      <td data-label="理由">
                        <span className="xsmall">{e.reason}</span>
                      </td>
                      <td className="num nowrap" data-label="現在の保護期限">
                        {deal ? formatDate(deal.protectionExpiresAt) : '—'}
                      </td>
                      <td data-label="状態">
                        {e.state === 'pending' ? (
                          <Badge tone="warn">申請中</Badge>
                        ) : e.state === 'approved' ? (
                          <Badge tone="ok">承認</Badge>
                        ) : (
                          <Badge tone="danger">却下</Badge>
                        )}
                        {e.decidedAt && (
                          <div className="cell-sub">
                            {formatDateTime(e.decidedAt)} / {userById(e.decidedByUserId)?.name ?? '—'}
                          </div>
                        )}
                        {e.message && <div className="cell-sub">{e.message}</div>}
                      </td>
                      <td data-label="">
                        <div className="btn-row">
                          <button className="btn btn--sm" onClick={() => navigate(`deal/${e.dealId}`)}>
                            <Icon name="doc" size={13} />
                            案件
                          </button>
                          {isHq && e.state === 'pending' && (
                            <>
                              <button
                                className="btn btn--sm btn--primary"
                                onClick={() => {
                                  setTarget({ id: e.id, approve: true })
                                  setMessage('')
                                  setError(null)
                                  setSubmitting(false)
                                }}
                                data-testid={`ext-approve-${e.id}`}
                              >
                                承認
                              </button>
                              <button
                                className="btn btn--sm"
                                onClick={() => {
                                  setTarget({ id: e.id, approve: false })
                                  setMessage('')
                                  setError(null)
                                  setSubmitting(false)
                                }}
                                data-testid={`ext-reject-${e.id}`}
                              >
                                却下
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {target && (
        <Modal
          title={target.approve ? '延長申請を承認する' : '延長申請を却下する'}
          onClose={() => setTarget(null)}
          footer={
            <>
              <button className="btn" onClick={() => setTarget(null)}>
                やめる
              </button>
              <button
                className={target.approve ? 'btn btn--primary' : 'btn btn--danger'}
                onClick={confirm}
                disabled={submitting}
                data-testid="ext-confirm"
              >
                {target.approve ? '承認する' : '却下する'}
              </button>
            </>
          }
        >
          <label className="field">
            <span className="field__label">
              メッセージ
              {target.approve ? <span className="opt">任意</span> : <span className="req">必須</span>}
            </span>
            <textarea className="textarea" value={message} onChange={(e) => setMessage(e.target.value)} />
            {error && <span className="field__error">{error}</span>}
          </label>
          <p className="xsmall muted">結果は申請した本人にだけ通知します。</p>
        </Modal>
      )}
    </>
  )
}
