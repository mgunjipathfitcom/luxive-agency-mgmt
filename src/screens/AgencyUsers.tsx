import { useMemo, useState } from 'react'
import { useStore } from '../data/store'
import { formatDateTime, nowISO } from '../domain/dates'
import { newId } from '../domain/id'
import { ROLE_LABEL, canManageAgencyUsers } from '../domain/permissions'
import { STATUS_LABEL } from '../domain/format'
import type { AccountState, EmploymentState, User } from '../domain/types'
import { Badge, Callout, Card, EmptyState, Icon, Modal, PageHead } from '../components/ui'

const ACCOUNT_LABEL: Record<AccountState, string> = {
  invited: '招待中',
  active: '利用中',
  suspended: '利用停止',
}
const EMPLOYMENT_LABEL: Record<EmploymentState, string> = {
  active: '在籍中',
  leave: '休職中',
  retired: '退職済み',
}

export function AgencyUsers() {
  const { db, currentUser, agencyById, upsertAgencyUser, setUserAccount, setUserEmployment, pushToast } = useStore()
  const [agencyFilter, setAgencyFilter] = useState('')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<User | null>(null)
  const [handoverFrom, setHandoverFrom] = useState<User | null>(null)

  const isHq = currentUser?.role === 'hq'
  const scopeAgencyId = isHq ? agencyFilter : (currentUser?.agencyId ?? '')

  const rows = useMemo(() => {
    let list = db.users.filter((u) => u.role !== 'hq')
    if (scopeAgencyId) list = list.filter((u) => u.agencyId === scopeAgencyId)
    if (!isHq) list = list.filter((u) => u.agencyId === currentUser?.agencyId)
    if (q.trim()) {
      const n = q.trim().toLowerCase()
      list = list.filter(
        (u) => u.name.toLowerCase().includes(n) || u.email.toLowerCase().includes(n) || u.department.includes(n),
      )
    }
    return list
  }, [db.users, scopeAgencyId, isHq, currentUser, q])

  if (!currentUser) return null

  const canManage = (u: User) => canManageAgencyUsers(currentUser, u.agencyId)

  const dealCount = (userId: string) => db.deals.filter((d) => d.ownerUserId === userId).length

  return (
    <>
      <PageHead
        title="代理店ユーザー"
        desc={
          isHq
            ? '本部は閲覧専用です。登録・編集・引継ぎは各代理店の管理者が行います。'
            : '自社のユーザーを登録・編集し、担当案件の引継ぎを行います。'
        }
        actions={
          !isHq ? (
            <button
              className="btn btn--primary"
              onClick={() =>
                setEditing({
                  id: newId('U'),
                  agencyId: currentUser.agencyId,
                  role: 'agency_member',
                  name: '',
                  email: '',
                  department: '',
                  employment: 'active',
                  account: 'invited',
                  invitedAt: null,
                  lastLoginAt: null,
                  createdAt: nowISO(),
                })
              }
              data-testid="user-new"
            >
              <Icon name="plus" />
              ユーザーを登録
            </button>
          ) : undefined
        }
      />

      {isHq && (
        <Callout tone="info" title="本部からは変更できません">
          代理店ユーザーの登録・編集・招待・利用停止・引継ぎは、代理店管理者の操作です。本部は状況の確認だけ行えます。
        </Callout>
      )}

      <Card flush>
        <div className="toolbar">
          {isHq && (
            <div className="toolbar__item">
              <label className="field">
                <span className="field__label">代理店</span>
                <select
                  className="select"
                  value={agencyFilter}
                  onChange={(e) => setAgencyFilter(e.target.value)}
                  data-testid="users-agency"
                >
                  <option value="">すべての代理店</option>
                  {db.agencies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <div className="toolbar__item toolbar__item--grow">
            <label className="field">
              <span className="field__label">キーワード</span>
              <input
                className="input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="氏名・メール・部署"
                data-testid="users-q"
              />
            </label>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState title="該当するユーザーがいません" />
        ) : (
          <div className="table-wrap">
            <table className="data stackable">
              <thead>
                <tr>
                  <th>氏名</th>
                  {isHq && <th>代理店</th>}
                  <th>メール</th>
                  <th>部署 / 権限</th>
                  <th>在籍</th>
                  <th>アカウント</th>
                  <th className="num">担当案件</th>
                  <th>最終ログイン</th>
                  {!isHq && <th></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id} data-testid={`user-row-${u.id}`}>
                    <td data-label="氏名">
                      <div className="cell-strong">{u.name}</div>
                    </td>
                    {isHq && <td data-label="代理店">{agencyById(u.agencyId)?.name ?? '—'}</td>}
                    <td data-label="メール">
                      <span className="xsmall">{u.email}</span>
                    </td>
                    <td data-label="部署 / 権限">
                      {u.department}
                      <div className="cell-sub">{ROLE_LABEL[u.role]}</div>
                    </td>
                    <td data-label="在籍">
                      <Badge tone={u.employment === 'active' ? 'ok' : u.employment === 'leave' ? 'warn' : 'neutral'}>
                        {EMPLOYMENT_LABEL[u.employment]}
                      </Badge>
                    </td>
                    <td data-label="アカウント">
                      <Badge tone={u.account === 'active' ? 'ok' : u.account === 'invited' ? 'info' : 'danger'}>
                        {ACCOUNT_LABEL[u.account]}
                      </Badge>
                    </td>
                    <td className="num" data-label="担当案件">
                      {dealCount(u.id)}
                    </td>
                    <td className="num nowrap" data-label="最終ログイン">
                      {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : '—'}
                    </td>
                    {!isHq && (
                      <td data-label="">
                        <div className="btn-row">
                          <button className="btn btn--sm" onClick={() => setEditing(u)} disabled={!canManage(u)}>
                            編集
                          </button>
                          <button
                            className="btn btn--sm"
                            disabled={!canManage(u)}
                            onClick={() => {
                              upsertAgencyUser({ ...u, account: 'invited', invitedAt: nowISO() })
                              pushToast('ok', `${u.name} さんへ招待メールを送りました(試作版のため実送信はしません)`)
                            }}
                          >
                            招待{u.account === 'invited' ? '再送' : ''}
                          </button>
                          <button
                            className="btn btn--sm"
                            disabled={!canManage(u)}
                            onClick={() => setUserAccount(u.id, u.account === 'suspended' ? 'active' : 'suspended')}
                            data-testid={`user-suspend-${u.id}`}
                          >
                            {u.account === 'suspended' ? '再開' : '利用停止'}
                          </button>
                          <button
                            className="btn btn--sm"
                            disabled={!canManage(u)}
                            onClick={() => {
                              pushToast('ok', `${u.name} さんへパスワード再設定の案内を送りました(試作版のため実送信はしません)`)
                            }}
                          >
                            パスワード再設定
                          </button>
                          <button
                            className="btn btn--sm"
                            disabled={!canManage(u) || dealCount(u.id) === 0}
                            onClick={() => setHandoverFrom(u)}
                            data-testid={`user-handover-${u.id}`}
                          >
                            引継ぎ
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="引継ぎ履歴" desc="誰から誰へ、いつ、どの案件を移したか">
        {db.handovers.filter((h) => isHq || h.agencyId === currentUser.agencyId).length === 0 ? (
          <EmptyState title="引継ぎの記録はありません" />
        ) : (
          <div className="table-wrap">
            <table className="data stackable">
              <thead>
                <tr>
                  <th>日時</th>
                  <th>引継ぎ元</th>
                  <th>引継ぎ先</th>
                  <th>実行者</th>
                  <th>方式</th>
                  <th>対象案件</th>
                </tr>
              </thead>
              <tbody>
                {db.handovers
                  .filter((h) => isHq || h.agencyId === currentUser.agencyId)
                  .map((h) => (
                    <tr key={h.id}>
                      <td className="num nowrap" data-label="日時">
                        {formatDateTime(h.at)}
                      </td>
                      <td data-label="引継ぎ元">{db.users.find((u) => u.id === h.fromUserId)?.name ?? h.fromUserId}</td>
                      <td data-label="引継ぎ先">{db.users.find((u) => u.id === h.toUserId)?.name ?? h.toUserId}</td>
                      <td data-label="実行者">{db.users.find((u) => u.id === h.actorUserId)?.name ?? h.actorUserId}</td>
                      <td data-label="方式">
                        {h.mode === 'single' ? '個別' : h.mode === 'bulk' ? '一括' : '全件'}
                      </td>
                      <td data-label="対象案件">
                        <span className="mono xsmall">{h.dealIds.join(', ')}</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <UserEditor
          value={editing}
          onClose={() => setEditing(null)}
          onSave={(u) => {
            upsertAgencyUser(u)
            setEditing(null)
          }}
          onEmployment={(e) => setUserEmployment(editing.id, e)}
        />
      )}

      {handoverFrom && <HandoverModal from={handoverFrom} onClose={() => setHandoverFrom(null)} />}
    </>
  )
}

function UserEditor({
  value,
  onClose,
  onSave,
  onEmployment,
}: {
  value: User
  onClose: () => void
  onSave: (u: User) => void
  onEmployment: (e: EmploymentState) => void
}) {
  const [form, setForm] = useState(value)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = () => {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = '氏名を入力してください'
    if (!form.email.trim()) errs.email = 'メールアドレスを入力してください'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'メールアドレスの形式が正しくありません'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    onEmployment(form.employment)
    onSave(form)
  }

  return (
    <Modal
      title={value.name ? 'ユーザーを編集する' : 'ユーザーを登録する'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            やめる
          </button>
          <button className="btn btn--primary" onClick={save} data-testid="user-save">
            保存する
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span className="field__label">
            氏名<span className="req">必須</span>
          </span>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            aria-invalid={!!errors.name}
            data-testid="user-name"
          />
          {errors.name && <span className="field__error">{errors.name}</span>}
        </label>
        <label className="field">
          <span className="field__label">
            メールアドレス<span className="req">必須</span>
          </span>
          <input
            className="input"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            aria-invalid={!!errors.email}
            data-testid="user-email"
          />
          {errors.email && <span className="field__error">{errors.email}</span>}
        </label>
        <label className="field">
          <span className="field__label">部署</span>
          <input
            className="input"
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
          />
        </label>
        <label className="field">
          <span className="field__label">権限</span>
          <select
            className="select"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as User['role'] })}
            data-testid="user-role"
          >
            <option value="agency_member">代理店一般ユーザー</option>
            <option value="agency_admin">代理店管理者</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">在籍状態</span>
          <select
            className="select"
            value={form.employment}
            onChange={(e) => setForm({ ...form, employment: e.target.value as EmploymentState })}
          >
            <option value="active">在籍中</option>
            <option value="leave">休職中</option>
            <option value="retired">退職済み</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">アカウント状態</span>
          <select
            className="select"
            value={form.account}
            onChange={(e) => setForm({ ...form, account: e.target.value as AccountState })}
          >
            <option value="invited">招待中</option>
            <option value="active">利用中</option>
            <option value="suspended">利用停止</option>
          </select>
        </label>
      </div>
      <p className="xsmall muted">
        パスワードはこの画面では扱いません。招待メールと再設定案内のリンクから本人が設定します(試作版のため実送信はしません)。
      </p>
    </Modal>
  )
}

function HandoverModal({ from, onClose }: { from: User; onClose: () => void }) {
  const { db, handoverDeals, settings } = useStore()
  const myDeals = db.deals.filter((d) => d.ownerUserId === from.id)
  const candidates = db.users.filter(
    (u) => u.agencyId === from.agencyId && u.id !== from.id && u.account !== 'suspended',
  )
  const [toUserId, setToUserId] = useState(candidates[0]?.id ?? '')
  const [selected, setSelected] = useState<string[]>([])

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const run = (mode: 'single' | 'bulk' | 'all') => {
    const ids = mode === 'all' ? myDeals.map((d) => d.id) : selected
    if (!toUserId || ids.length === 0) return
    handoverDeals(from.id, toUserId, ids, mode)
    onClose()
  }

  return (
    <Modal
      title={`${from.name} さんの担当案件を引き継ぐ`}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            やめる
          </button>
          <button
            className="btn"
            disabled={!toUserId || selected.length === 0}
            onClick={() => run(selected.length === 1 ? 'single' : 'bulk')}
            data-testid="handover-selected"
          >
            選んだ{selected.length}件を引継ぎ
          </button>
          <button
            className="btn btn--primary"
            disabled={!toUserId || myDeals.length === 0}
            onClick={() => run('all')}
            data-testid="handover-all"
          >
            全件({myDeals.length}件)を引継ぎ
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field__label">引継ぎ先</span>
        <select
          className="select"
          value={toUserId}
          onChange={(e) => setToUserId(e.target.value)}
          data-testid="handover-to"
        >
          {candidates.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}({ROLE_LABEL[u.role]})
            </option>
          ))}
        </select>
        {candidates.length === 0 && <span className="field__error">引継ぎ先になれるユーザーがいません</span>}
      </label>

      <div className="section-title">対象の案件</div>
      {myDeals.length === 0 ? (
        <p className="muted small">担当案件はありません。</p>
      ) : (
        <div className="table-wrap">
          <table className="data stackable">
            <thead>
              <tr>
                <th></th>
                <th>企業名 / 施設</th>
                <th>ステータス</th>
                <th>保護期限</th>
              </tr>
            </thead>
            <tbody>
              {myDeals.map((d) => (
                <tr key={d.id}>
                  <td data-label="">
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={selected.includes(d.id)}
                        onChange={() => toggle(d.id)}
                        data-testid={`handover-pick-${d.id}`}
                      />
                      <span className="xsmall">選ぶ</span>
                    </label>
                  </td>
                  <td data-label="企業名">
                    <div className="cell-strong">{d.companyName}</div>
                    <div className="cell-sub">{d.facilityName || '施設名なし'}</div>
                  </td>
                  <td data-label="ステータス">{STATUS_LABEL[d.status]}</td>
                  <td data-label="保護期限" className="num">
                    {d.protectionExpiresAt.replace(/-/g, '/')}
                    <span className="cell-sub">
                      {d.protectionExpiresAt >= new Date().toISOString().slice(0, 10) ? '保護中' : '期限切れ'}
                      {settings.warningDays > 0 ? '' : ''}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
