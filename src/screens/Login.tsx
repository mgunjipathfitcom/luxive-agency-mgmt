import { useState } from 'react'
import { useStore } from '../data/store'
import { ROLE_LABEL } from '../domain/permissions'
import { Icon } from '../components/ui'
import { navigate } from '../router/useHashRoute'

const POINTS = [
  { b: '重複営業を止める', t: 'Reserved案件・有効な受注案件・保護中案件を自動で判定します' },
  { b: '保護期間を自動計算', t: '営業予定登録30日 / 商談・見積90日 / 受注365日を本部設定から算出' },
  { b: '同じ数字を全画面で共有', t: 'ダッシュボードと案件一覧・詳細は同じ集計関数を使います' },
]

export function Login() {
  const { db, login, agencyById } = useStore()
  const [filter, setFilter] = useState('')

  const personas = db.users.filter((u) => u.account !== 'suspended')
  const shown = personas.filter(
    (u) =>
      !filter ||
      u.name.includes(filter) ||
      u.email.includes(filter) ||
      (agencyById(u.agencyId)?.name ?? '').includes(filter),
  )

  const start = (id: string) => {
    login(id)
    navigate('dashboard', true)
  }

  return (
    <div className="login">
      <div className="login__hero">
        <div>
          <div className="login__logo">LUXIVE</div>
          <div className="login__tag">AGENCY MANAGEMENT SYSTEM</div>
        </div>
        <p className="login__lead">
          本部と代理店のあいだで、同じ企業・施設に営業が重なることを防ぐための管理画面です。
          営業可否照会から受注確定までを1本の流れで追いかけます。
        </p>
        <div className="login__points">
          {POINTS.map((p) => (
            <div className="login__point" key={p.b}>
              <Icon name="check" size={15} />
              <span>
                <b>{p.b}</b>
                <br />
                {p.t}
              </span>
            </div>
          ))}
        </div>
        <p className="xsmall" style={{ color: '#a1917a', marginTop: 8 }}>
          入力した内容はこのブラウザの中にだけ保存され、外部へは送信されません。
        </p>
      </div>

      <div className="login__panel">
        <div className="login__panel-inner">
          <h1 className="page-title" style={{ marginBottom: 4 }}>
            ログイン
          </h1>
          <p className="page-desc" style={{ marginBottom: 18 }}>
            試したい立場を選んでください。ロールごとに見える範囲と操作できる内容が変わります。
          </p>

          <label className="field">
            <span className="field__label">名前・代理店で絞り込む</span>
            <input
              className="input"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="例: 大槻 / リンクス"
              data-testid="login-filter"
            />
          </label>

          {(['hq', 'agency_admin', 'agency_member'] as const).map((role) => {
            const list = shown.filter((u) => u.role === role)
            if (list.length === 0) return null
            return (
              <div key={role} style={{ marginBottom: 14 }}>
                <div className="section-title">{ROLE_LABEL[role]}</div>
                {list.map((u) => (
                  <button
                    className="persona"
                    key={u.id}
                    onClick={() => start(u.id)}
                    data-testid={`login-${u.id}`}
                  >
                    <span className="persona__avatar">{u.name.slice(0, 1)}</span>
                    <span>
                      <span className="persona__name">{u.name}</span>
                      <br />
                      <span className="persona__meta">
                        {u.agencyId ? (agencyById(u.agencyId)?.name ?? '') : 'Luxive本部'} / {u.department}
                      </span>
                    </span>
                    <span className="persona__go">›</span>
                  </button>
                ))}
              </div>
            )
          })}
          {shown.length === 0 && <p className="muted small">該当する利用者がいません。</p>}
        </div>
      </div>
    </div>
  )
}
