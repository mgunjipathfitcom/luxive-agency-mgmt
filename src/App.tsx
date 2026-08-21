import { useEffect } from 'react'
import { AppShell } from './components/AppShell'
import { PreviewNotice } from './components/PreviewNotice'
import { Callout, PageHead } from './components/ui'
import { useStore } from './data/store'
import { canAccessRoute, findRoute } from './router/routes'
import { navigate, useHashRoute } from './router/useHashRoute'
import { Agencies } from './screens/Agencies'
import { AgencyUsers } from './screens/AgencyUsers'
import { Audit } from './screens/Audit'
import { Companies } from './screens/Companies'
import { Dashboard } from './screens/Dashboard'
import { DealCreate } from './screens/DealCreate'
import { DealCreateDone } from './screens/DealCreateDone'
import { DealDetail } from './screens/DealDetail'
import { Deals } from './screens/Deals'
import { Eligibility } from './screens/Eligibility'
import { Extensions } from './screens/Extensions'
import { Inquiries } from './screens/Inquiries'
import { Login } from './screens/Login'
import { Notifications } from './screens/Notifications'
import { Products } from './screens/Products'
import { Reserved } from './screens/Reserved'
import { ReviewQueue } from './screens/ReviewQueue'
import { Settings } from './screens/Settings'

function Forbidden({ path }: { path: string }) {
  return (
    <>
      <PageHead title="この画面は開けません" />
      <Callout tone="danger" title="権限がありません">
        いまのロールでは「{findRoute(path)?.label ?? path}」を開けません。
        URLを直接入力したり、ブラウザの戻る操作をしても、権限のない画面は表示しません。
      </Callout>
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn btn--primary" onClick={() => navigate('dashboard')}>
          ダッシュボードへ戻る
        </button>
      </div>
    </>
  )
}

function NotFound({ path }: { path: string }) {
  return (
    <>
      <PageHead title="画面が見つかりません" />
      <Callout tone="warn" title={`「${path}」という画面はありません`}>
        メニューから移動してください。
      </Callout>
      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn btn--primary" onClick={() => navigate('dashboard')}>
          ダッシュボードへ戻る
        </button>
      </div>
    </>
  )
}

export function App() {
  const { currentUser } = useStore()
  const loc = useHashRoute()

  const path = loc.path || 'dashboard'

  // ログイン前はどのhashでもログイン画面に留める
  useEffect(() => {
    if (!currentUser && loc.raw !== '') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [currentUser, loc.raw])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [loc.raw])

  if (!currentUser) {
    return (
      <>
        <PreviewNotice />
        <Login />
      </>
    )
  }

  const route = findRoute(path)
  let screen: React.ReactNode

  if (!route) {
    screen = <NotFound path={path} />
  } else if (!canAccessRoute(currentUser.role, path)) {
    // §2.4 メニューを隠すだけでなく、Routerでも拒否する
    screen = <Forbidden path={path} />
  } else {
    switch (route.key) {
      case 'dashboard':
        screen = <Dashboard />
        break
      case 'eligibility':
        screen = <Eligibility />
        break
      case 'deal-new':
        screen = <DealCreate />
        break
      case 'deal-done':
        screen = <DealCreateDone />
        break
      case 'my-deals':
        screen = <Deals scope="mine" />
        break
      case 'deals':
        screen = <Deals scope="all" />
        break
      case 'deal':
        screen = <DealDetail dealId={loc.segments[1] ?? ''} />
        break
      case 'review':
        screen = <ReviewQueue />
        break
      case 'companies':
        screen = <Companies />
        break
      case 'reserved':
        screen = <Reserved />
        break
      case 'products':
        screen = <Products />
        break
      case 'agencies':
        screen = <Agencies />
        break
      case 'agency-users':
        screen = <AgencyUsers />
        break
      case 'extensions':
        screen = <Extensions />
        break
      case 'inquiries':
        screen = <Inquiries />
        break
      case 'notifications':
        screen = <Notifications />
        break
      case 'settings':
        screen = <Settings />
        break
      case 'audit':
        screen = <Audit />
        break
      default:
        screen = <NotFound path={path} />
    }
  }

  return (
    <>
      <PreviewNotice />
      <AppShell path={path}>{screen}</AppShell>
    </>
  )
}
