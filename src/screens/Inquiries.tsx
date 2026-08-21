import { useMemo, useState } from 'react'
import { useStore } from '../data/store'
import { formatDateTime } from '../domain/dates'
import { Badge, Card, EmptyState, Icon, Modal, PageHead } from '../components/ui'

export function Inquiries() {
  const { db, currentUser, userById, agencyById, createInquiry, replyInquiry } = useStore()
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')

  const isHq = currentUser?.role === 'hq'

  const rows = useMemo(() => {
    if (!currentUser) return []
    let list = [...db.inquiries]
    if (!isHq) list = list.filter((q) => q.agencyId === currentUser.agencyId)
    return list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }, [db.inquiries, currentUser, isHq])

  if (!currentUser) return null

  const submit = () => {
    const errs: Record<string, string> = {}
    if (!subject.trim()) errs.subject = '件名を入力してください'
    if (!body.trim()) errs.body = '内容を入力してください'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    createInquiry(subject.trim(), body.trim())
    setSubject('')
    setBody('')
    setOpen(false)
  }

  return (
    <>
      <PageHead
        title="問い合わせ管理"
        desc={isHq ? '代理店からの問い合わせに回答します。' : '本部への問い合わせです。回答は通知でも届きます。'}
        actions={
          !isHq ? (
            <button className="btn btn--primary" onClick={() => setOpen(true)} data-testid="inq-new">
              <Icon name="mail" />
              本部へ問い合わせる
            </button>
          ) : undefined
        }
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState title="問い合わせはありません" />
        </Card>
      ) : (
        <div className="stack">
          {rows.map((q) => (
            <Card
              key={q.id}
              title={q.subject}
              desc={`${userById(q.fromUserId)?.name ?? '—'}(${agencyById(q.agencyId)?.name ?? '—'}) / ${formatDateTime(q.createdAt)}`}
              actions={
                <>
                  {q.state === 'open' ? <Badge tone="warn">未回答</Badge> : <Badge tone="ok">回答済み</Badge>}
                  {isHq && (
                    <button
                      className="btn btn--sm btn--primary"
                      onClick={() => {
                        setReplyTo(q.id)
                        setReplyBody('')
                      }}
                      data-testid={`inq-reply-${q.id}`}
                    >
                      回答する
                    </button>
                  )}
                </>
              }
            >
              <p style={{ whiteSpace: 'pre-wrap' }}>{q.body}</p>
              {q.replies.length > 0 && (
                <>
                  <div className="hr" />
                  <div className="timeline">
                    {q.replies.map((r) => (
                      <div className="tl-item" key={r.id}>
                        <div className="tl-item__head">
                          <span className="tl-item__date num">{formatDateTime(r.at)}</span>
                          <span>{userById(r.authorUserId)?.name ?? '本部'}</span>
                        </div>
                        <div className="tl-item__body">{r.body}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>
          ))}
        </div>
      )}

      {open && (
        <Modal
          title="本部へ問い合わせる"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>
                やめる
              </button>
              <button className="btn btn--primary" onClick={submit} data-testid="inq-submit">
                送信する
              </button>
            </>
          }
        >
          <label className="field">
            <span className="field__label">
              件名<span className="req">必須</span>
            </span>
            <input
              className="input"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              aria-invalid={!!errors.subject}
              data-testid="inq-subject"
            />
            {errors.subject && <span className="field__error">{errors.subject}</span>}
          </label>
          <label className="field">
            <span className="field__label">
              内容<span className="req">必須</span>
            </span>
            <textarea
              className="textarea"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              aria-invalid={!!errors.body}
              data-testid="inq-body"
            />
            {errors.body && <span className="field__error">{errors.body}</span>}
          </label>
        </Modal>
      )}

      {replyTo && (
        <Modal
          title="問い合わせに回答する"
          onClose={() => setReplyTo(null)}
          footer={
            <>
              <button className="btn" onClick={() => setReplyTo(null)}>
                やめる
              </button>
              <button
                className="btn btn--primary"
                disabled={!replyBody.trim()}
                onClick={() => {
                  replyInquiry(replyTo, replyBody.trim())
                  setReplyTo(null)
                }}
                data-testid="inq-reply-submit"
              >
                回答する
              </button>
            </>
          }
        >
          <label className="field">
            <span className="field__label">
              回答<span className="req">必須</span>
            </span>
            <textarea
              className="textarea"
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              data-testid="inq-reply-body"
            />
          </label>
          <p className="xsmall muted">回答は問い合わせた本人にだけ通知します。</p>
        </Modal>
      )}
    </>
  )
}
