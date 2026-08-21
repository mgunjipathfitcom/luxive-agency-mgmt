import { useMemo, useState } from 'react'
import { useStore } from '../data/store'
import { formatDate, formatDateTime, isValidDateISO, today } from '../domain/dates'
import { latestQuoteTotal, totalOrders } from '../domain/dealOps'
import {
  FLOW_STEPS,
  STATUS_LABEL,
  STATUS_ORDER,
  formatYen,
  parseAmount,
  statusIndex,
} from '../domain/format'
import { canEditDeal, canSeeHqOnlyDealFields, canViewDeal } from '../domain/permissions'
import { activeProductNames, mergeLines } from '../domain/products'
import { protectionDaysFor, remainingDays } from '../domain/protection'
import { orderStateFor } from '../domain/dealOps'
import type { Deal, DealProductLine, DealStatus } from '../domain/types'
import { navigate } from '../router/useHashRoute'
import {
  Badge,
  Callout,
  Card,
  EmptyState,
  Icon,
  JudgementBadge,
  Modal,
  PageHead,
  ProtectionBadge,
  ReviewStateBadge,
  StatusBadge,
} from '../components/ui'

export function DealDetail({ dealId }: { dealId: string }) {
  const store = useStore()
  const { db, currentUser, settings, userById, agencyById, dealById } = store
  const deal = dealById(dealId)

  if (!currentUser) return null

  if (!deal) {
    return (
      <>
        <PageHead title="案件詳細" />
        <Callout tone="warn" title="案件が見つかりません">
          削除されたか、URLが正しくない可能性があります。
        </Callout>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => navigate('deals')}>
            案件一覧へ戻る
          </button>
        </div>
      </>
    )
  }

  // §2.4 案件詳細を開くときも、選択された案件IDに対して閲覧権限を再確認する
  if (!canViewDeal(currentUser, deal)) {
    return (
      <>
        <PageHead title="案件詳細" />
        <Callout tone="danger" title="この案件は閲覧できません">
          他の代理店の案件です。所属代理店の案件だけが閲覧できます。
        </Callout>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => navigate('deals')}>
            案件一覧へ戻る
          </button>
        </div>
      </>
    )
  }

  const editable = canEditDeal(currentUser, deal)
  const showHqFields = canSeeHqOnlyDealFields(currentUser)

  return (
    <>
      <PageHead
        breadcrumb={
          <>
            <button onClick={() => navigate(currentUser.role === 'hq' ? 'deals' : 'my-deals')}>
              <Icon name="back" size={12} /> 一覧へ戻る
            </button>
            <span>/</span>
            <span>{deal.companyName}</span>
          </>
        }
        title={deal.companyName}
        desc={deal.facilityName ? `施設: ${deal.facilityName}` : '施設名の登録はありません'}
        actions={
          <>
            <StatusBadge status={deal.status} />
            <ReviewStateBadge state={deal.reviewState} />
            <ProtectionBadge expiresAt={deal.protectionExpiresAt} settings={settings} showDate />
          </>
        }
      />

      {!editable && (
        <Callout tone="info" title="閲覧専用です">
          自社の他の担当者が持っている案件のため、内容の変更はできません。
        </Callout>
      )}
      {deal.reviewState === 'pending' && (
        <Callout tone="warn" title="本部の重複審査待ちです">
          既存の登録と一致する可能性があるため、本部が確認しています。結果は申請したご本人にだけ通知します。
        </Callout>
      )}
      {deal.reviewState === 'blocked' && (
        <Callout tone="danger" title="営業不可と判定されています">
          {deal.blockedReason || 'この案件は営業できません。'}
        </Callout>
      )}
      {deal.reviewState === 'returned' && (
        <Callout tone="info" title="本部から差し戻されています">
          通知の内容を確認して、必要な情報を追記のうえ再申請してください。
        </Callout>
      )}

      <div style={{ marginTop: 14, marginBottom: 16 }}>
        <FlowBar deal={deal} />
      </div>

      {/* 1. 基本情報 / 2. 保護情報 */}
      <div className="grid grid--detail">
        <BasicInfo deal={deal} editable={editable} showHqFields={showHqFields} />
        <ProtectionInfo deal={deal} />
      </div>

      {/* 3. 案件進捗・営業活動 */}
      <div style={{ marginTop: 16 }}>
        <ActivityPanel deal={deal} editable={editable} />
      </div>

      {/* 4. 提案・見積・受注情報 */}
      <div style={{ marginTop: 16 }}>
        <AmountsPanel deal={deal} editable={editable} />
      </div>

      {/* 5. 変更履歴 */}
      <div style={{ marginTop: 16 }}>
        <Card title="変更履歴" desc="いつ・誰が・何を変えたかの記録です">
          {deal.changes.length === 0 ? (
            <EmptyState title="変更履歴はまだありません" />
          ) : (
            <div className="table-wrap">
              <table className="data stackable">
                <thead>
                  <tr>
                    <th>日時</th>
                    <th>操作者</th>
                    <th>項目</th>
                    <th>変更前</th>
                    <th>変更後</th>
                    <th>補足</th>
                  </tr>
                </thead>
                <tbody>
                  {[...deal.changes].reverse().map((c) => (
                    <tr key={c.id}>
                      <td className="num nowrap" data-label="日時">
                        {formatDateTime(c.at)}
                      </td>
                      <td data-label="操作者">{userById(c.actorUserId)?.name ?? c.actorUserId}</td>
                      <td data-label="項目">{c.field}</td>
                      <td data-label="変更前" className="muted">
                        {c.before}
                      </td>
                      <td data-label="変更後" className="cell-strong">
                        {c.after}
                      </td>
                      <td data-label="補足" className="cell-sub">
                        {c.note || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <p className="xsmall muted" style={{ marginTop: 14 }}>
        所属代理店: {agencyById(deal.agencyId)?.name ?? '—'} の案件 / 最終更新 {formatDateTime(deal.updatedAt)}
      </p>
      {db.reviews.some((r) => r.dealId === deal.id) && currentUser.role === 'hq' && (
        <div className="btn-row" style={{ marginTop: 10 }}>
          <button className="btn btn--sm" onClick={() => navigate('review')}>
            <Icon name="shield" />
            重複審査の画面で見る
          </button>
        </div>
      )}
    </>
  )
}

// ------------------------------------------------------------------ 5段階フロー
function FlowBar({ deal }: { deal: Deal }) {
  const current = statusIndex(deal.status) + 1 // inquiry分をずらす
  return (
    <div className="flow" data-testid="flow">
      {FLOW_STEPS.map((s, i) => {
        const done = i < current || (i === 0 && deal.fromInquiry)
        const isCurrent = i === current
        const cls = isCurrent ? 'flow__step flow__step--current' : done ? 'flow__step flow__step--done' : 'flow__step'
        return (
          <div className={cls} key={s.key}>
            {s.label}
          </div>
        )
      })}
    </div>
  )
}

// ------------------------------------------------------------------ 基本情報
function BasicInfo({
  deal,
  editable,
  showHqFields,
}: {
  deal: Deal
  editable: boolean
  showHqFields: boolean
}) {
  const { userById, agencyById, updateDealBasic } = useStore()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    facilityName: deal.facilityName,
    phone: deal.phone,
    website: deal.website,
    contactPersonName: deal.contactPersonName,
    contactPersonContact: deal.contactPersonContact,
  })

  const start = () => {
    setForm({
      facilityName: deal.facilityName,
      phone: deal.phone,
      website: deal.website,
      contactPersonName: deal.contactPersonName,
      contactPersonContact: deal.contactPersonContact,
    })
    setEditing(true)
  }

  const save = () => {
    updateDealBasic(deal.id, form)
    setEditing(false)
  }

  return (
    <Card
      title="基本情報"
      actions={
        editable ? (
          editing ? (
            <>
              <button className="btn btn--sm" onClick={() => setEditing(false)}>
                やめる
              </button>
              <button className="btn btn--sm btn--primary" onClick={save} data-testid="basic-save">
                保存する
              </button>
            </>
          ) : (
            <button className="btn btn--sm" onClick={start} data-testid="basic-edit">
              編集する
            </button>
          )
        ) : undefined
      }
    >
      {editing ? (
        <div className="form-grid">
          <label className="field">
            <span className="field__label">施設名</span>
            <input
              className="input"
              value={form.facilityName}
              onChange={(e) => setForm({ ...form, facilityName: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field__label">電話番号</span>
            <input
              className="input"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <label className="field span-2">
            <span className="field__label">Webサイト</span>
            <input
              className="input"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field__label">企業担当者名</span>
            <input
              className="input"
              value={form.contactPersonName}
              onChange={(e) => setForm({ ...form, contactPersonName: e.target.value })}
            />
          </label>
          <label className="field">
            <span className="field__label">企業担当者連絡先</span>
            <input
              className="input"
              value={form.contactPersonContact}
              onChange={(e) => setForm({ ...form, contactPersonContact: e.target.value })}
            />
          </label>
          <p className="xsmall muted span-2">
            企業名・担当営業は、この画面からは変更できません。担当営業の変更は代理店管理者の引継ぎ操作で行います。
          </p>
        </div>
      ) : (
        <div className="dl">
          <div className="dl__k">企業名</div>
          <div className="dl__v strong">{deal.companyName}</div>
          <div className="dl__k">施設名</div>
          <div className="dl__v">{deal.facilityName || '—'}</div>
          <div className="dl__k">電話番号</div>
          <div className="dl__v num">{deal.phone || '—'}</div>
          <div className="dl__k">Webサイト</div>
          <div className="dl__v">{deal.website || '—'}</div>
          <div className="dl__k">企業担当者名</div>
          <div className="dl__v">{deal.contactPersonName || '—'}</div>
          <div className="dl__k">企業担当者連絡先</div>
          <div className="dl__v">{deal.contactPersonContact || '—'}</div>
          {showHqFields && (
            <>
              <div className="dl__k">所属代理店</div>
              <div className="dl__v" data-testid="basic-agency">
                {agencyById(deal.agencyId)?.name ?? '—'}
              </div>
            </>
          )}
          <div className="dl__k">担当営業</div>
          <div className="dl__v">{userById(deal.ownerUserId)?.name ?? '—'}</div>
          {showHqFields && (
            <>
              <div className="dl__k">案件ID</div>
              <div className="dl__v mono" data-testid="basic-dealid">
                {deal.id}
              </div>
            </>
          )}
          <div className="dl__k">案件登録日</div>
          <div className="dl__v num">{formatDate(deal.createdAt)}</div>
          <div className="dl__k">最終更新日</div>
          <div className="dl__v num">{formatDate(deal.updatedAt)}</div>
          {showHqFields && (
            <>
              <div className="dl__k">登録者</div>
              <div className="dl__v" data-testid="basic-creator">
                {userById(deal.createdByUserId)?.name ?? '—'}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  )
}

// ------------------------------------------------------------------ 保護情報
function ProtectionInfo({ deal }: { deal: Deal }) {
  const { settings, currentUser, createExtension, db } = useStore()
  const [open, setOpen] = useState(false)
  const [days, setDays] = useState('30')
  const [reason, setReason] = useState('')
  const left = remainingDays(deal.protectionExpiresAt)
  const orderState = orderStateFor(deal.orders, settings)
  const pendingExt = db.extensions.find((e) => e.dealId === deal.id && e.state === 'pending')

  return (
    <Card
      title="保護情報"
      actions={
        currentUser && currentUser.role !== 'hq' ? (
          <button
            className="btn btn--sm"
            onClick={() => setOpen(true)}
            disabled={!!pendingExt}
            data-testid="ext-open"
          >
            <Icon name="clock" />
            {pendingExt ? '延長申請中' : '延長を申請'}
          </button>
        ) : undefined
      }
    >
      <div className="dl">
        <div className="dl__k">保護状態</div>
        <div className="dl__v">
          <ProtectionBadge expiresAt={deal.protectionExpiresAt} settings={settings} />
        </div>
        <div className="dl__k">保護開始日</div>
        <div className="dl__v num">{formatDate(deal.protectionStartAt)}</div>
        <div className="dl__k">保護期限</div>
        <div className="dl__v num strong" data-testid="protection-expires">
          {formatDate(deal.protectionExpiresAt)}
        </div>
        <div className="dl__k">残り日数</div>
        <div className="dl__v num">{left < 0 ? `${-left}日超過` : `${left}日`}</div>
        <div className="dl__k">いまの起点</div>
        <div className="dl__v" data-testid="protection-basis">
          {orderState.hasOrder && orderState.lastKind === 'additional'
            ? `追加受注 / ${orderState.days}日`
            : `${STATUS_LABEL[deal.status]} / ${protectionDaysFor(deal.status, settings)}日`}
        </div>
        <div className="dl__k">最終受注日</div>
        <div className="dl__v num">{deal.lastOrderDate ? formatDate(deal.lastOrderDate) : '—'}</div>
        <div className="dl__k">判定結果</div>
        <div className="dl__v">
          <JudgementBadge judgement={deal.judgement} />
        </div>
      </div>
      <p className="xsmall muted" style={{ marginTop: 10 }}>
        残り日数は保存せず、「保護期限 − 今日」でその都度計算しています。
      </p>

      {open && (
        <Modal
          title="保護期限の延長を申請する"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>
                やめる
              </button>
              <button
                className="btn btn--primary"
                disabled={!reason.trim()}
                onClick={() => {
                  createExtension(deal.id, Number(days) || 30, reason)
                  setOpen(false)
                  setReason('')
                }}
                data-testid="ext-submit"
              >
                申請する
              </button>
            </>
          }
        >
          <label className="field">
            <span className="field__label">延長したい日数</span>
            <select className="select" value={days} onChange={(e) => setDays(e.target.value)}>
              <option value="30">30日</option>
              <option value="60">60日</option>
              <option value="90">90日</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">
              理由<span className="req">必須</span>
            </span>
            <textarea
              className="textarea"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例: 先方の予算確定が翌四半期にずれ込むため"
            />
          </label>
        </Modal>
      )}
    </Card>
  )
}

// ------------------------------------------------------------------ 案件進捗・営業活動
function ActivityPanel({ deal, editable }: { deal: Deal; editable: boolean }) {
  const { saveActivity, userById } = useStore()
  const [activityDate, setActivityDate] = useState(today())
  const [toStatus, setToStatus] = useState<'' | DealStatus>('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    if (!isValidDateISO(activityDate)) {
      setError('活動日を入力してください')
      return
    }
    if (!toStatus && !body.trim()) {
      setError('ステータス変更か営業活動の内容、どちらかは入れてください')
      return
    }
    setError(null)
    saveActivity(deal.id, {
      activityDate,
      toStatus: toStatus === '' ? null : toStatus,
      body,
    })
    setToStatus('')
    setBody('')
  }

  const history = [...deal.activities].sort((a, b) =>
    a.activityDate === b.activityDate
      ? a.createdAt < b.createdAt
        ? 1
        : -1
      : a.activityDate < b.activityDate
        ? 1
        : -1,
  )

  return (
    <Card
      title="案件進捗・営業活動"
      desc="ステータス変更だけ・営業活動だけ・両方まとめて、のどれでも保存できます"
    >
      {editable && (
        <div className="form-grid" style={{ marginBottom: 4 }}>
          <label className="field">
            <span className="field__label">活動日</span>
            <input
              className="input"
              type="date"
              value={activityDate}
              onChange={(e) => setActivityDate(e.target.value)}
              data-testid="ac-date"
            />
          </label>
          <label className="field">
            <span className="field__label">案件ステータス</span>
            <select
              className="select"
              value={toStatus}
              onChange={(e) => setToStatus(e.target.value as '' | DealStatus)}
              data-testid="ac-status"
            >
              <option value="">変更しない</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="field span-2">
            <span className="field__label">営業活動の内容</span>
            <textarea
              className="textarea"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="例: 支配人と面談。ロビーへの設置位置を確認した。"
              data-testid="ac-body"
            />
            {error && <span className="field__error">{error}</span>}
          </label>
          <div className="span-2 btn-row">
            <button className="btn btn--primary" onClick={submit} data-testid="ac-save">
              <Icon name="check" />
              保存する
            </button>
          </div>
        </div>
      )}

      <div className="hr" />
      <div className="section-title">履歴</div>
      {history.length === 0 ? (
        <EmptyState title="活動の記録はまだありません" />
      ) : (
        <div className="timeline">
          {history.map((a) => (
            <div className={a.toStatus ? 'tl-item' : 'tl-item tl-item--muted'} key={a.id}>
              <div className="tl-item__head">
                <span className="tl-item__date num">{formatDate(a.activityDate)}</span>
                {a.toStatus && (
                  <Badge tone="accent">
                    {a.fromStatus ? `${STATUS_LABEL[a.fromStatus]} → ` : ''}
                    {STATUS_LABEL[a.toStatus]}
                  </Badge>
                )}
                <span>{userById(a.authorUserId)?.name ?? a.authorUserId}</span>
              </div>
              {a.body && <div className="tl-item__body">{a.body}</div>}
              {a.protectionExpiresAt && (
                <div className="tl-item__note">保護期限: {formatDate(a.protectionExpiresAt)}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ------------------------------------------------------------------ 提案・見積・受注情報
function AmountsPanel({ deal, editable }: { deal: Deal; editable: boolean }) {
  const { db, saveDealAmounts, addAdditional, userById, currentUser, voidAmountSnapshot, voidOrderEvent } = useStore()
  const active = useMemo(() => activeProductNames(db.products), [db.products])
  const merged = useMemo(() => mergeLines(deal.lines, active), [deal.lines, active])

  const [rows, setRows] = useState<Record<string, { proposed: boolean; quote: string; order: string }>>(() =>
    Object.fromEntries(
      merged.map((l) => [
        l.productName,
        {
          proposed: l.proposed,
          quote: l.quoteAmount === null ? '' : String(l.quoteAmount),
          order: l.orderAmount === null ? '' : String(l.orderAmount),
        },
      ]),
    ),
  )
  // 既存の見積日・受注日があればそれを初期値にする(保存で日付を上書きしないため)
  const initialOrder = deal.orders.find((o) => o.kind === 'initial' && !o.voided)
  const lastQuoteSnap = [...deal.amountHistory].reverse().find((sn) => !sn.voided && sn.quoteDate)
  const [quoteDate, setQuoteDate] = useState(lastQuoteSnap?.quoteDate ?? today())
  const [orderDate, setOrderDate] = useState(initialOrder?.orderDate ?? today())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showHistory, setShowHistory] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  // 商品マスターに新商品が増えたら行を足す(§7.3 / §7.4)
  const rowFor = (name: string) => rows[name] ?? { proposed: false, quote: '', order: '' }

  const setRow = (name: string, patch: Partial<{ proposed: boolean; quote: string; order: string }>) => {
    setRows((prev) => ({ ...prev, [name]: { ...rowFor(name), ...patch } }))
  }

  const quoteTotal = merged.reduce(
    (s, l) =>
      s +
      (active.includes(l.productName)
        ? (parseAmount(rowFor(l.productName).quote).value ?? 0)
        : (l.quoteAmount ?? 0)),
    0,
  )
  const orderTotal = merged.reduce(
    (s, l) =>
      s +
      (active.includes(l.productName)
        ? (parseAmount(rowFor(l.productName).order).value ?? 0)
        : (l.orderAmount ?? 0)),
    0,
  )

  const save = () => {
    const errs: Record<string, string> = {}
    if (!isValidDateISO(quoteDate)) errs.__quoteDate = '見積日を入力してください'
    if (!isValidDateISO(orderDate)) errs.__orderDate = '受注日を入力してください'
    const lines: DealProductLine[] = merged.map((l) => {
      // 停止中の商品は新規入力の対象外。保存済みの値だけを引き継ぐ(§7.2)
      if (!active.includes(l.productName)) {
        return deal.lines.find((x) => x.productName === l.productName) ?? { ...l }
      }
      const r = rowFor(l.productName)
      const q = parseAmount(r.quote)
      const o = parseAmount(r.order)
      if (q.error) errs[`${l.productName}-q`] = q.error
      if (o.error) errs[`${l.productName}-o`] = o.error
      return {
        productName: l.productName,
        proposed: r.proposed,
        quoteAmount: q.value,
        orderAmount: o.value,
      }
    })
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    saveDealAmounts(deal.id, { lines, quoteDate, orderDate })
  }

  const history = [...deal.amountHistory].reverse()
  const orders = [...deal.orders].reverse()
  const hasOrder = deal.orders.some((o) => !o.voided)

  return (
    <Card
      title="提案・見積・受注情報"
      desc="表示・入力の単位は商品名です。空欄と0円は区別して保存します"
      actions={
        <>
          <button className="btn btn--sm" onClick={() => setShowHistory((v) => !v)} data-testid="am-history-toggle">
            <Icon name="history" />
            {showHistory ? '履歴を閉じる' : '履歴を見る'}
          </button>
          {editable && hasOrder && (
            <button className="btn btn--sm btn--primary" onClick={() => setAddOpen(true)} data-testid="am-add-open">
              <Icon name="plus" />
              追加受注を登録
            </button>
          )}
        </>
      }
    >
      <div className="table-wrap">
        <table className="data stackable" data-testid="am-table">
          <thead>
            <tr>
              <th>商品名</th>
              <th>提案対象</th>
              <th className="num">見積金額</th>
              <th className="num">受注金額</th>
            </tr>
          </thead>
          <tbody>
            {merged.map((l) => {
              const r = rowFor(l.productName)
              const suspended = !active.includes(l.productName)
              return (
                <tr key={l.productName}>
                  <td data-label="商品名">
                    <span className="cell-strong">{l.productName}</span>
                    {suspended && (
                      <>
                        {' '}
                        <Badge tone="neutral">停止中</Badge>
                      </>
                    )}
                  </td>
                  <td data-label="提案対象">
                    {editable && !suspended ? (
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={r.proposed}
                          onChange={(e) => setRow(l.productName, { proposed: e.target.checked })}
                          data-testid={`am-proposed-${l.productName}`}
                        />
                        <span className="xsmall">提案する</span>
                      </label>
                    ) : r.proposed ? (
                      <Badge tone="accent">提案</Badge>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="num" data-label="見積金額">
                    {editable && !suspended ? (
                      <>
                        <input
                          className="input input--amount"
                          type="text"
                          inputMode="numeric"
                          value={r.quote}
                          placeholder="—"
                          onChange={(e) => setRow(l.productName, { quote: e.target.value })}
                          aria-invalid={!!errors[`${l.productName}-q`]}
                          data-testid={`am-quote-${l.productName}`}
                        />
                        {errors[`${l.productName}-q`] && (
                          <span className="field__error">{errors[`${l.productName}-q`]}</span>
                        )}
                      </>
                    ) : (
                      formatYen(l.quoteAmount)
                    )}
                  </td>
                  <td className="num" data-label="受注金額">
                    {editable && !suspended ? (
                      <>
                        <input
                          className="input input--amount"
                          type="text"
                          inputMode="numeric"
                          value={r.order}
                          placeholder="—"
                          onChange={(e) => setRow(l.productName, { order: e.target.value })}
                          aria-invalid={!!errors[`${l.productName}-o`]}
                          data-testid={`am-order-${l.productName}`}
                        />
                        {errors[`${l.productName}-o`] && (
                          <span className="field__error">{errors[`${l.productName}-o`]}</span>
                        )}
                      </>
                    ) : (
                      formatYen(l.orderAmount)
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="strong" data-label="">
                合計
              </td>
              <td className="num strong" data-label="見積合計" data-testid="am-quote-total">
                {formatYen(quoteTotal)}
              </td>
              <td className="num strong" data-label="受注合計" data-testid="am-order-total">
                {formatYen(orderTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {editable && (
        <div className="form-grid" style={{ marginTop: 14 }}>
          <label className="field">
            <span className="field__label">見積日</span>
            <input
              className="input"
              type="date"
              value={quoteDate}
              onChange={(e) => setQuoteDate(e.target.value)}
              aria-invalid={!!errors.__quoteDate}
              data-testid="am-quote-date"
            />
            {errors.__quoteDate && <span className="field__error">{errors.__quoteDate}</span>}
          </label>
          <label className="field">
            <span className="field__label">受注日</span>
            <input
              className="input"
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              aria-invalid={!!errors.__orderDate}
              data-testid="am-order-date"
            />
            {errors.__orderDate && <span className="field__error">{errors.__orderDate}</span>}
          </label>
          <div className="span-2 btn-row">
            <button className="btn btn--primary" onClick={save} data-testid="am-save">
              <Icon name="check" />
              保存する
            </button>
            <span className="xsmall muted" style={{ alignSelf: 'center' }}>
              受注金額を入れて保存すると、受注確定として保護期限を計算し直します。
            </span>
          </div>
        </div>
      )}

      {showHistory && (
        <>
          <div className="hr" />
          <div className="section-title">受注イベント</div>
          {orders.length === 0 ? (
            <p className="muted small">受注はまだありません。</p>
          ) : (
            <div className="table-wrap">
              <table className="data stackable">
                <thead>
                  <tr>
                    <th>受注日</th>
                    <th>区分</th>
                    <th>商品名</th>
                    <th className="num">金額</th>
                    <th>登録者</th>
                    {currentUser?.role === 'hq' && <th>操作</th>}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
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
                      <td data-label="登録者">{userById(o.authorUserId)?.name ?? '—'}</td>
                      {currentUser?.role === 'hq' && (
                        <td data-label="操作">
                          {!o.voided && (
                            <button className="btn btn--sm" onClick={() => voidOrderEvent(deal.id, o.id)}>
                              取消
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="section-title" style={{ marginTop: 16 }}>
            金額履歴(保存時点のスナップショット)
          </div>
          {history.length === 0 ? (
            <p className="muted small">履歴はまだありません。</p>
          ) : (
            <div className="table-wrap">
              <table className="data stackable">
                <thead>
                  <tr>
                    <th>登録日時</th>
                    <th>見積日</th>
                    <th>受注日</th>
                    <th>商品名</th>
                    <th className="num">見積合計</th>
                    <th className="num">受注合計</th>
                    <th>区分</th>
                    <th>登録者</th>
                    {currentUser?.role === 'hq' && <th>操作</th>}
                  </tr>
                </thead>
                <tbody>
                  {history.map((s) => (
                    <tr key={s.id} style={s.voided ? { opacity: 0.5 } : undefined}>
                      <td className="num nowrap" data-label="登録日時">
                        {formatDateTime(s.createdAt)}
                      </td>
                      <td className="num nowrap" data-label="見積日">
                        {formatDate(s.quoteDate)}
                      </td>
                      <td className="num nowrap" data-label="受注日">
                        {formatDate(s.orderDate)}
                      </td>
                      <td data-label="商品名">
                        {s.lines.map((l) => (
                          <div key={l.productName} className="xsmall">
                            {l.productName}
                          </div>
                        ))}
                      </td>
                      <td className="num" data-label="見積合計">
                        {formatYen(s.quoteTotal)}
                      </td>
                      <td className="num" data-label="受注合計">
                        {formatYen(s.orderTotal)}
                      </td>
                      <td data-label="区分">
                        {s.orderKind === 'none' ? '見積' : s.orderKind === 'initial' ? '初回受注' : '追加受注'}
                        {s.voided && <Badge tone="danger">無効</Badge>}
                      </td>
                      <td data-label="登録者">{userById(s.authorUserId)?.name ?? '—'}</td>
                      {currentUser?.role === 'hq' && (
                        <td data-label="操作">
                          {!s.voided && (
                            <button className="btn btn--sm" onClick={() => voidAmountSnapshot(deal.id, s.id)}>
                              無効化
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div className="hr" />
      <div className="row">
        <span className="small muted">現在の見積合計</span>
        <span className="strong num">{formatYen(latestQuoteTotal(deal))}</span>
        <span className="spacer" />
        <span className="small muted">案件全体の受注額</span>
        <span className="strong num" data-testid="am-total-orders">
          {formatYen(totalOrders(deal))}
        </span>
      </div>

      {addOpen && (
        <AdditionalOrderModal
          deal={deal}
          onClose={() => setAddOpen(false)}
          onSubmit={(orderDate2, lines) => {
            addAdditional(deal.id, { orderDate: orderDate2, lines })
            setAddOpen(false)
          }}
        />
      )}
    </Card>
  )
}

function AdditionalOrderModal({
  deal,
  onClose,
  onSubmit,
}: {
  deal: Deal
  onClose: () => void
  onSubmit: (orderDate: string, lines: { productName: string; amount: number }[]) => void
}) {
  const { db, settings } = useStore()
  const active = activeProductNames(db.products)
  const [orderDate, setOrderDate] = useState(today())
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const total = active.reduce((s, n) => s + (parseAmount(amounts[n] ?? '').value ?? 0), 0)

  const submit = () => {
    const errs: Record<string, string> = {}
    if (!isValidDateISO(orderDate)) errs.__date = '受注日を入力してください'
    const lines: { productName: string; amount: number }[] = []
    for (const n of active) {
      const p = parseAmount(amounts[n] ?? '')
      if (p.error) errs[n] = p.error
      else if (p.value && p.value > 0) lines.push({ productName: n, amount: p.value })
    }
    if (lines.length === 0) errs.__all = '追加受注する商品の金額を1つ以上入れてください'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    onSubmit(orderDate, lines)
  }

  return (
    <Modal
      title="追加受注を登録する"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            やめる
          </button>
          <button className="btn btn--primary" onClick={submit} data-testid="add-submit">
            登録する
          </button>
        </>
      }
    >
      <Callout tone="info" title="初回受注は上書きしません">
        追加受注として記録し、案件全体の受注額に足します。保護期限は受注日から{settings.additionalOrderDays}日後へ更新されます。
        現在の案件全体の受注額は {formatYen(totalOrders(deal))} です。
      </Callout>

      <label className="field" style={{ marginTop: 14 }}>
        <span className="field__label">
          受注日<span className="req">必須</span>
        </span>
        <input
          className="input"
          type="date"
          value={orderDate}
          onChange={(e) => setOrderDate(e.target.value)}
          aria-invalid={!!errors.__date}
          data-testid="add-date"
        />
        {errors.__date && <span className="field__error">{errors.__date}</span>}
      </label>

      <div className="section-title">販売中の商品</div>
      <div className="table-wrap">
        <table className="data stackable">
          <thead>
            <tr>
              <th>商品名</th>
              <th className="num">受注金額</th>
            </tr>
          </thead>
          <tbody>
            {active.map((n) => (
              <tr key={n}>
                <td data-label="商品名">{n}</td>
                <td className="num" data-label="受注金額">
                  <input
                    className="input input--amount"
                    type="text"
                    inputMode="numeric"
                    value={amounts[n] ?? ''}
                    placeholder="—"
                    onChange={(e) => setAmounts({ ...amounts, [n]: e.target.value })}
                    aria-invalid={!!errors[n]}
                    data-testid={`add-amount-${n}`}
                  />
                  {errors[n] && <span className="field__error">{errors[n]}</span>}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="strong" data-label="">
                受注合計
              </td>
              <td className="num strong" data-label="受注合計" data-testid="add-total">
                {formatYen(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {errors.__all && <p className="field__error">{errors.__all}</p>}
    </Modal>
  )
}
