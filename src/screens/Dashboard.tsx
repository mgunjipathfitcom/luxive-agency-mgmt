import { useMemo, useState } from 'react'
import { useStore } from '../data/store'
import { buildDashboard, type Metric } from '../domain/dashboard'
import { formatDate, periodRange, type PeriodKey } from '../domain/dates'
import { STATUS_LABEL, STATUS_ORDER, formatNumber, formatYen } from '../domain/format'
import { remainingDays } from '../domain/protection'
import { navigate } from '../router/useHashRoute'
import {
  Badge,
  Card,
  EmptyState,
  Icon,
  PageHead,
  ProtectionBadge,
  ReviewStateBadge,
  StatusBadge,
} from '../components/ui'

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'this-month', label: '今月' },
  { key: 'last-month', label: '先月' },
  { key: 'last-90', label: '直近90日' },
  { key: 'this-year', label: '今年' },
  { key: 'all', label: '全期間' },
]

export function Dashboard() {
  const { db, currentUser, settings, userById, agencyById } = useStore()
  const [periodKey, setPeriodKey] = useState<PeriodKey>('last-90')
  const [focus, setFocus] = useState<string | null>('expiringSoon')

  const period = useMemo(() => periodRange(periodKey), [periodKey])
  const dash = useMemo(
    () => (currentUser ? buildDashboard(db, currentUser, period, settings) : null),
    [db, currentUser, period, settings],
  )

  if (!currentUser || !dash) return null

  const metrics: (Metric & { display: string; tone?: 'alert' })[] = [
    {
      ...dash.activeOrderCompanies,
      display: `${formatNumber(dash.activeOrderCompanies.value)}`,
    },
    { ...dash.meetings, display: `${formatNumber(dash.meetings.value)}` },
    { ...dash.quoteAmount, display: formatYen(dash.quoteAmount.value).replace('円', '') },
    { ...dash.orderAmount, display: formatYen(dash.orderAmount.value).replace('円', '') },
    { ...dash.expiringSoon, display: `${formatNumber(dash.expiringSoon.value)}`, tone: 'alert' },
  ]

  const focused = metrics.find((m) => m.key === focus) ?? null
  const focusedDeals = focused
    ? focused.dealIds
        .map((id) => db.deals.find((d) => d.id === id))
        .filter((d): d is NonNullable<typeof d> => !!d)
        .sort((a, b) => (a.protectionExpiresAt < b.protectionExpiresAt ? -1 : 1))
    : []

  return (
    <>
      <PageHead
        title="ダッシュボード"
        desc={`集計範囲: ${dash.scopeLabel} / 期間: ${period.label}(${formatDate(period.from)}〜${formatDate(period.to)})。カードを押すと、同じ集計から作った案件一覧が下に出ます。`}
        actions={
          <div className="chips">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                className={periodKey === p.key ? 'chip chip--on' : 'chip'}
                onClick={() => setPeriodKey(p.key)}
                data-testid={`period-${p.key}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid--4" style={{ marginBottom: 16 }}>
        {metrics.slice(0, 4).map((m) => (
          <button
            key={m.key}
            className={focus === m.key ? 'stat' : 'stat'}
            style={focus === m.key ? { borderColor: 'var(--accent)' } : undefined}
            onClick={() => setFocus(m.key)}
            data-testid={`stat-${m.key}`}
          >
            <span className="stat__label">
              {m.label}
              <Icon name="external" size={12} />
            </span>
            <span className="stat__value">
              {m.display}
              <small>{m.unit}</small>
            </span>
            <span className="stat__note">{m.note}</span>
          </button>
        ))}
      </div>

      <div className="grid grid--3" style={{ marginBottom: 16 }}>
        <button
          className="stat stat--alert"
          style={focus === 'expiringSoon' ? { borderColor: 'var(--accent)' } : undefined}
          onClick={() => setFocus('expiringSoon')}
          data-testid="stat-expiringSoon"
        >
          <span className="stat__label">
            {dash.expiringSoon.label}
            <Icon name="external" size={12} />
          </span>
          <span className="stat__value">
            {dash.expiringSoon.value}
            <small>件</small>
          </span>
          <span className="stat__note">{dash.expiringSoon.note}</span>
        </button>

        <div className="stat" style={{ cursor: 'default' }}>
          <span className="stat__label">ステータス別の案件数</span>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {STATUS_ORDER.map((s) => {
              const total = Object.values(dash.statusCounts).reduce((a, b) => a + b, 0) || 1
              const v = dash.statusCounts[s]
              return (
                <div key={s} className="row row--tight" style={{ fontSize: 12 }}>
                  <span style={{ width: 78 }}>{STATUS_LABEL[s]}</span>
                  <span className="meter" style={{ flex: 1 }}>
                    <span className="meter__bar" style={{ width: `${(v / total) * 100}%` }} />
                  </span>
                  <span className="num strong" style={{ width: 26, textAlign: 'right' }}>
                    {v}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {currentUser.role === 'hq' ? (
          <button className="stat" onClick={() => navigate('review')} data-testid="stat-review">
            <span className="stat__label">
              重複審査待ち
              <Icon name="external" size={12} />
            </span>
            <span className="stat__value">
              {dash.pendingReviewCount}
              <small>件</small>
            </span>
            <span className="stat__note">代理店から上がってきた重複審査の未処理件数</span>
          </button>
        ) : (
          <button className="stat" onClick={() => navigate('notifications')} data-testid="stat-notify">
            <span className="stat__label">
              自分あての未読通知
              <Icon name="external" size={12} />
            </span>
            <span className="stat__value">
              {db.notifications.filter((n) => n.recipientUserId === currentUser.id && !n.readAt).length}
              <small>件</small>
            </span>
            <span className="stat__note">審査結果は申請した本人だけに届きます</span>
          </button>
        )}
      </div>

      <Card
        title={focused ? `${focused.label}の内訳` : '内訳'}
        desc={focused ? focused.note : ''}
        flush
        actions={
          <span className="badge badge--accent">
            {focus === 'activeOrderCompanies'
              ? `${dash.activeOrderCompanies.companyGroups.length}社 / ${focusedDeals.length}件`
              : `${focusedDeals.length}件`}
            {' / カードと同じ集計関数'}
          </span>
        }
      >
        {focus === 'activeOrderCompanies' ? (
          dash.activeOrderCompanies.companyGroups.length === 0 ? (
            <EmptyState title="有効な受注のある企業はありません" />
          ) : (
            <div className="table-wrap">
              <table className="data stackable" data-testid="company-breakdown">
                <thead>
                  <tr>
                    <th>企業名</th>
                    <th className="num">案件数</th>
                    <th>案件</th>
                  </tr>
                </thead>
                <tbody>
                  {dash.activeOrderCompanies.companyGroups.map((g) => (
                    <tr key={g.key}>
                      <td data-label="企業名">
                        <span className="cell-strong">{g.companyName}</span>
                      </td>
                      <td className="num" data-label="案件数">
                        {g.dealIds.length}
                      </td>
                      <td data-label="案件">
                        <div className="pill-list">
                          {g.dealIds.map((id) => {
                            const d = db.deals.find((x) => x.id === id)
                            if (!d) return null
                            return (
                              <button
                                key={id}
                                className="btn btn--sm"
                                onClick={() => navigate(`deal/${id}`)}
                              >
                                {d.facilityName || '施設名なし'}
                              </button>
                            )
                          })}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : focusedDeals.length === 0 ? (
          <EmptyState title="該当する案件はありません">
            期間や集計範囲を変えると結果が変わります。
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="data stackable">
              <thead>
                <tr>
                  <th>企業名 / 施設名</th>
                  {currentUser.role === 'hq' && <th>所属代理店</th>}
                  <th>担当営業</th>
                  <th>ステータス</th>
                  <th>審査</th>
                  <th>保護期限</th>
                </tr>
              </thead>
              <tbody>
                {focusedDeals.map((d) => (
                  <tr key={d.id} className="is-clickable" onClick={() => navigate(`deal/${d.id}`)}>
                    <td data-label="企業名">
                      <div className="cell-strong">{d.companyName}</div>
                      <div className="cell-sub">{d.facilityName || '施設名なし'}</div>
                    </td>
                    {currentUser.role === 'hq' && (
                      <td data-label="所属代理店">{agencyById(d.agencyId)?.name ?? '—'}</td>
                    )}
                    <td data-label="担当営業">{userById(d.ownerUserId)?.name ?? '—'}</td>
                    <td data-label="ステータス">
                      <StatusBadge status={d.status} />
                    </td>
                    <td data-label="審査">
                      <ReviewStateBadge state={d.reviewState} />
                    </td>
                    <td data-label="保護期限">
                      <ProtectionBadge expiresAt={d.protectionExpiresAt} settings={settings} showDate />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {currentUser.role !== 'hq' && (
        <div className="grid grid--2" style={{ marginTop: 16 }}>
          <Card title="次にやること" desc="保護期限が近い順に並べています">
            <div className="stack stack--sm">
              {dash.expiringSoon.dealIds.slice(0, 5).map((id) => {
                const d = db.deals.find((x) => x.id === id)
                if (!d) return null
                return (
                  <button
                    key={id}
                    className="persona"
                    style={{ marginBottom: 0 }}
                    onClick={() => navigate(`deal/${d.id}`)}
                  >
                    <span className="persona__avatar">{remainingDays(d.protectionExpiresAt)}</span>
                    <span>
                      <span className="persona__name">{d.companyName}</span>
                      <br />
                      <span className="persona__meta">
                        {STATUS_LABEL[d.status]} / 保護期限 {formatDate(d.protectionExpiresAt)}
                      </span>
                    </span>
                    <span className="persona__go">›</span>
                  </button>
                )
              })}
              {dash.expiringSoon.dealIds.length === 0 && (
                <p className="muted small">保護期限が近い案件はありません。</p>
              )}
            </div>
          </Card>

          <Card title="自分あての通知" desc="重複審査の結果は申請した本人にだけ届きます">
            <div className="stack stack--sm">
              {db.notifications
                .filter((n) => n.recipientUserId === currentUser.id)
                .slice(0, 5)
                .map((n) => (
                  <div key={n.id} className="callout" style={{ borderLeftColor: 'var(--accent)' }}>
                    <div className="row row--tight">
                      <strong className="small">{n.title}</strong>
                      {!n.readAt && <Badge tone="warn">未読</Badge>}
                    </div>
                    <div className="xsmall muted" style={{ marginTop: 2 }}>
                      {n.message || '(メッセージなし)'}
                    </div>
                  </div>
                ))}
              {db.notifications.filter((n) => n.recipientUserId === currentUser.id).length === 0 && (
                <p className="muted small">通知はまだありません。</p>
              )}
            </div>
          </Card>
        </div>
      )}
    </>
  )
}
