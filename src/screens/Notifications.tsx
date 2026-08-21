import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../data/store'
import { formatDateTime } from '../domain/dates'
import { ReviewStateBadge } from '../components/ui'
import { navigate } from '../router/useHashRoute'
import { Badge, Callout, Card, EmptyState, Icon, JudgementBadge, PageHead } from '../components/ui'

export function Notifications() {
  const { db, currentUser, markNotificationRead } = useStore()
  const [tab, setTab] = useState<'notifications' | 'applications'>('notifications')

  // §15.2 通知表示は recipientUserId の完全一致で絞る
  const mine = useMemo(
    () =>
      db.notifications
        .filter((n) => n.recipientUserId === currentUser?.id)
        .sort((a, b) => (a.reviewedAt < b.reviewedAt ? 1 : -1)),
    [db.notifications, currentUser],
  )

  const myApplications = useMemo(
    () =>
      db.applications
        .filter((a) => a.applicantUserId === currentUser?.id)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [db.applications, currentUser],
  )

  useEffect(() => {
    if (tab !== 'notifications') return
    for (const n of mine) {
      if (!n.readAt) markNotificationRead(n.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, mine.length])

  if (!currentUser) return null

  return (
    <>
      <PageHead
        title="通知・申請履歴"
        desc="重複審査や延長申請の結果は、申請したご本人にだけ届きます。代理店管理者や同じ代理店の他の人には通知しません。"
      />

      <div className="tabs" style={{ marginBottom: 14 }}>
        <button
          className={tab === 'notifications' ? 'tab tab--on' : 'tab'}
          onClick={() => setTab('notifications')}
          data-testid="notif-tab-notifications"
        >
          通知({mine.length})
        </button>
        <button
          className={tab === 'applications' ? 'tab tab--on' : 'tab'}
          onClick={() => setTab('applications')}
          data-testid="notif-tab-applications"
        >
          自分の申請履歴({myApplications.length})
        </button>
      </div>

      {tab === 'notifications' ? (
        mine.length === 0 ? (
          <Card>
            <EmptyState title="自分あての通知はありません">
              自分が出した照会や申請の結果だけがここに届きます。
            </EmptyState>
          </Card>
        ) : (
          <div className="stack" data-testid="notif-list">
            {mine.map((n) => (
              <Card
                key={n.id}
                title={n.title}
                desc={`${formatDateTime(n.reviewedAt)} / 宛先: ${n.recipientEmail}`}
                actions={
                  <>
                    {n.mailState === 'sent' ? (
                      <Badge tone="ok">メール送信済み</Badge>
                    ) : (
                      <Badge tone="warn">送信待ち</Badge>
                    )}
                    {n.canReapply && <Badge tone="info">再申請できます</Badge>}
                    {n.dealId && (
                      <button className="btn btn--sm" onClick={() => navigate(`deal/${n.dealId}`)}>
                        <Icon name="doc" size={13} />
                        案件を開く
                      </button>
                    )}
                  </>
                }
              >
                <p style={{ whiteSpace: 'pre-wrap' }}>{n.message || '(メッセージはありません)'}</p>
              </Card>
            ))}
          </div>
        )
      ) : myApplications.length === 0 ? (
        <Card>
          <EmptyState title="申請の履歴はありません" />
        </Card>
      ) : (
        <>
          <Callout tone="info" title="既存の登録の中身はお見せしません">
            重複と判定された相手の代理店・担当者・連絡先・商談内容・金額は表示しません。確認は本部が行います。
          </Callout>
          <Card flush>
            <div className="table-wrap">
              <table className="data stackable">
                <thead>
                  <tr>
                    <th>申請日時</th>
                    <th>種別</th>
                    <th>企業名 / 施設名</th>
                    <th>重複判定</th>
                    <th>審査結果</th>
                    <th className="num">重複可能性</th>
                    <th>本部メッセージ</th>
                    <th>審査日時</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {myApplications.map((a) => (
                    <tr key={a.id} data-testid={`app-row-${a.id}`}>
                      <td className="num nowrap" data-label="申請日時">
                        {formatDateTime(a.createdAt)}
                      </td>
                      <td data-label="種別">
                        {a.kind === 'eligibility' ? '営業可否照会' : '営業予定登録'}
                      </td>
                      <td data-label="企業名">
                        <div className="cell-strong">{a.input.companyName}</div>
                        <div className="cell-sub">{a.input.facilityName || '施設名なし'}</div>
                      </td>
                      <td data-label="重複判定">
                        <JudgementBadge judgement={a.judgement} />
                      </td>
                      <td data-label="審査結果">
                        {a.reviewState === 'none' ? (
                          <span className="muted xsmall">審査不要</span>
                        ) : (
                          <ReviewStateBadge state={a.reviewState} />
                        )}
                      </td>
                      <td className="num" data-label="重複可能性">
                        {a.topScore}%
                      </td>
                      <td data-label="本部メッセージ">
                        <span className="xsmall">{a.decisionMessage || '—'}</span>
                        {a.canReapply && (
                          <div>
                            <Badge tone="info">再申請できます</Badge>
                          </div>
                        )}
                      </td>
                      <td className="num nowrap" data-label="審査日時">
                        {a.decidedAt ? formatDateTime(a.decidedAt) : '—'}
                      </td>
                      <td data-label="">
                        {a.dealId && (
                          <button className="btn btn--sm" onClick={() => navigate(`deal/${a.dealId}`)}>
                            案件
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  )
}
