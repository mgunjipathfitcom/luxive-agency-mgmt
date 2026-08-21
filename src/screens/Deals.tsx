import { useMemo, useState } from 'react'
import { useStore } from '../data/store'
import { latestQuoteTotal, totalOrders } from '../domain/dealOps'
import { formatDate } from '../domain/dates'
import { STATUS_LABEL, STATUS_ORDER, formatYen } from '../domain/format'
import { visibleDeals } from '../domain/permissions'
import { activeProductNames } from '../domain/products'
import type { Deal, DealStatus } from '../domain/types'
import { navigate } from '../router/useHashRoute'
import {
  Card,
  EmptyState,
  Icon,
  PageHead,
  ProtectionBadge,
  ReviewStateBadge,
  StatusBadge,
} from '../components/ui'

type SortKey = 'protection' | 'quote' | 'order' | 'created' | 'updated'

const SORT_LABEL: Record<SortKey, string> = {
  protection: '保護期限',
  quote: '見積金額',
  order: '受注金額',
  created: '案件登録日',
  updated: '最終更新日',
}

export function Deals({ scope }: { scope: 'all' | 'mine' }) {
  const { db, currentUser, settings, userById, agencyById } = useStore()
  const [q, setQ] = useState('')
  const [agencyId, setAgencyId] = useState('')
  const [agencyQuery, setAgencyQuery] = useState('')
  const [status, setStatus] = useState<'' | DealStatus>('')
  const [productName, setProductName] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('protection')
  const [asc, setAsc] = useState(true)

  const productOptions = useMemo(() => {
    const fromMaster = activeProductNames(db.products)
    const fromDeals = db.deals.flatMap((d) => [
      ...d.lines.map((l) => l.productName),
      ...d.amountHistory.flatMap((s) => s.lines.map((l) => l.productName)),
      ...d.orders.flatMap((o) => o.lines.map((l) => l.productName)),
    ])
    return [...new Set([...fromMaster, ...fromDeals])].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ja'))
  }, [db.products, db.deals])

  const agencyOptions = useMemo(
    () => db.agencies.filter((a) => !agencyQuery || a.name.includes(agencyQuery) || a.code.includes(agencyQuery)),
    [db.agencies, agencyQuery],
  )

  const ownerOptions = useMemo(() => {
    if (!currentUser) return []
    if (currentUser.role === 'hq') return db.users.filter((u) => u.role !== 'hq')
    return db.users.filter((u) => u.agencyId === currentUser.agencyId)
  }, [db.users, currentUser])

  const rows = useMemo(() => {
    if (!currentUser) return []
    let list = visibleDeals(currentUser, db.deals)
    if (scope === 'mine') list = list.filter((d) => d.ownerUserId === currentUser.id)
    if (agencyId) list = list.filter((d) => d.agencyId === agencyId)
    if (status) list = list.filter((d) => d.status === status)
    if (ownerId) list = list.filter((d) => d.ownerUserId === ownerId)
    if (productName) {
      list = list.filter((d) => {
        const names = new Set<string>([
          ...d.lines.map((l) => l.productName),
          ...d.amountHistory.flatMap((s) => s.lines.map((l) => l.productName)),
          ...d.orders.flatMap((o) => o.lines.map((l) => l.productName)),
        ])
        return names.has(productName)
      })
    }
    if (q.trim()) {
      const needle = q.trim().toLowerCase()
      list = list.filter((d) => {
        const owner = userById(d.ownerUserId)?.name ?? ''
        const agency = agencyById(d.agencyId)?.name ?? ''
        // 商品名は、現在の行だけでなく金額履歴・受注履歴に残るものも対象にする(§8.2)
        const productNames = [
          ...d.lines.map((l) => l.productName),
          ...d.amountHistory.flatMap((s) => s.lines.map((l) => l.productName)),
          ...d.orders.flatMap((o) => o.lines.map((l) => l.productName)),
        ]
        return (
          d.companyName.toLowerCase().includes(needle) ||
          d.facilityName.toLowerCase().includes(needle) ||
          owner.toLowerCase().includes(needle) ||
          agency.toLowerCase().includes(needle) ||
          d.id.toLowerCase().includes(needle) ||
          productNames.some((n) => n.toLowerCase().includes(needle))
        )
      })
    }

    const value = (d: Deal): number | string => {
      switch (sortKey) {
        case 'protection':
          return d.protectionExpiresAt
        case 'quote':
          return latestQuoteTotal(d)
        case 'order':
          return totalOrders(d)
        case 'created':
          return d.createdAt
        case 'updated':
          return d.updatedAt
      }
    }
    return [...list].sort((a, b) => {
      const va = value(a)
      const vb = value(b)
      if (va === vb) return a.id < b.id ? -1 : 1
      const cmp = va < vb ? -1 : 1
      return asc ? cmp : -cmp
    })
  }, [db.deals, currentUser, scope, agencyId, status, ownerId, productName, q, sortKey, asc, userById, agencyById])

  if (!currentUser) return null
  const isHq = currentUser.role === 'hq'

  const clearAll = () => {
    setQ('')
    setAgencyId('')
    setAgencyQuery('')
    setStatus('')
    setProductName('')
    setOwnerId('')
  }
  const hasFilter = !!(q || agencyId || status || productName || ownerId)

  return (
    <>
      <PageHead
        title={scope === 'mine' ? '担当案件' : isHq ? '案件管理' : '自社案件'}
        desc={
          scope === 'mine'
            ? '自分が担当している案件です。'
            : isHq
              ? '全代理店の案件を検索・並び替えできます。'
              : '自社の案件です。自分の担当以外は閲覧専用で開きます。'
        }
        actions={
          currentUser.role !== 'hq' ? (
            <button className="btn btn--primary" onClick={() => navigate('eligibility')}>
              <Icon name="search" />
              営業可否照会から始める
            </button>
          ) : undefined
        }
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
                placeholder="企業名・施設名・担当者・案件ID・商品名"
                data-testid="deals-q"
              />
            </label>
          </div>

          {isHq && (
            <>
              <div className="toolbar__item">
                <label className="field">
                  <span className="field__label">代理店名で絞る</span>
                  <input
                    className="input"
                    value={agencyQuery}
                    onChange={(e) => setAgencyQuery(e.target.value)}
                    placeholder="例: リンクス"
                    data-testid="deals-agency-query"
                  />
                </label>
              </div>
              <div className="toolbar__item">
                <label className="field">
                  <span className="field__label">所属代理店</span>
                  <select
                    className="select"
                    value={agencyId}
                    onChange={(e) => setAgencyId(e.target.value)}
                    data-testid="deals-agency"
                  >
                    <option value="">すべての代理店</option>
                    {agencyOptions.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          )}

          <div className="toolbar__item">
            <label className="field">
              <span className="field__label">案件ステータス</span>
              <select
                className="select"
                value={status}
                onChange={(e) => setStatus(e.target.value as '' | DealStatus)}
                data-testid="deals-status"
              >
                <option value="">すべて</option>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="toolbar__item">
            <label className="field">
              <span className="field__label">提案商品</span>
              <select
                className="select"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                data-testid="deals-product"
              >
                <option value="">すべて</option>
                {productOptions.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {scope === 'all' && (
            <div className="toolbar__item">
              <label className="field">
                <span className="field__label">担当営業</span>
                <select
                  className="select"
                  value={ownerId}
                  onChange={(e) => setOwnerId(e.target.value)}
                  data-testid="deals-owner"
                >
                  <option value="">すべて</option>
                  {ownerOptions.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <div className="toolbar__item">
            <label className="field">
              <span className="field__label">並び替え</span>
              <select
                className="select"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                data-testid="deals-sort"
              >
                {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                  <option key={k} value={k}>
                    {SORT_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="toolbar__end">
            <button className="btn" onClick={() => setAsc((v) => !v)} data-testid="deals-order">
              <Icon name={asc ? 'up' : 'down'} />
              {asc ? '昇順' : '降順'}
            </button>
            <button className="btn" onClick={clearAll} disabled={!hasFilter} data-testid="deals-clear">
              条件を解除
            </button>
          </div>
        </div>

        <div className="scroll-hint" data-testid="deals-summary">
          {rows.length}件 / 並び順: {SORT_LABEL[sortKey]}({asc ? '昇順' : '降順'})
          {hasFilter ? ' / 絞り込み中' : ''}
        </div>

        {rows.length === 0 ? (
          <EmptyState title="条件に合う案件がありません">
            キーワードや絞り込みを変えてみてください。
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="data stackable">
              <thead>
                <tr>
                  <th>企業名 / 施設名</th>
                  {isHq && <th>所属代理店</th>}
                  <th>担当営業</th>
                  <th>ステータス</th>
                  <th>審査</th>
                  <th className="num">見積金額</th>
                  <th className="num">受注金額</th>
                  <th>保護期限</th>
                  <th>最終更新</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr
                    key={d.id}
                    className="is-clickable"
                    onClick={() => navigate(`deal/${d.id}`)}
                    data-testid={`deal-row-${d.id}`}
                  >
                    <td data-label="企業名">
                      <div className="cell-strong">{d.companyName}</div>
                      <div className="cell-sub">
                        {d.facilityName || '施設名なし'}
                        {isHq && <> ・{d.id}</>}
                      </div>
                    </td>
                    {isHq && <td data-label="所属代理店">{agencyById(d.agencyId)?.name ?? '—'}</td>}
                    <td data-label="担当営業">{userById(d.ownerUserId)?.name ?? '—'}</td>
                    <td data-label="ステータス">
                      <StatusBadge status={d.status} />
                    </td>
                    <td data-label="審査">
                      <ReviewStateBadge state={d.reviewState} />
                    </td>
                    <td className="num" data-label="見積金額">
                      {latestQuoteTotal(d) > 0 ? formatYen(latestQuoteTotal(d)) : '—'}
                    </td>
                    <td className="num" data-label="受注金額">
                      {totalOrders(d) > 0 ? formatYen(totalOrders(d)) : '—'}
                    </td>
                    <td data-label="保護期限">
                      <ProtectionBadge expiresAt={d.protectionExpiresAt} settings={settings} showDate />
                    </td>
                    <td className="num" data-label="最終更新">
                      {formatDate(d.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
