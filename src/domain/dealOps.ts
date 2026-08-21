/**
 * 案件の更新操作(純関数)。
 * 画面・シード生成・テストがすべて同じ関数を通ることで、保護期間と履歴の整合を保つ。
 */
import { addDays, isValidDateISO, nowISO, today } from './dates'
import { newId } from './id'
import { normalizeCompanyName, normalizeDomain, normalizeFacilityName, normalizePhone } from './normalize'
import { calcProtection } from './protection'
import { meaningfulLines, sumOrder, sumQuote } from './products'
import { STATUS_LABEL } from './format'
import type {
  ActivityEntry,
  AmountSnapshot,
  ChangeEntry,
  Deal,
  DealProductLine,
  DealStatus,
  Judgement,
  OrderEvent,
  ReviewState,
  Settings,
} from './types'

export interface CreateDealInput {
  id: string
  agencyId: string
  ownerUserId: string
  createdByUserId: string
  companyName: string
  facilityName: string
  phone: string
  website: string
  contactPersonName?: string
  contactPersonContact?: string
  productNames?: string[]
  judgement: Judgement
  reviewState: ReviewState
  fromInquiry: boolean
  registeredAt?: string
  settings: Settings
}

export function createDeal(input: CreateDealInput): Deal {
  const registeredAt = input.registeredAt ?? today()
  const p = calcProtection({
    status: 'planned',
    changeDate: registeredAt,
    currentExpiresAt: null,
    currentStartAt: null,
    settings: input.settings,
  })
  const lines: DealProductLine[] = (input.productNames ?? []).map((name) => ({
    productName: name,
    proposed: true,
    quoteAmount: null,
    orderAmount: null,
  }))
  const stamp = `${registeredAt}T09:00:00.000Z`
  return {
    id: input.id,
    agencyId: input.agencyId,
    ownerUserId: input.ownerUserId,
    createdByUserId: input.createdByUserId,
    companyName: input.companyName.trim(),
    companyNameNorm: normalizeCompanyName(input.companyName),
    facilityName: input.facilityName.trim(),
    facilityNameNorm: normalizeFacilityName(input.facilityName),
    phone: input.phone.trim(),
    phoneNorm: normalizePhone(input.phone),
    website: input.website.trim(),
    websiteDomain: normalizeDomain(input.website) ?? '',
    contactPersonName: input.contactPersonName ?? '',
    contactPersonContact: input.contactPersonContact ?? '',
    status: 'planned',
    fromInquiry: input.fromInquiry,
    judgement: input.judgement,
    reviewState: input.reviewState,
    protectionStartAt: p.startAt,
    protectionExpiresAt: p.expiresAt,
    firstReachedAt: { planned: registeredAt },
    lastOrderDate: null,
    createdAt: stamp,
    updatedAt: stamp,
    lines,
    activities: [],
    amountHistory: [],
    orders: [],
    changes: [
      {
        id: newId('CH'),
        at: stamp,
        actorUserId: input.createdByUserId,
        field: '案件登録',
        before: '—',
        after: `${STATUS_LABEL.planned} / 保護期限 ${p.expiresAt}`,
        note: `保護期間 ${p.days}日`,
      },
    ],
    blockedReason: '',
  }
}

export interface StatusChangeInput {
  activityDate: string
  toStatus: DealStatus | null
  body: string
  authorUserId: string
  settings: Settings
  at?: string
}

/**
 * 案件進捗・営業活動の保存(§11)
 * ステータス変更のみ / 営業活動のみ / 両方同時 の3パターンを1つの関数で扱う。
 */
