import { useMemo, useState } from 'react'
import { useStore } from '../data/store'
import { formatDateTime } from '../domain/dates'
import { Card, EmptyState, PageHead } from '../components/ui'

export function Audit() {
  const { db, userById } = useStore()
  const [q, setQ] = useState('')
  const [type, setType] = useState('')

  const types = useMemo(() => [...new Set(db.audits.map((a) => a.targetType))], [db.audits])

  const rows = useMemo(() => {
    let list = [...db.audits].sort((a, b) => (a.at < b.at ? 1 : -1))
    if (type) list = list.filter((a) => a.targetType === type)
    if (q.trim()) {
      const n = q.trim().toLowerCase()
      list = list.filter(
        (a) =>
          a.action.toLowerCase().includes(n) ||
          a.targetId.toLowerCase().includes(n) ||
          a.detail.toLowerCase().includes(n) ||
          (userById(a.actorUserId)?.name ?? '').includes(n),
      )
    }
    return list.slice(0, 300)
  }, [db.audits, q, type, userById])

  return (
    <>
      <PageHead title="監査ログ" desc="誰が・いつ・何をしたかの記録です。試作版のためブラウザ内にだけ保存します。" />

      <Card flush>
        <div className="toolbar">
          <div className="toolbar__item toolbar__item--grow">
            <label className="field">
              <span className="field__label">キーワード</span>
              <input
                className="input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="操作・対象ID・内容・操作者"
                data-testid="audit-q"
              />
            </label>
          </div>
          <div className="toolbar__item">
            <label className="field">
              <span className="field__label">対象</span>
              <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">すべて</option>
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState title="ログがありません" />
        ) : (
          <div className="table-wrap">
            <table className="data stackable">
              <thead>
                <tr>
                  <th>日時</th>
                  <th>操作者</th>
                  <th>操作</th>
                  <th>対象</th>
                  <th>対象ID</th>
                  <th>内容</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td className="num nowrap" data-label="日時">
                      {formatDateTime(a.at)}
                    </td>
                    <td data-label="操作者">{userById(a.actorUserId)?.name ?? a.actorUserId}</td>
                    <td data-label="操作" className="cell-strong">
                      {a.action}
                    </td>
                    <td data-label="対象">{a.targetType}</td>
                    <td data-label="対象ID" className="mono">
                      {a.targetId}
                    </td>
                    <td data-label="内容">
                      <span className="xsmall">{a.detail || '—'}</span>
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
