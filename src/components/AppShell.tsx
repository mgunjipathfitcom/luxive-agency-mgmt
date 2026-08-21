import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from '../data/store'
import { ROLE_LABEL } from '../domain/permissions'
import { findRoute, menuFor, routeLabel, type RouteDef } from '../router/routes'
import { navigate } from '../router/useHashRoute'
import { Icon } from './ui'

const GROUP_TITLE: Record<RouteDef['group'], string> = {
  main: '営業',
  manage: '管理',
  support: 'サポート',
}

export function Toasts() {
  const { toasts, dismissToast } = useStore()
  if (toasts.length === 0) return null
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`}>
          <span>{t.message}</span>
          <button className="toast__close" onClick={() => dismissToast(t.id)} aria-label="閉じる">
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

export function AppShell({ path, children }: { path: string; children: ReactNode }) {
  const { currentUser, db, logout, resetDemo, agencyById } = useStore()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setOpen(false)
  }, [path])

  if (!currentUser) return <>{children}</>

  const items = menuFor(currentUser.role)
  const groups: RouteDef['group'][] = ['main', 'manage', 'support']
  const agency = agencyById(currentUser.agencyId)

  const pendingReviews = db.reviews.filter((r) => r.state === 'pending').length
  const unreadNotifications = db.notifications.filter(
    (n) => n.recipientUserId === currentUser.id && !n.readAt,
  ).length
  const pendingExtensions = db.extensions.filter(
    (e) => e.state === 'pending' && (currentUser.role === 'hq' || e.agencyId === currentUser.agencyId),
  ).length
  const openInquiries = db.inquiries.filter(
    (q) => q.state === 'open' && (currentUser.role === 'hq' || q.agencyId === currentUser.agencyId),
  ).length

  const badgeFor = (key: string): number => {
    if (key === 'review') return pendingReviews
    if (key === 'notifications') return unreadNotifications
    if (key === 'extensions') return pendingExtensions
    if (key === 'inquiries' && currentUser.role === 'hq') return openInquiries
    return 0
  }

  const current = findRoute(path)
  const title = current ? routeLabel(current, currentUser.role) : 'Luxive Agency Management'

  return (
    <div className="shell">
      {open && <div className="sidebar-backdrop" onClick={() => setOpen(false)} />}
      <aside className={open ? 'sidebar sidebar--open' : 'sidebar'} data-testid="sidebar">
        <div className="sidebar__brand">
          <div className="sidebar__logo">LUXIVE</div>
          <div className="sidebar__sub">AGENCY MANAGEMENT</div>
        </div>
        {groups.map((g) => {
          const list = items.filter((r) => r.group === g)
          if (list.length === 0) return null
          return (
            <nav className="sidebar__group" key={g}>
              <div className="sidebar__group-title">{GROUP_TITLE[g]}</div>
              {list.map((r) => {
                const badge = badgeFor(r.key)
                return (
                  <button
                    key={r.key}
                    className={path === r.path ? 'navitem navitem--active' : 'navitem'}
                    onClick={() => navigate(r.path)}
                    data-testid={`nav-${r.key}`}
                  >
                    <Icon name={r.icon} />
                    <span>{routeLabel(r, currentUser.role)}</span>
                    {badge > 0 && <span className="navitem__badge">{badge}</span>}
                  </button>
                )
              })}
            </nav>
          )
        })}
        <div className="sidebar__foot">
          <div>{currentUser.role === 'hq' ? 'Luxive本部' : (agency?.name ?? '')}</div>
          <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn btn--sm btn--ghost" style={{ color: '#d9d1c3' }} onClick={resetDemo}>
              <Icon name="refresh" size={14} />
              データ初期化
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="menu-toggle" onClick={() => setOpen((v) => !v)} aria-label="メニュー" data-testid="menu-toggle">
            <Icon name="menu" size={18} />
          </button>
          <div className="topbar__title">{title}</div>
          <div className="topbar__spacer" />
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => navigate('notifications')}
            aria-label="通知"
            data-testid="topbar-notifications"
          >
            <Icon name="bell" />
            {unreadNotifications > 0 && <span className="navitem__badge">{unreadNotifications}</span>}
          </button>
          <div className="topbar__user">
            <span className="topbar__avatar">{currentUser.name.slice(0, 1)}</span>
            <span className="topbar__meta">
              <span className="topbar__name">{currentUser.name}</span>
              <br />
              <span className="topbar__role">{ROLE_LABEL[currentUser.role]}</span>
            </span>
          </div>
          <button className="btn btn--ghost btn--sm" onClick={logout} aria-label="ログアウト" data-testid="logout">
            <Icon name="logout" />
          </button>
        </header>
        <main className="content">{children}</main>
      </div>
      <Toasts />
    </div>
  )
}