export function applyActivity(deal: Deal, input: StatusChangeInput): Deal {
  if (!isValidDateISO(input.activityDate)) {
    throw new Error('活動日が正しくありません')
  }
  const at = input.at ?? nowISO()
  const changes: ChangeEntry[] = []
  let next: Deal = { ...deal, changes: [...deal.changes] }

  const changingStatus = !!input.toStatus && input.toStatus !== deal.status
  let protectionExpiresAt = deal.protectionExpiresAt
  let protectionStartAt = deal.protectionStartAt

  if (changingStatus && input.toStatus) {
    const p = calcProtection({
      status: input.toStatus,
      changeDate: input.activityDate,
      currentExpiresAt: deal.protectionExpiresAt,
      currentStartAt: deal.protectionStartAt,
      settings: input.settings,
    })
    protectionExpiresAt = p.expiresAt
    protectionStartAt = p.startAt
    changes.push({
      id: newId('CH'),
      at,
      actorUserId: input.authorUserId,
      field: '案件ステータス',
      before: STATUS_LABEL[deal.status],
      after: STATUS_LABEL[input.toStatus],
      note: p.keptLonger
        ? `保護期限は既存の方が長いため据え置き(${protectionExpiresAt})`
        : `保護期限を${protectionExpiresAt}へ更新(${p.days}日)`,
    })
    next.status = input.toStatus
    next.firstReachedAt = { ...deal.firstReachedAt }
    if (!next.firstReachedAt[input.toStatus]) next.firstReachedAt[input.toStatus] = input.activityDate
    if (input.toStatus === 'ordered') {
      next.lastOrderDate = input.activityDate
    }
  }

  const activity: ActivityEntry = {
    id: newId('AC'),
    activityDate: input.activityDate,
    fromStatus: changingStatus ? deal.status : null,
    toStatus: changingStatus ? (input.toStatus as DealStatus) : null,
    body: input.body.trim(),
    authorUserId: input.authorUserId,
    createdAt: at,
    protectionExpiresAt: changingStatus ? protectionExpiresAt : null,
  }

  next.activities = [...deal.activities, activity]
  next.protectionExpiresAt = protectionExpiresAt
  next.protectionStartAt = protectionStartAt
  next.updatedAt = at
  next.changes = [...next.changes, ...changes]
  return next
}

export interface SaveAmountsInput {
  lines: DealProductLine[]
  quoteDate: string | null
  orderDate: string | null
  authorUserId: string
  settings: Settings
  at?: string
}

/**
 * 提案・見積・受注情報の保存(§12)
 * 保存時点のスナップショットを履歴へ追加し、過去履歴は上書きしない(§12.3)。
 */
