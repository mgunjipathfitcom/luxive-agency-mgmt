import { useMemo, useState } from 'react'
import { useStore } from '../data/store'
import { formatDate, nowISO } from '../domain/dates'
import { newId } from '../domain/id'
import { isValidWebsite } from '../domain/normalize'
import type { ReservedCase } from '../domain/types'
import { Badge, Callout, Card, EmptyState, Icon, Modal, PageHead } from '../components/ui'

const EMPTY: ReservedCase = {
  id: '',
  companyName: '',
  companyNameNorm: '',
  facilityName: '',
  facilityNameNorm: '',
  phone: '',
  phoneNorm: '',
  website: '',
  websiteDomain: '',
  reason: '',
  registeredAt: '',
  active: true,
}

export function Reserved() {
  const { db, upsertReserved, toggleReserved } = useStore()
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<ReservedCase | null>(null)

  const rows = useMemo(() => {
    let list = [...db.reserved]
    if (q.trim()) {
      const n = q.trim().toLowerCase()
      list = list.filter(
        (r) =>
          r.companyName.toLowerCase().includes(n) ||
          r.facilityName.toLowerCase().includes(n) ||
          r.phone.includes(n) ||
          r.website.toLowerCase().includes(n),
      )
    }
    return list.sort((a, b) => (a.active === b.active ? (a.registeredAt < b.registeredAt ? 1 : -1) : a.active ? -1 : 1))
  }, [db.reserved, q])

  return (
    <>
      <PageHead
        title="Reserved案件管理"
        desc="本部が営業対象外に指定する企業・施設です。ここに一致すると、営業可否照会でも営業予定登録でもその場で止まります。"
        actions={
          <button
            className="btn btn--primary"
            onClick={() => setEditing({ ...EMPTY, id: newId('RS'), registeredAt: nowISO() })}
            data-testid="reserved-new"
          >
            <Icon name="plus" />
            Reserved案件を登録
          </button>
        }
      />

      <Callout tone="warn" title="施設名を入れると、その施設だけが対象になります">
        施設名を空にすると企業全体が営業不可になります。施設名を入れた場合、同じ企業の別施設は営業できますが、
        企業名が一致するため重複審査には入ります。
      </Callout>

      <Card flush>
        <div className="toolbar">
          <div className="toolbar__item toolbar__item--grow">
            <label className="field">
              <span className="field__label">キーワード</span>
              <input
                className="input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="企業名・施設名・電話番号・Webサイト"
                data-testid="reserved-q"
              />
            </label>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState title="Reserved案件はありません" />
        ) : (
          <div className="table-wrap">
            <table className="data stackable">
              <thead>
                <tr>
                  <th>企業名 / 施設名</th>
                  <th>電話番号</th>
                  <th>Webサイト</th>
                  <th>登録理由</th>
                  <th>登録日</th>
                  <th>状態</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} data-testid={`reserved-row-${r.id}`}>
                    <td data-label="企業名">
                      <div className="cell-strong">{r.companyName}</div>
                      <div className="cell-sub">{r.facilityName || '企業全体'}</div>
                    </td>
                    <td className="num" data-label="電話番号">
                      {r.phone || '—'}
                    </td>
                    <td data-label="Webサイト">{r.website || '—'}</td>
                    <td data-label="登録理由">{r.reason}</td>
                    <td className="num nowrap" data-label="登録日">
                      {formatDate(r.registeredAt)}
                    </td>
                    <td data-label="状態">
                      <Badge tone={r.active ? 'danger' : 'neutral'}>{r.active ? '営業不可' : '解除済み'}</Badge>
                    </td>
                    <td data-label="">
                      <div className="btn-row">
                        <button className="btn btn--sm" onClick={() => setEditing(r)}>
                          編集
                        </button>
                        <button
                          className="btn btn--sm"
                          onClick={() => toggleReserved(r.id, !r.active)}
                          data-testid={`reserved-toggle-${r.id}`}
                        >
                          {r.active ? '解除する' : '再指定'}
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
        <ReservedEditor
          value={editing}
          onClose={() => setEditing(null)}
          onSave={(r) => {
            upsertReserved(r)
            setEditing(null)
          }}
        />
      )}
    </>
  )
}

function ReservedEditor({
  value,
  onClose,
  onSave,
}: {
  value: ReservedCase
  onClose: () => void
  onSave: (r: ReservedCase) => void
}) {
  const [form, setForm] = useState(value)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = () => {
    const errs: Record<string, string> = {}
    if (!form.companyName.trim()) errs.companyName = '企業名を入力してください'
    if (!form.reason.trim()) errs.reason = '登録理由を入力してください'
    if (form.website.trim() && !isValidWebsite(form.website)) errs.website = 'URLの形式が正しくありません'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    onSave(form)
  }

  return (
    <Modal
      title={value.companyName ? 'Reserved案件を編集する' : 'Reserved案件を登録する'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            やめる
          </button>
          <button className="btn btn--primary" onClick={save} data-testid="reserved-save">
            保存する
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field span-2">
          <span className="field__label">
            企業名<span className="req">必須</span>
          </span>
          <input
            className="input"
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            aria-invalid={!!errors.companyName}
            data-testid="reserved-company"
          />
          {errors.companyName && <span className="field__error">{errors.companyName}</span>}
        </label>
        <label className="field">
          <span className="field__label">
            施設名<span className="opt">任意</span>
          </span>
          <input
            className="input"
            value={form.facilityName}
            onChange={(e) => setForm({ ...form, facilityName: e.target.value })}
          />
          <span className="field__hint">空欄なら企業全体が対象です。</span>
        </label>
        <label className="field">
          <span className="field__label">
            電話番号<span className="opt">任意</span>
          </span>
          <input
            className="input"
            inputMode="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </label>
        <label className="field span-2">
          <span className="field__label">
            Webサイト<span className="opt">任意</span>
          </span>
          <input
            className="input"
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
            aria-invalid={!!errors.website}
          />
          {errors.website && <span className="field__error">{errors.website}</span>}
        </label>
        <label className="field span-2">
          <span className="field__label">
            登録理由<span className="req">必須</span>
          </span>
          <textarea
            className="textarea"
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            placeholder="例: 本部直販。全国チェーンのため代理店営業の対象外"
            aria-invalid={!!errors.reason}
          />
          {errors.reason && <span className="field__error">{errors.reason}</span>}
        </label>
      </div>
    </Modal>
  )
}
