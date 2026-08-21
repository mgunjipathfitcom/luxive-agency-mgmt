import { useEffect, type ReactNode } from 'react'
import { JUDGEMENT_LABEL, JUDGEMENT_TONE, REVIEW_STATE_LABEL, STATUS_LABEL } from '../domain/format'
import { remainingDays } from '../domain/protection'
import type { DealStatus, Judgement, ReviewState, Settings } from '../domain/types'

export type Tone = 'ok' | 'warn' | 'danger' | 'info' | 'accent' | 'neutral'

const ICONS: Record<string, string> = {
  chart: 'M4 19h16M6 16V9m4 7V5m4 11v-6m4 6v-9',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 13l4 4L19 7',
  folder: 'M4 7a2 2 0 0 1 2-2h3.5l2 2H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  doc: 'M7 3h7l5 5v13H7zM14 3v5h5',
  shield: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z',
  building: 'M4 21V6l7-3 7 3v15M9 21v-4h6v4M8 9h.01M12 9h.01M16 9h.01M8 13h.01M12 13h.01M16 13h.01',
  lock: 'M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3',
  box: 'M3 8l9-4 9 4-9 4-9-4Zm0 0v8l9 4 9-4V8',
  store: 'M4 9h16l-1 11H5L4 9Zm2-4h12l1 4H5l1-4ZM10 20v-5h4v5',
  users: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20c0-3 3-5 6-5s6 2 6 5m2-5c3 0 6 2 6 5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3 2',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  bell: 'M6 10a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6ZM10 20a2 2 0 0 0 4 0',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-3a8 8 0 0 0-.2-1.7l2-1.5-2-3.4-2.3 1a8 8 0 0 0-3-1.7L14 2h-4l-.5 2.7a8 8 0 0 0-3 1.7l-2.3-1-2 3.4 2 1.5a8.2 8.2 0 0 0 0 3.4l-2 1.5 2 3.4 2.3-1a8 8 0 0 0 3 1.7L10 22h4l.5-2.7a8 8 0 0 0 3-1.7l2.3 1 2-3.4-2-1.5c.13-.55.2-1.12.2-1.7Z',
  history: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4M12 8v4l3 2',
  back: 'M15 6l-6 6 6 6',
  close: 'M6 6l12 12M18 6L6 18',
  menu: 'M4 7h16M4 12h16M4 17h16',
  external: 'M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  logout: 'M15 12H4m0 0l4-4m-4 4l4 4M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5',
  refresh: 'M4 12a8 8 0 0 1 13.7-5.7L20 8m0 0V4m0 4h-4M20 12a8 8 0 0 1-13.7 5.7L4 16m0 0v4m0-4h4',
  download: 'M12 4v11m0 0l-4-4m4 4l4-4M5 19h14',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
}

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const d = ICONS[name] ?? ICONS.doc
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: `0 0 ${size}px` }}
    >
      <path d={d} />
    </svg>
  )
}

export function Badge({
  tone = 'neutral',
  children,
  dot = false,
}: {
  tone?: Tone
  children: ReactNode
  dot?: boolean
}) {
  const cls = tone === 'neutral' ? 'badge' : `badge badge--${tone}`
  return (
    <span className={cls}>
      {dot && <span className="badge__dot" />}
      {children}
    </span>
  )
}

export function StatusBadge({ status }: { status: DealStatus }) {
  const tone: Tone =
    status === 'ordered' ? 'ok' : status === 'quoted' ? 'accent' : status === 'meeting' ? 'info' : 'neutral'
  return <Badge tone={tone}>{STATUS_LABEL[status]}</Badge>
}

export function JudgementBadge({ judgement }: { judgement: Judgement }) {
  return <Badge tone={JUDGEMENT_TONE[judgement]}>{JUDGEMENT_LABEL[judgement]}</Badge>
}

export function ReviewStateBadge({ state }: { state: ReviewState }) {
  if (state === 'none') return <span className="muted xsmall">—</span>
  const tone: Tone =
    state === 'approved' ? 'ok' : state === 'pending' ? 'warn' : state === 'blocked' ? 'danger' : 'info'
  return <Badge tone={tone}>{REVIEW_STATE_LABEL[state]}</Badge>
}