export function saveAmounts(deal: Deal, input: SaveAmountsInput): Deal {
  if (input.quoteDate !== null && !isValidDateISO(input.quoteDate)) {
    throw new Error('見積日が正しくありません')
  }
  if (input.orderDate !== null && !isValidDateISO(input.orderDate)) {
    throw new Error('受注日が正しくありません')
  }
  const at = input.at ?? nowISO()
  const kept = meaningfulLines(input.lines)
  const quoteTotal = sumQuote(kept)
  const orderTotal = sumOrder(kept)
  // 金額が入っているのに日付がないまま「今日」で保存してしまわないようにする
  if (quoteTotal > 0 && !input.quoteDate) throw new Error('見積日を入力してください')
  if (orderTotal > 0 && !input.orderDate) throw new Error('受注日を入力してください')
  const hasInitialOrder = deal.orders.some((o) => o.kind === 'initial' && !o.voided)

  let next: Deal = {
    ...deal,
    lines: kept,
    updatedAt: at,
    changes: [...deal.changes],
    orders: [...deal.orders],
    amountHistory: [...deal.amountHistory],
  }

  let orderKind: AmountSnapshot['orderKind'] = 'none'
  let protectionNote = ''

  if (orderTotal > 0) {
    const orderDate = input.orderDate as string
    const orderLines = kept
      .filter((l) => (l.orderAmount ?? 0) > 0)
      .map((l) => ({ productName: l.productName, amount: l.orderAmount as number }))

    if (!hasInitialOrder) {
      orderKind = 'initial'
      const ev: OrderEvent = {
        id: newId('OD'),
        kind: 'initial',
        orderDate,
        lines: orderLines,
        total: orderTotal,
        authorUserId: input.authorUserId,
        createdAt: at,
        voided: false,
      }
      next.orders.push(ev)
      // 取消済みの初回や、より新しい追加受注が残っていることがあるため、
      // 単独の受注日ではなく有効イベント全体から保護期間を決める(§10.5 / §13.2)
      const st = orderStateFor(next.orders, input.settings)
      next.status = 'ordered'
      next.firstReachedAt = { ...deal.firstReachedAt }
      next.firstReachedAt.ordered = st.firstOrderDate ?? orderDate
      next.protectionStartAt = st.startAt ?? orderDate
      next.protectionExpiresAt = st.expiresAt ?? deal.protectionExpiresAt
      next.lastOrderDate = st.lastOrderDate ?? orderDate
      protectionNote = `受注確定により保護期限を${next.protectionExpiresAt}へ更新(${st.days}日)`
      next.changes.push({
        id: newId('CH'),
        at,
        actorUserId: input.authorUserId,
        field: '案件ステータス',
        before: STATUS_LABEL[deal.status],
        after: STATUS_LABEL.ordered,
        note: protectionNote,
      })
    } else {
      // 初回受注の内容を修正した場合はイベントを差し替える(追加受注は§13で扱う)
      orderKind = 'initial'
      const idx = next.orders.findIndex((o) => o.kind === 'initial' && !o.voided)
      const prev = next.orders[idx]
      if (prev) {
        next.orders[idx] = { ...prev, lines: orderLines, total: orderTotal, orderDate }
        // 受注日を直したら、有効な受注イベント全体から保護期限を組み立て直す(§10.5 / §13.2)
        if (prev.orderDate !== orderDate) {
          const rebuilt = orderStateFor(next.orders, input.settings)
          next.firstReachedAt = { ...deal.firstReachedAt, ordered: rebuilt.firstOrderDate ?? orderDate }
          next.protectionStartAt = rebuilt.startAt ?? orderDate
          next.protectionExpiresAt = rebuilt.expiresAt ?? deal.protectionExpiresAt
          next.lastOrderDate = rebuilt.lastOrderDate
          protectionNote = `受注日の変更にあわせて保護期限を${next.protectionExpiresAt}へ更新(${rebuilt.days}日)`
          next.changes.push({
            id: newId('CH'),
            at,
            actorUserId: input.authorUserId,
            field: '受注日',
            before: prev.orderDate,
            after: orderDate,
            note: protectionNote,
          })
        }
      }
    }
  }

  const snapshot: AmountSnapshot = {
    id: newId('AM'),
    registeredAt: today(),
    quoteDate: quoteTotal > 0 ? input.quoteDate : null,
    orderDate: orderTotal > 0 ? input.orderDate : null,
    lines: kept.map((l) => ({ ...l })),
    quoteTotal,
    orderTotal,
    orderKind,
    authorUserId: input.authorUserId,
    createdAt: at,
    voided: false,
  }
  next.amountHistory.push(snapshot)

  next.changes.push({
    id: newId('CH'),
    at,
    actorUserId: input.authorUserId,
    field: '提案・見積・受注情報',
    before: `見積合計 ${deal.amountHistory[deal.amountHistory.length - 1]?.quoteTotal ?? 0}円`,
    after: `見積合計 ${quoteTotal}円 / 受注合計 ${orderTotal}円`,
    note: protectionNote,
  })

  // 見積提出への進行(受注していない場合)
  if (orderTotal === 0 && quoteTotal > 0 && (deal.status === 'planned' || deal.status === 'meeting')) {
    const quoteDate = input.quoteDate as string
    const p = calcProtection({
      status: 'quoted',
      changeDate: quoteDate,
      currentExpiresAt: next.protectionExpiresAt,
      currentStartAt: next.protectionStartAt,
      settings: input.settings,
    })
    next.changes.push({
      id: newId('CH'),
      at,
      actorUserId: input.authorUserId,
      field: '案件ステータス',
      before: STATUS_LABEL[deal.status],
      after: STATUS_LABEL.quoted,
      note: p.keptLonger
        ? `保護期限は既存の方が長いため据え置き(${p.expiresAt})`
        : `保護期限を${p.expiresAt}へ更新(${p.days}日)`,
    })
    next.status = 'quoted'
    next.firstReachedAt = { ...next.firstReachedAt }
    if (!next.firstReachedAt.quoted) next.firstReachedAt.quoted = quoteDate
    next.protectionStartAt = p.startAt
    next.protectionExpiresAt = p.expiresAt
  }

  return next
}

export interface AdditionalOrderInput {
  orderDate: string
  lines: { productName: string; amount: number }[]
  authorUserId: string
  settings: Settings
  at?: string
}

