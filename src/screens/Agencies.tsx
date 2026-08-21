import { useMemo, useState } from 'react'
import { useStore } from '../data/store'
import { formatDate, nowISO } from '../domain/dates'
import { formatYen } from '../domain/format'
import { latestQuoteTotal, totalOrders } from '../domain/dealOps'
import { newId } from '../domain/id'
import type { Agency } from '../domain/types'
import { Badge, Card, EmptyState, Icon, Modal, PageHead } from '../components/ui'
import { navigate } from '../router/useHashRoute'

const EMPTY: Agency = {
  id: '',
  code: '',
  name: '',
  area: '',
  contactEmail: '',
  contactPhone: '',
  createdAt: '',
  active: true,
}

export function Agencies() {
  const { db, upsertAgency } = useStore()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Agency | null>(null)

  const rows = useMemo(() => {
    const list = db.agencies.filter(
      (a) => !q.trim() || a.name.includes(q.trim()) || a.code.includes(q.trim()) || a.area.includes(q.trim()),
    )
    return list.map((a) => {
      const deals = db.deals.filter((d) => d.agencyId === a.id)
      const today = new Date().toISOString().slice(0, 10)
      return {
        agency: a,
        deals: deals.length,
        users: db.users.filter((u) => u.agencyId === a.id).length,
        activeOrders: deals.filter((d) => d.status === 'ordered' && d.protectionExpiresAt >= today).length,
        quote: deals.reduce((s, d) => s + latestQuoteTotal(d), 0),
        order: deals.reduce((s, d) => s + totalOrders(d), 0),
        pending: db.reviews.filter((r) => r.agencyId === a.id && r.state === 'pending').length,
      }
    })
  }, [db, q])

  return (
    <>
      <PageHead
        title="代理店"
        desc="代理店の基本情報と、案件・受注の状況をまとめて確認します。"
        actions={
          <button
            className="btn btn--primary"
            onClick={() => setEditing({ ...EMPTY, id: newId('AG'), createdAt: nowISO() })}
            data-testid="agency-new"
          >
            <Icon name="plus" />
            代理店を登録
          </button>
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
                placeholder="代理店名・コード・エリア"
                data-testid="agency-q"
              />
            </label>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState title="該当する代理店がありません" />
        ) : (
          <div className="table-wrap">
            <table className="data stackable">
              <thead>
                <tr>
                  <th>代理店名</th>
                  <th>コード / エリア</th>
                  <th>連絡先</th>
                  <th className="num">ユーザー</th>
                  <th className="num">案件</th>
                  <th className="num">有効受注</th>
                  <th className="num">見積金額</th>
                  <th className="num">受注金額</th>
                  <th>審査待ち</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.agency.id} data-testid={`agency-row-${r.agency.id}`}>
                    <td data-label="代理店名">
                      <div className="cell-strong">{r.agency.name}</div>
                      <div className="cell-sub">登録 {formatDate(r.agency.createdAt)}</div>
                    </td>
                    <td data-label="コード / エリア">
                      <div className="mono">{r.agency.code}</div>
                      <div className="cell-sub">{r.agency.area}</div>
                    </td>
                    <td data-label="連絡先">
                      <div className="xsmall">{r.agency.contactEmail}</div>
                      <div className="xsmall muted num">{r.agency.contactPhone}</div>
                    </td>
                    <td className="num" data-label="ユーザー">
                      {r.users}
                    </td>
                    <td className="num" data-label="案件">
                      {r.deals}
                    </td>
                    <td className="num" data-label="有効受注">
                      {r.activeOrders}
                    </td>
                    <td className="num" data-label="見積金額">
                      {r.quote > 0 ? formatYen(r.quote) : '—'}
                    </td>
                    <td className="num" data-label="受注金額">
                      {r.order > 0 ? formatYen(r.order) : '—'}
                    </td>
                    <td data-label="審査待ち">
                      {r.pending > 0 ? <Badge tone="warn">{r.pending}件</Badge> : <span className="muted">—</span>}
                    </td>
                    <td data-label="">
                      <div className="btn-row">
                        <button className="btn btn--sm" onClick={() => setEditing(r.agency)}>
                          編集
                        </button>
                        <button className="btn btn--sm" onClick={() => navigate('deals')}>
                          案件を見る
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <AgencyEditor
          value={editing}
          onClose={() => setEditing(null)}
          onSave={(a) => {
            upsertAgency(a)
            setEditing(null)
          }}
        />
      )}
    </>
  )
}

function AgencyEditor({
  value,
  onClose,
  onSave,
}: {
  value: Agency
  onClose: () => void
  onSave: (a: Agency) => void
}) {
  const [form, setForm] = useState(value)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = () => {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = '代理店名を入力してください'
    if (!form.code.trim()) errs.code = 'コードを入力してください'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    onSave(form)
  }

  return (
    <Modal
      title={value.name ? '代理店を編集する' : '代理店を登録する'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            やめる
          </button>
          <button className="btn btn--primary" onClick={save} data-testid="agency-save">
            保存する
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span className="field__label">
            代理店名<span className="req">必須</span>
          </span>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            aria-invalid={!!errors.name}
          />
          {errors.name && <span className="field__error">{errors.name}</span>}
        </label>
        <label className="field">
          <span className="field__label">
            コード<span className="req">必須</span>
          </span>
          <input
            className="input"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            aria-invalid={!!errors.code}
          />
          {errors.code && <span className="field__error">{errors.code}</span>}
        </label>
        <label className="field">
          <span className="field__label">エリア</span>
          <input className="input" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">代表電話</span>
          <input
            className="input"
            inputMode="tel"
            value={form.contactPhone}
            onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
          />
        </label>
        <label className="field span-2">
          <span className="field__label">連絡先メール</span>
          <input
            className="input"
            type="email"
            value={form.contactEmail}
            onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
          />
        </label>
      </div>
    </Modal>
  )
}
