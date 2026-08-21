import { useMemo, useState } from 'react'
import { useStore } from '../data/store'
import { buildCompanies, type CompanyRecord } from '../domain/companies'
import { normalizeCompanyName } from '../domain/normalize'
import { formatDate, formatDateTime } from '../domain/dates'
import { JUDGEMENT_LABEL, STATUS_LABEL, formatYen } from '../domain/format'
import { totalOrders } from '../domain/dealOps'
import type { DealStatus } from '../domain/types'
import { navigate } from '../router/useHashRoute'
import {
  Badge,
  Card,
  EmptyState,
  Icon,
  Modal,
  PageHead,
  ProtectionBadge,
  ReviewStateBadge,
  StatusBadge,
} from '../components/ui'

const PROTECTION_LABEL: Record<CompanyRecord['protectionState'], string> = {
  reserved: 'Reserved',
  active: '保護中',
  expired: '保護期限切れ',
  none: '保護なし',
}

export function Companies() {
  const { db, settings, agencyById, userById, dealById } = useStore()
  const [q, setQ] = useState('')
  const [agencyId, setAgencyId] = useState('')
  const [status, setStatus] = useState<'' | DealStatus>('')
  const [protection, setProtection] = useState<'' | CompanyRecord['protectionState']>('')
  const [ordered, setOrdered] = useState<'' | 'yes' | 'no'>('')
  const [selected, setSelected] = useState<string | null>(null)

  const companies = useMemo(() => buildCompanies(db), [db])

  const rows = useMemo(() => {
    let list = companies
    if (agencyId) list = list.filter((c) => c.agencyIds.includes(agencyId))
    if (status) list = list.filter((c) => c.deals.some((d) => d.status === status))
    if (protection) list = list.filter((c) => c.protectionState === protection)
    if (ordered === 'yes') list = list.filter((c) => c.hasOrder)
    if (ordered === 'no') list = list.filter((c) => !c.hasOrder)
    if (q.trim()) {
      const n = q.trim().toLowerCase()
      list = list.filter(
        (c) =>
          c.companyName.toLowerCase().includes(n) ||
          c.facilities.some((f) => f.toLowerCase().includes(n)) ||
          c.phones.some((p) => p.includes(n)) ||
          c.domains.some((d) => d.includes(n)) ||
          c.ownerUserIds.some((id) => (userById(id)?.name ?? '').includes(n)),
      )
    }
    return list
  }, [companies, agencyId, status, protection, ordered, q, userById])

  const detail = companies.find((c) => c.key === selected) ?? null
  // この企業に対する申請(案件経由と、案件化しなかった照会の両方)
  const companyApplications = useMemo(() => {
    if (!detail) return []
    const dealIds = new Set(detail.deals.map((d) => d.id))
    return db.applications
      .filter((a) => {
        if (a.dealId && dealIds.has(a.dealId)) return true
        const target = a.dealId ? dealById(a.dealId) : null
        if (target) return false
        return normalizeCompanyName(a.input.companyName) === detail.key
      })
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  }, [detail, db.applications, dealById])

  return (
    <>
      <PageHead
        title="企業・施設"
        desc="企業単位で見る顧客マスターです。案件管理が案件単位なのに対して、こちらは同じ企業の案件をまとめて確認します。"
      />

      <Card flush>
        <div className="toolbar">
          <div className="toolbar__item toolbar__item--grow">
            <label className="field">
              <span className="field__label">キーワード</span>
              <input
                className="input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="企業名・施設名・電話番号・ドメイン・担当営業"
                data-testid="companies-q"
              />
            </label>
          </div>
          <div className="toolbar__item">
            <label className="field">
              <span className="field__label">所属代理店</span>
              <select className="select" value={agencyId} onChange={(e) => setAgencyId(e.target.value)}>
                <option value="">すべて</option>
                {db.agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="toolbar__item">
            <label className="field">
              <span className="field__label">案件ステータス</span>
              <select className="select" value={status} onChange={(e) => setStatus(e.target.value as '' | DealStatus)}>
                <option value="">すべて</option>
                {(Object.keys(STATUS_LABEL) as DealStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="toolbar__item">
            <label className="field">
              <span className="field__label">保護状態</span>
              <select
                className="select"
                value={protection}
                onChange={(e) => setProtection(e.target.value as '' | CompanyRecord['protectionState'])}
              >
                <option value="">すべて</option>
                <option value="reserved">Reserved</option>
                <option value="active">保護中</option>
                <option value="expired">保護期限切れ</option>
                <option value="none">保護なし</option>
              </select>
            </label>
          </div>
          <div className="toolbar__item">
            <label className="field">
              <span className="field__label">受注</span>
              <select className="select" value={ordered} onChange={(e) => setOrdered(e.target.value as '' | 'yes' | 'no')}>
                <option value="">すべて</option>
                <option value="yes">受注あり</option>
                <option value="no">受注なし</option>
              </select>
            </label>
          </div>
        </div>

        <div className="scroll-hint">{rows.length}社</div>

        {rows.length === 0 ? (
          <EmptyState title="条件に合う企業がありません" />
        ) : (
          <div className="table-wrap">
            <table className="data stackable">
              <thead>
                <tr>
                  <th>企業名</th>
                  <th>施設</th>
                  <th>所属代理店</th>
                  <th className="num">案件</th>
                  <th>保護状態</th>
                  <th>受注</th>
                  <th className="num">受注金額</th>
                  <th>最終更新</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr
                    key={c.key}
                    className="is-clickable"
                    onClick={() => setSelected(c.key)}
                    data-testid={`company-row-${c.key}`}
                  >
                    <td data-label="企業名">
                      <div className="cell-strong">{c.companyName}</div>
                      <div className="cell-sub">{c.domains[0] ?? ''}</div>
                    </td>
                    <td data-label="施設">
                      {c.facilities.filter(Boolean).length > 0 ? c.facilities.filter(Boolean).join(' / ') : '—'}
                    </td>
                    <td data-label="所属代理店">
                      {c.agencyIds.map((id) => agencyById(id)?.name ?? id).join(' / ') || '—'}
                    </td>
                    <td className="num" data-label="案件">
                      {c.deals.length}
                    </td>
                    <td data-label="保護状態">
                      <Badge
                        tone={
                          c.protectionState === 'reserved'
                            ? 'danger'
                            : c.protectionState === 'active'
                              ? 'ok'
                              : 'neutral'
                        }
                      >
                        {PROTECTION_LABEL[c.protectionState]}
                      </Badge>
                    </td>
                    <td data-label="受注">
                      {c.hasActiveOrder ? (
                        <Badge tone="ok">有効受注</Badge>
                      ) : c.hasOrder ? (
                        <Badge tone="neutral">過去受注</Badge>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="num" data-label="受注金額">
                      {c.orderTotal > 0 ? formatYen(c.orderTotal) : '—'}
                    </td>
                    <td className="num nowrap" data-label="最終更新">
                      {formatDate(c.lastUpdatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {detail && (
        <Modal title={detail.companyName} onClose={() => setSelected(null)} wide>
          <div className="dl">
            <div className="dl__k">施設</div>
            <div className="dl__v">{detail.facilities.filter(Boolean).join(' / ') || '—'}</div>
            <div className="dl__k">電話番号</div>
            <div className="dl__v num">{detail.phones.filter(Boolean).join(' / ') || '—'}</div>
            <div className="dl__k">Webドメイン</div>
            <div className="dl__v mono">{detail.domains.filter(Boolean).join(' / ') || '—'}</div>
            <div className="dl__k">所属代理店</div>
            <div className="dl__v">{detail.agencyIds.map((id) => agencyById(id)?.name ?? id).join(' / ') || '—'}</div>
            <div className="dl__k">担当営業</div>
            <div className="dl__v">{detail.ownerUserIds.map((id) => userById(id)?.name ?? id).join(' / ') || '—'}</div>
            <div className="dl__k">Reserved判定</div>
            <div className="dl__v">
              {detail.reserved.length > 0 ? (
                <Badge tone="danger">Reserved案件({detail.reserved.length}件)</Badge>
              ) : (
                'なし'
              )}
            </div>
            <div className="dl__k">受注</div>
            <div className="dl__v">
              {detail.hasActiveOrder ? '有効受注あり' : detail.hasOrder ? '過去に受注あり' : 'なし'}
            </div>
            <div className="dl__k">見積 / 受注金額</div>
            <div className="dl__v num">
              {formatYen(detail.quoteTotal)} / {formatYen(detail.orderTotal)}
            </div>
          </div>

          <div className="section-title" style={{ marginTop: 16 }}>
            関連案件
          </div>
          <div className="table-wrap">
            <table className="data stackable">
              <thead>
                <tr>
                  <th>案件ID</th>
                  <th>施設</th>
                  <th>代理店 / 担当</th>
                  <th>ステータス</th>
                  <th>保護期限</th>
                  <th className="num">受注</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {detail.deals.map((d) => (
                  <tr key={d.id}>
                    <td className="mono" data-label="案件ID">
                      {d.id}
                    </td>
                    <td data-label="施設">{d.facilityName || '—'}</td>
                    <td data-label="代理店 / 担当">
                      {agencyById(d.agencyId)?.name ?? '—'}
                      <div className="cell-sub">{userById(d.ownerUserId)?.name ?? '—'}</div>
                    </td>
                    <td data-label="ステータス">
                      <StatusBadge status={d.status} />
                    </td>
                    <td data-label="保護期限">
                      <ProtectionBadge expiresAt={d.protectionExpiresAt} settings={settings} showDate />
                    </td>
                    <td className="num" data-label="受注">
                      {totalOrders(d) > 0 ? formatYen(totalOrders(d)) : '—'}
                    </td>
                    <td data-label="">
                      <button
                        className="btn btn--sm"
                        onClick={() => {
                          setSelected(null)
                          navigate(`deal/${d.id}`)
                        }}
                      >
                        <Icon name="doc" size={13} />
                        開く
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="section-title" style={{ marginTop: 16 }}>
            初回・追加受注の履歴
          </div>
          {detail.deals.every((d) => d.orders.length === 0) ? (
            <p className="muted small">受注はまだありません。</p>
          ) : (
            <div className="table-wrap">
              <table className="data stackable" data-testid="company-orders">
                <thead>
                  <tr>
                    <th>受注日</th>
                    <th>区分</th>
                    <th>案件 / 施設</th>
                    <th>商品名</th>
                    <th className="num">金額</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.deals
                    .flatMap((d) => d.orders.map((o) => ({ ...o, deal: d })))
                    .sort((a, b) => (a.orderDate < b.orderDate ? 1 : -1))
                    .map((o) => (
                      <tr key={o.id} style={o.voided ? { opacity: 0.5 } : undefined}>
                        <td className="num nowrap" data-label="受注日">
                          {formatDate(o.orderDate)}
                        </td>
                        <td data-label="区分">
                          <Badge tone={o.kind === 'initial' ? 'accent' : 'info'}>
                            {o.kind === 'initial' ? '初回受注' : '追加受注'}
                          </Badge>
                          {o.voided && <Badge tone="danger">取消</Badge>}
                        </td>
                        <td data-label="案件 / 施設">
                          <span className="mono xsmall">{o.deal.id}</span>
                          <div className="cell-sub">{o.deal.facilityName || '施設名なし'}</div>
                        </td>
                        <td data-label="商品名">
                          {o.lines.map((l) => (
                            <div key={l.productName} className="xsmall">
                              {l.productName}
                              <span className="muted"> {formatYen(l.amount)}</span>
                            </div>
                          ))}
                        </td>
                        <td className="num strong" data-label="金額">
                          {formatYen(o.total)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="section-title" style={{ marginTop: 16 }}>
            重複判定・審査の履歴
          </div>
          {companyApplications.length === 0 ? (
            <p className="muted small">重複判定の記録はありません。</p>
          ) : (
            <div className="table-wrap">
              <table className="data stackable" data-testid="company-judgements">
                <thead>
                  <tr>
                    <th>申請日時</th>
                    <th>種別</th>
                    <th>申請代理店 / 申請者</th>
                    <th>判定</th>
                    <th className="num">重複可能性</th>
                    <th>審査結果</th>
                  </tr>
                </thead>
                <tbody>
                  {companyApplications.map((a) => (
                    <tr key={a.id}>
                      <td className="num nowrap" data-label="申請日時">
                        {formatDateTime(a.createdAt)}
                      </td>
                      <td data-label="種別">
                        {a.kind === 'eligibility' ? '営業可否照会' : '営業予定登録'}
                      </td>
                      <td data-label="申請代理店 / 申請者">
                        {agencyById(a.agencyId)?.name ?? '—'}
                        <div className="cell-sub">{userById(a.applicantUserId)?.name ?? '—'}</div>
                      </td>
                      <td data-label="判定">{JUDGEMENT_LABEL[a.judgement]}</td>
                      <td className="num" data-label="重複可能性">
                        {a.topScore}%
                      </td>
                      <td data-label="審査結果">
                        {a.reviewState === 'none' ? (
                          <span className="muted xsmall">審査不要</span>
                        ) : (
                          <>
                            <ReviewStateBadge state={a.reviewState} />
                            {a.decisionMessage && <div className="cell-sub">{a.decisionMessage}</div>}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="section-title" style={{ marginTop: 16 }}>
            変更履歴
          </div>
          <div className="timeline">
            {detail.deals
              .flatMap((d) => d.changes.map((c) => ({ ...c, dealId: d.id })))
              .sort((a, b) => (a.at < b.at ? 1 : -1))
              .slice(0, 12)
              .map((c) => (
                <div className="tl-item" key={c.id}>
                  <div className="tl-item__head">
                    <span className="tl-item__date num">{formatDateTime(c.at)}</span>
                    <span className="mono xsmall">{c.dealId}</span>
                    <span>{userById(c.actorUserId)?.name ?? c.actorUserId}</span>
                  </div>
                  <div className="tl-item__body">
                    {c.field}: {c.before} → {c.after}
                  </div>
                  {c.note && <div className="tl-item__note">{c.note}</div>}
                </div>
              ))}
          </div>
        </Modal>
      )}
    </>
  )
}