/** 追加受注(§13)。初回受注を上書きせず、イベントとして追加する。 */
export function addAdditionalOrder(deal: Deal, input: AdditionalOrderInput): Deal {
  if (!isValidDateISO(input.orderDate)) {
    throw new Error('受注日が正しくありません')
  }
  const at = input.at ?? nowISO()
  const lines = input.lines.filter((l) => l.amount > 0)
  const total = lines.reduce((s, l) => s + l.amount, 0)
  const ev: OrderEvent = {
    id: newId('OD'),
    kind: 'additional',
    orderDate: input.orderDate,
    lines,
    total,
    authorUserId: input.authorUserId,
    createdAt: at,
    voided: false,
  }
  const nextOrders = [...deal.orders, ev]
  const st = orderStateFor(nextOrders, input.settings)
  const snapshot: AmountSnapshot = {
    id: newId('AM'),
    registeredAt: today(),
    quoteDate: null,
    orderDate: input.orderDate,
    lines: lines.map((l) => ({
      productName: l.productName,
      proposed: true,
      quoteAmount: null,
      orderAmount: l.amount,
    })),
    quoteTotal: 0,
    orderTotal: total,
    orderKind: 'additional',
    authorUserId: input.authorUserId,
    createdAt: at,
    voided: false,
  }
  return {
    ...deal,
    status: 'ordered',
    firstReachedAt: {
      ...deal.firstReachedAt,
      ordered: st.firstOrderDate ?? deal.firstReachedAt.ordered ?? input.orderDate,
    },
    orders: nextOrders,
    amountHistory: [...deal.amountHistory, snapshot],
    lastOrderDate: st.lastOrderDate ?? input.orderDate,
    protectionStartAt: st.startAt ?? input.orderDate,
    protectionExpiresAt: st.expiresAt ?? deal.protectionExpiresAt,
    updatedAt: at,
    changes: [
      ...deal.changes,
      {
        id: newId('CH'),
        at,
        actorUserId: input.authorUserId,
        field: '追加受注',
        before: `受注合計 ${totalOrders(deal)}円`,
        after: `受注合計 ${totalOrders(deal) + total}円`,
        note: `保護期限を${st.expiresAt}へ更新(${st.days}日 / 起点 ${st.lastOrderDate})`,
      },
    ],
  }
}

export function totalOrders(deal: Deal): number {
  return deal.orders.filter((o) => !o.voided).reduce((s, o) => s + o.total, 0)
}

export function latestQuoteTotal(deal: Deal): number {
  const list = deal.amountHistory.filter((s) => !s.voided && s.quoteTotal > 0)
  return list[list.length - 1]?.quoteTotal ?? 0
}

/** 有効な受注イベントのうち、いちばん新しい受注日 */
export function latestOrderDate(deal: Pick<Deal, 'orders'>): string | null {
  const dates = deal.orders.filter((o) => !o.voided).map((o) => o.orderDate).sort()
  return dates[dates.length - 1] ?? null
}

export interface OrderState {
  hasOrder: boolean
  firstOrderDate: string | null
  lastOrderDate: string | null
  startAt: string | null
  expiresAt: string | null
  days: number
  lastKind: OrderEvent['kind'] | null
}

/**
 * 取消されていない受注イベントだけから、保護期間まわりの状態を組み立て直す。
 * 受注の取消・初回受注の修正・設定の再反映で、同じ計算を使う。
 */
export function orderStateFor(orders: OrderEvent[], settings: Settings): OrderState {
  const valid = [...orders]
    .filter((o) => !o.voided)
    .sort((a, b) => (a.orderDate < b.orderDate ? -1 : a.orderDate > b.orderDate ? 1 : 0))
  if (valid.length === 0) {
    return {
      hasOrder: false,
      firstOrderDate: null,
      lastOrderDate: null,
      startAt: null,
      expiresAt: null,
      days: 0,
      lastKind: null,
    }
  }
  const first = valid[0] as OrderEvent
  const last = valid[valid.length - 1] as OrderEvent
  const days = last.kind === 'additional' ? settings.additionalOrderDays : settings.orderDays
  return {
    hasOrder: true,
    firstOrderDate: first.orderDate,
    lastOrderDate: last.orderDate,
    startAt: last.orderDate,
    expiresAt: addDays(last.orderDate, days),
    days,
    lastKind: last.kind,
  }
}

/**
 * 受注を取り消したあとの案件を組み立て直す(§13.2 / §18.2)。
 * 有効な受注が1件も残らない場合は、受注前のステータスへ戻して保護期限も数え直す。
 */