/** 保護状態バッジ。残り日数は保存せず毎回算出する(§10.6) */
export function ProtectionBadge({
  expiresAt,
  settings,
  showDate = false,
}: {
  expiresAt: string
  settings: Settings
  showDate?: boolean
}) {
  const left = remainingDays(expiresAt)
  const tone: Tone = left < 0 ? 'danger' : left <= settings.warningDays ? 'warn' : 'ok'
  const text = left < 0 ? `保護期限切れ(${-left}日経過)` : `残り${left}日`
  return (
    <span className="row row--tight">
      <Badge tone={tone} dot>
        {text}
      </Badge>
      {showDate && <span className="xsmall muted num">{expiresAt.replace(/-/g, '/')}</span>}
    </span>
  )
}

export function Card({
  title,
  desc,
  actions,
  children,
  flush = false,
  foot,
  id,
}: {
  title?: ReactNode
  desc?: ReactNode
  actions?: ReactNode
  children: ReactNode
  flush?: boolean
  foot?: ReactNode
  id?: string
}) {
  return (
    <section className="card" id={id}>
      {(title || actions) && (
        <header className="card__head">
          <div>
            {title && <h2 className="card__title">{title}</h2>}
            {desc && <div className="card__desc">{desc}</div>}
          </div>
          {actions && <div className="card__actions">{actions}</div>}
        </header>
      )}
      <div className={flush ? 'card__body card__body--flush' : 'card__body'}>{children}</div>
      {foot && <footer className="card__foot">{foot}</footer>}
    </section>
  )
}

export function Field({
  label,
  required,
  optional,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode
  required?: boolean
  optional?: boolean
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  className?: string
}) {
  return (
    <label className={className ? `field ${className}` : 'field'}>
      <span className="field__label">
        {label}
        {required && <span className="req">必須</span>}
        {optional && <span className="opt">任意</span>}
      </span>
      {children}
      {hint && !error && <span className="field__hint">{hint}</span>}
      {error && <span className="field__error">{error}</span>}
    </label>
  )
}

export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'ok' | 'warn' | 'danger'
  title?: ReactNode
  children: ReactNode
}) {
  return (
    <div className={`callout callout--${tone}`}>
      {title && <div className="callout__title">{title}</div>}
      <div>{children}</div>
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__title">{title}</div>
      {children}
    </div>
  )
}

export function Meter({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value))
  const cls = v >= 80 ? 'meter__bar meter__bar--danger' : v >= 50 ? 'meter__bar meter__bar--warn' : 'meter__bar'
  return (
    <span className="meter-row">
      <span className="meter">
        <span className={cls} style={{ width: `${v}%` }} />
      </span>
      <span className="meter-row__value">{v}%</span>
    </span>
  )
}

export function Modal({
  title,
  children,
  onClose,
  footer,
  wide = false,
}: {
  title: ReactNode
  children: ReactNode
  onClose: () => void
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={wide ? 'modal modal--wide' : 'modal'} role="dialog" aria-modal="true">
        <header className="modal__head">
          <h2 className="modal__title">{title}</h2>
          <button className="btn btn--ghost btn--sm modal__close" onClick={onClose} aria-label="閉じる">
            <Icon name="close" />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="section-title">{children}</div>
}

export function PageHead({
  title,
  desc,
  actions,
  breadcrumb,
}: {
  title: ReactNode
  desc?: ReactNode
  actions?: ReactNode
  breadcrumb?: ReactNode
}) {
  return (
    <div className="page-head">
      {breadcrumb && <div className="breadcrumb">{breadcrumb}</div>}
      <div className="page-head__row">
        <div>
          <h1 className="page-title">{title}</h1>
          {desc && <p className="page-desc">{desc}</p>}
        </div>
        {actions && <div className="page-head__actions">{actions}</div>}
      </div>
    </div>
  )
}