export function rebuildAfterOrderChange(
  deal: Deal,
  settings: Settings,
  actorUserId: string,
  at = nowISO(),
): Deal {
  const state = orderStateFor(deal.orders, settings)
  if (state.hasOrder) {
    if (
      state.lastOrderDate === deal.lastOrderDate &&
      state.expiresAt === deal.protectionExpiresAt &&
      deal.status === 'ordered'
    ) {
      return deal
    }
    return {
      ...deal,
      status: 'ordered',
      lastOrderDate: state.lastOrderDate,
      protectionStartAt: state.startAt as string,
      protectionExpiresAt: state.expiresAt as string,
      updatedAt: at,
      changes: [
        ...deal.changes,
        {
          id: newId('CH'),
          at,
          actorUserId,
          field: '保護期限(受注の変更)',
          before: deal.protectionExpiresAt,
          after: state.expiresAt as string,
          note: `残っている受注のうち最新(${state.lastOrderDate})から${state.days}日で再計算`,
        },
      ],
    }
  }

  // 有効な受注が残っていない: 受注前の段階へ戻す
  const fallback: DealStatus = deal.firstReachedAt.quoted
    ? 'quoted'
    : deal.firstReachedAt.meeting
      ? 'meeting'
      : 'planned'
  const anchor = deal.firstReachedAt[fallback] ?? deal.protectionStartAt
  const p = calcProtection({
    status: fallback,
    changeDate: anchor,
    currentExpiresAt: null,
    currentStartAt: anchor,
    settings,
  })
  return {
    ...deal,
    status: fallback,
    lastOrderDate: null,
    protectionStartAt: p.startAt,
    protectionExpiresAt: p.expiresAt,
    updatedAt: at,
    changes: [
      ...deal.changes,
      {
        id: newId('CH'),
        at,
        actorUserId,
        field: '案件ステータス(受注の取消)',
        before: STATUS_LABEL[deal.status],
        after: STATUS_LABEL[fallback],
        note: `有効な受注が残っていないため、保護期限を${p.expiresAt}へ戻しました`,
      },
    ],
  }
}

/**
 * 現在のステータスへ「最後に行った変更」の活動日。
 * 活動日の大小ではなく、記録された順番の最後を採る(あとから過去日で戻した操作を尊重するため)。
 */
export function currentStatusChangedAt(deal: Deal): string {
  for (let i = deal.activities.length - 1; i >= 0; i--) {
    const a = deal.activities[i]
    if (a && a.toStatus === deal.status) return a.activityDate
  }
  return deal.firstReachedAt[deal.status] ?? deal.protectionStartAt
}

/** 基本設定の変更を既存案件へ反映する(§10.7) */
export function recalcProtection(deal: Deal, settings: Settings, actorUserId: string, at = nowISO()): Deal {
  if (deal.status === 'ordered') {
    const state = orderStateFor(deal.orders, settings)
    const startAt = state.startAt ?? deal.lastOrderDate ?? deal.firstReachedAt.ordered ?? deal.protectionStartAt
    const days = state.hasOrder ? state.days : settings.orderDays
    const expiresAt = state.expiresAt ?? addDays(startAt, days)
    if (expiresAt === deal.protectionExpiresAt) return deal
    return {
      ...deal,
      protectionStartAt: startAt,
      protectionExpiresAt: expiresAt,
      lastOrderDate: state.lastOrderDate ?? deal.lastOrderDate,
      updatedAt: at,
      changes: [
        ...deal.changes,
        {
          id: newId('CH'),
          at,
          actorUserId,
          field: '保護期限(基本設定の反映)',
          before: deal.protectionExpiresAt,
          after: expiresAt,
          note: `受注日 ${startAt} を起点に ${days}日で再計算`,
        },
      ],
    }
  }

  // 商談・見積提出は「そのステータスへ最後に変更した日」を起点にする(§10.3 / §10.4)
  const anchorDate = currentStatusChangedAt(deal)
  const p = calcProtection({
    status: deal.status,
    changeDate: anchorDate,
    currentExpiresAt: null,
    currentStartAt: deal.protectionStartAt,
    settings,
  })
  if (p.expiresAt === deal.protectionExpiresAt) return deal
  return {
    ...deal,
    protectionStartAt: p.startAt,
    protectionExpiresAt: p.expiresAt,
    updatedAt: at,
    changes: [
      ...deal.changes,
      {
        id: newId('CH'),
        at,
        actorUserId,
        field: '保護期限(基本設定の反映)',
        before: deal.protectionExpiresAt,
        after: p.expiresAt,
        note: `${STATUS_LABEL[deal.status]}の保護日数 ${p.days}日で再計算`,
      },
    ],
  }
}

/** 延長申請の承認による保護期限の延長 */
export function extendProtection(deal: Deal, days: number, actorUserId: string, at = nowISO()): Deal {
  const next = addDays(deal.protectionExpiresAt, days)
  return {
    ...deal,
    protectionExpiresAt: next,
    updatedAt: at,
    changes: [
      ...deal.changes,
      {
        id: newId('CH'),
        at,
        actorUserId,
        field: '保護期限(延長申請の承認)',
        before: deal.protectionExpiresAt,
        after: next,
        note: `${days}日延長`,
      },
    ],
  }
}
