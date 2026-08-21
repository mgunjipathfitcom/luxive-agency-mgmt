import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { nowISO, today } from '../domain/dates'
import { judge } from '../domain/duplicate'
import { newDealId, newId } from '../domain/id'
import {
  normalizeCompanyName,
  normalizeDomain,
  normalizeFacilityName,
  normalizePhone,
} from '../domain/normalize'
import {
  addAdditionalOrder,
  applyActivity,
  createDeal,
  extendProtection,
  rebuildAfterOrderChange,
  recalcProtection,
  saveAmounts,
} from '../domain/dealOps'
import type {
  Agency,
  Application,
  DB,
  Deal,
  DealProductLine,
  DealStatus,
  JudgeResult,
  Notification,
  Product,
  ReservedCase,
  ReviewCase,
  ReviewDecision,
  ReviewState,
  Settings,
  User,
} from '../domain/types'
import {
  clearDraft,
  loadDB,
  loadSessionUserId,
  resetDB,
  saveDB,
  saveSessionUserId,
} from './storage'

export interface Toast {
  id: string
  tone: 'ok' | 'warn' | 'danger' | 'info'
  message: string
}

export interface RegisterDealInput {
  companyName: string
  facilityName: string
  phone: string
  website: string
  contactPersonName: string
  contactPersonContact: string
  productNames: string[]
}

export interface RegisterDealResult {
  ok: boolean
  result: JudgeResult
  dealId: string | null
  applicationId: string
}

interface StoreValue {
  db: DB
  settings: Settings
  currentUser: User | null
  toasts: Toast[]
  pushToast: (tone: Toast['tone'], message: string) => void
  dismissToast: (id: string) => void
  login: (userId: string) => void
  logout: () => void
  resetDemo: () => void
  userById: (id: string | null | undefined) => User | null
  agencyById: (id: string | null | undefined) => Agency | null
  dealById: (id: string | null | undefined) => Deal | null
  runEligibility: (input: {
    companyName: string
    facilityName: string
    phone: string
    website: string
  }) => { result: JudgeResult; applicationId: string }
  registerDeal: (input: RegisterDealInput) => RegisterDealResult
  judgeOnly: (input: {
    companyName: string
    facilityName: string
    phone: string
    website: string
    excludeDealId?: string
  }) => JudgeResult
  saveActivity: (
    dealId: string,
    input: { activityDate: string; toStatus: DealStatus | null; body: string },
  ) => void
  saveDealAmounts: (
    dealId: string,
    input: { lines: DealProductLine[]; quoteDate: string | null; orderDate: string | null },
  ) => void
  addAdditional: (
    dealId: string,
    input: { orderDate: string; lines: { productName: string; amount: number }[] },
  ) => void
  voidAmountSnapshot: (dealId: string, snapshotId: string) => void
  voidOrderEvent: (dealId: string, orderId: string) => void
  updateDealBasic: (dealId: string, patch: Partial<Deal>) => void
  decideReview: (reviewId: string, decision: ReviewDecision, message: string) => void
  markNotificationRead: (id: string) => void
  upsertProduct: (product: Product) => void
  deleteProductImage: (productId: string) => void
  upsertReserved: (rc: ReservedCase) => void
  toggleReserved: (id: string, active: boolean) => void
  updateSettings: (next: Settings, applyToExisting: boolean) => void
  upsertAgencyUser: (user: User) => void
  setUserAccount: (userId: string, account: User['account']) => void
  setUserEmployment: (userId: string, employment: User['employment']) => void
  handoverDeals: (fromUserId: string, toUserId: string, dealIds: string[], mode: 'single' | 'bulk' | 'all') => void
  createExtension: (dealId: string, days: number, reason: string) => void
  decideExtension: (id: string, approve: boolean, message: string) => void
  createInquiry: (subject: string, body: string) => void
  replyInquiry: (id: string, body: string) => void
  upsertAgency: (agency: Agency) => void
}

const StoreContext = createContext<StoreValue | null>(null)

export function useStore(): StoreValue {
  const v = useContext(StoreContext)
  if (!v) throw new Error('StoreProvider の外で useStore が呼ばれました')
  return v
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(() => loadDB())
  const [currentUserId, setCurrentUserId] = useState<string | null>(() => loadSessionUserId())
  const [toasts, setToasts] = useState<Toast[]>([])
  const dbRef = useRef(db)
  dbRef.current = db

  useEffect(() => {
    saveDB(db)
  }, [db])

  const pushToast = useCallback((tone: Toast['tone'], message: string) => {
    const id = newId('TS')
    setToasts((prev) => [...prev, { id, tone, message }])
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const mutate = useCallback((fn: (draft: DB) => DB) => {
    setDb((prev) => {
      const next = fn(prev)
      dbRef.current = next
      return next
    })
  }, [])

  const currentUser = useMemo(
    () => db.users.find((u) => u.id === currentUserId) ?? null,
    [db.users, currentUserId],
  )

  const audit = useCallback(
    (draft: DB, action: string, targetType: string, targetId: string, detail: string, actorId?: string): DB => ({
      ...draft,
      audits: [
        {
          id: newId('AU'),
          at: nowISO(),
          actorUserId: actorId ?? currentUserId ?? 'unknown',
          action,
          targetType,
          targetId,
          detail,
        },
        ...draft.audits,
      ],
    }),
    [currentUserId],
  )

  const login = useCallback(
    (userId: string) => {
      setCurrentUserId(userId)
      saveSessionUserId(userId)
      mutate((draft) => {
        const users = draft.users.map((u) => (u.id === userId ? { ...u, lastLoginAt: nowISO() } : u))
        return audit({ ...draft, users }, 'ログイン', '利用者', userId, '', userId)
      })
    },
    [audit, mutate],
  )

  const logout = useCallback(() => {
    setCurrentUserId(null)
    saveSessionUserId(null)
    clearDraft()
  }, [])

  const resetDemo = useCallback(() => {
    const fresh = resetDB()
    setDb(fresh)
    dbRef.current = fresh
    pushToast('info', 'デモデータを初期状態に戻しました')
  }, [pushToast])

  const userById = useCallback(
    (id: string | null | undefined) => db.users.find((u) => u.id === id) ?? null,
    [db.users],
  )
  const agencyById = useCallback(
    (id: string | null | undefined) => db.agencies.find((a) => a.id === id) ?? null,
    [db.agencies],
  )
  const dealById = useCallback(
    (id: string | null | undefined) => db.deals.find((d) => d.id === id) ?? null,
    [db.deals],
  )

  const judgeOnly = useCallback(
    (input: { companyName: string; facilityName: string; phone: string; website: string; excludeDealId?: string }) =>
      judge(input, dbRef.current, dbRef.current.settings),
    [],
  )

  /** 営業可否照会(§3)。簡易チェックの結果を申請履歴へ残す。 */
  const runEligibility = useCallback<StoreValue['runEligibility']>(
    (input) => {
      const base = dbRef.current
      const result = judge(input, base, base.settings)
      const applicationId = newId('AP')
      const user = base.users.find((u) => u.id === currentUserId)
      const application: Application = {
        id: applicationId,
        kind: 'eligibility',
        applicantUserId: user?.id ?? 'unknown',
        agencyId: user?.agencyId ?? '',
        dealId: null,
        input: { ...input },
        productNames: [],
        judgement: result.judgement,
        topScore: result.topScore,
        reasonText: result.reasonText,
        candidateRefIds: result.candidates.map((c) => c.refId),
        createdAt: nowISO(),
        reviewState: 'none',
        decidedAt: null,
        decidedByUserId: null,
        decisionMessage: '',
        canReapply: false,
      }
      mutate((draft) =>
        audit(
          { ...draft, applications: [application, ...draft.applications] },
          '営業可否照会',
          '照会',
          applicationId,
          `${input.companyName} / 判定: ${result.judgement}`,
        ),
      )
      return { result, applicationId }
    },
    [audit, currentUserId, mutate],
  )

  /** 営業予定登録(§6.3)。登録ボタン押下時に最新値で必ず再判定する。 */
  const registerDeal = useCallback<StoreValue['registerDeal']>(
    (input) => {
      // §5.3 登録処理開始時に引継ぎ用データを削除する
      clearDraft()
      const base = dbRef.current
      const user = base.users.find((u) => u.id === currentUserId)
      const result = judge(
        {
          companyName: input.companyName,
          facilityName: input.facilityName,
          phone: input.phone,
          website: input.website,
        },
        base,
        base.settings,
      )
      const applicationId = newId('AP')
      const blocked = result.judgement === 'reserved' || result.judgement === 'ordered'
      const dealId = blocked ? null : newDealId(base.deals.map((d) => d.id), Number(today().slice(0, 4)))

      const application: Application = {
        id: applicationId,
        kind: 'deal-register',
        applicantUserId: user?.id ?? 'unknown',
        agencyId: user?.agencyId ?? '',
        dealId,
        input: {
          companyName: input.companyName,
          facilityName: input.facilityName,
          phone: input.phone,
          website: input.website,
        },
        productNames: input.productNames,
        judgement: result.judgement,
        topScore: result.topScore,
        reasonText: result.reasonText,
        candidateRefIds: result.candidates.map((c) => c.refId),
        createdAt: nowISO(),
        reviewState: result.judgement === 'similar' ? 'pending' : 'none',
        decidedAt: null,
        decidedByUserId: null,
        decisionMessage: '',
        canReapply: false,
      }

      mutate((draft) => {
        let next: DB = { ...draft, applications: [application, ...draft.applications] }
        if (!blocked && dealId && user) {
          const deal = createDeal({
            id: dealId,
            agencyId: user.agencyId ?? '',
            ownerUserId: user.id,
            createdByUserId: user.id,
            companyName: input.companyName,
            facilityName: input.facilityName,
            phone: input.phone,
            website: input.website,
            contactPersonName: input.contactPersonName,
            contactPersonContact: input.contactPersonContact,
            productNames: input.productNames,
            judgement: result.judgement,
            reviewState: result.judgement === 'similar' ? 'pending' : 'none',
            fromInquiry: true,
            settings: draft.settings,
          })
          next = { ...next, deals: [deal, ...next.deals] }
          if (result.judgement === 'similar') {
            const review: ReviewCase = {
              id: newId('RV'),
              applicationId,
              dealId,
              agencyId: user.agencyId ?? '',
              applicantUserId: user.id,
              submittedAt: nowISO(),
              topScore: result.topScore,
              candidates: result.candidates,
              reasonText: result.reasonText,
              state: 'pending',
              decidedAt: null,
              decidedByUserId: null,
              decision: null,
              message: '',
            }
            next = { ...next, reviews: [review, ...next.reviews] }
          }
        }
        return audit(
          next,
          '営業予定登録',
          '案件',
          dealId ?? applicationId,
          `${input.companyName} / 判定: ${result.judgement}`,
        )
      })

      return { ok: !blocked, result, dealId, applicationId }
    },
    [audit, currentUserId, mutate],
  )

  const saveActivity = useCallback<StoreValue['saveActivity']>(
    (dealId, input) => {
      mutate((draft) => {
        const deals = draft.deals.map((d) =>
          d.id === dealId
            ? applyActivity(d, {
                activityDate: input.activityDate,
                toStatus: input.toStatus,
                body: input.body,
                authorUserId: currentUserId ?? 'unknown',
                settings: draft.settings,
              })
            : d,
        )
        return audit({ ...draft, deals }, '案件進捗・営業活動を保存', '案件', dealId, input.body.slice(0, 60))
      })
      pushToast('ok', '案件進捗・営業活動を保存しました')
    },
    [audit, currentUserId, mutate, pushToast],
  )

  const saveDealAmounts = useCallback<StoreValue['saveDealAmounts']>(
    (dealId, input) => {
      mutate((draft) => {
        const deals = draft.deals.map((d) =>
          d.id === dealId
            ? saveAmounts(d, {
                lines: input.lines,
                quoteDate: input.quoteDate,
                orderDate: input.orderDate,
                authorUserId: currentUserId ?? 'unknown',
                settings: draft.settings,
              })
            : d,
        )
        return audit({ ...draft, deals }, '提案・見積・受注情報を保存', '案件', dealId, '')
      })
      pushToast('ok', '提案・見積・受注情報を保存しました')
    },
    [audit, currentUserId, mutate, pushToast],
  )

  const addAdditional = useCallback<StoreValue['addAdditional']>(
    (dealId, input) => {
      mutate((draft) => {
        const deals = draft.deals.map((d) =>
          d.id === dealId
            ? addAdditionalOrder(d, {
                orderDate: input.orderDate,
                lines: input.lines,
                authorUserId: currentUserId ?? 'unknown',
                settings: draft.settings,
              })
            : d,
        )
        return audit({ ...draft, deals }, '追加受注を登録', '案件', dealId, '')
      })
      pushToast('ok', '追加受注を登録しました')
    },
    [audit, currentUserId, mutate, pushToast],
  )

  const voidAmountSnapshot = useCallback<StoreValue['voidAmountSnapshot']>(
    (dealId, snapshotId) => {
      mutate((draft) => {
        const deals = draft.deals.map((d) =>
          d.id === dealId
            ? {
                ...d,
                amountHistory: d.amountHistory.map((s) => (s.id === snapshotId ? { ...s, voided: true } : s)),
                updatedAt: nowISO(),
              }
            : d,
        )
        return audit({ ...draft, deals }, '金額履歴を無効化', '案件', dealId, snapshotId)
      })
      pushToast('warn', '金額履歴を無効にしました。集計から除外されます')
    },
    [audit, mutate, pushToast],
  )

  const voidOrderEvent = useCallback<StoreValue['voidOrderEvent']>(
    (dealId, orderId) => {
      mutate((draft) => {
        const deals = draft.deals.map((d) => {
          if (d.id !== dealId) return d
          const voided = {
            ...d,
            orders: d.orders.map((o) => (o.id === orderId ? { ...o, voided: true } : o)),
            updatedAt: nowISO(),
          }
          // 残った受注イベントから、最終受注日・保護期限・ステータスを組み立て直す
          return rebuildAfterOrderChange(voided, draft.settings, currentUserId ?? 'unknown')
        })
        return audit({ ...draft, deals }, '受注を取消', '案件', dealId, orderId)
      })
      pushToast('warn', '受注を取消しました。集計と保護期限を計算し直します')
    },
    [audit, currentUserId, mutate, pushToast],
  )

  const updateDealBasic = useCallback<StoreValue['updateDealBasic']>(
    (dealId, patch) => {
      mutate((draft) => {
        const deals = draft.deals.map((d) => {
          if (d.id !== dealId) return d
          const changes = [...d.changes]
          const at = nowISO()
          const track = (field: string, before: string, after: string) => {
            if (before !== after) {
              changes.push({
                id: newId('CH'),
                at,
                actorUserId: currentUserId ?? 'unknown',
                field,
                before: before || '—',
                after: after || '—',
                note: '',
              })
            }
          }
          if (patch.facilityName !== undefined) track('施設名', d.facilityName, patch.facilityName)
          if (patch.phone !== undefined) track('電話番号', d.phone, patch.phone)
          if (patch.website !== undefined) track('Webサイト', d.website, patch.website)
          if (patch.contactPersonName !== undefined) track('企業担当者名', d.contactPersonName, patch.contactPersonName)
          if (patch.contactPersonContact !== undefined)
            track('企業担当者連絡先', d.contactPersonContact, patch.contactPersonContact)
          const merged: Deal = { ...d, ...patch, changes, updatedAt: at }
          merged.facilityNameNorm = normalizeFacilityName(merged.facilityName)
          merged.phoneNorm = normalizePhone(merged.phone)
          merged.websiteDomain = normalizeDomain(merged.website) ?? ''
          merged.companyNameNorm = normalizeCompanyName(merged.companyName)
          return merged
        })
        return audit({ ...draft, deals }, '案件の基本情報を更新', '案件', dealId, '')
      })
      pushToast('ok', '基本情報を更新しました')
    },
    [audit, currentUserId, mutate, pushToast],
  )

  /** 本部の重複審査(§14.3)。案件・申請履歴・通知・監査ログを同じ更新処理で整合させる。 */
  const decideReview = useCallback<StoreValue['decideReview']>(
    (reviewId, decision, message) => {
      mutate((draft) => {
        const review = draft.reviews.find((r) => r.id === reviewId)
        // 二重送信で通知・監査ログが増えないよう、未処理のものだけ確定する(§14.4)
        if (!review || review.state !== 'pending') return draft
        const at = nowISO()
        const state: ReviewState =
          decision === 'approve' ? 'approved' : decision === 'block' ? 'blocked' : 'returned'
        const reviews = draft.reviews.map((r) =>
          r.id === reviewId
            ? { ...r, state, decision, message, decidedAt: at, decidedByUserId: currentUserId ?? 'unknown' }
            : r,
        )
        const applications = draft.applications.map((a) =>
          a.id === review.applicationId
            ? {
                ...a,
                reviewState: state,
                decidedAt: at,
                decidedByUserId: currentUserId ?? 'unknown',
                decisionMessage: message,
                canReapply: decision === 'return',
              }
            : a,
        )
        const deals = draft.deals.map((d) =>
          d.id === review.dealId
            ? {
                ...d,
                reviewState: state,
                blockedReason: decision === 'block' ? message : d.blockedReason,
                updatedAt: at,
                changes: [
                  ...d.changes,
                  {
                    id: newId('CH'),
                    at,
                    actorUserId: currentUserId ?? 'unknown',
                    field: '重複審査',
                    before: '重複審査待ち',
                    after:
                      decision === 'approve' ? '承認' : decision === 'block' ? '営業不可' : '差し戻し',
                    note: message,
                  },
                ],
              }
            : d,
        )
        // §15.1 通知は申請した本人だけに送る
        const applicant = draft.users.find((u) => u.id === review.applicantUserId)
        const notification: Notification = {
          id: newId('NT'),
          type: 'review-result',
          recipientUserId: review.applicantUserId,
          recipientEmail: applicant?.email ?? '',
          mailState: 'sent',
          applicationId: review.applicationId,
          dealId: review.dealId,
          result: decision,
          title:
            decision === 'approve'
              ? '重複審査の結果:承認'
              : decision === 'block'
                ? '重複審査の結果:営業不可'
                : '重複審査の結果:差し戻し',
          message,
          reviewedAt: at,
          readAt: null,
          canReapply: decision === 'return',
        }
        const next: DB = {
          ...draft,
          reviews,
          applications,
          deals,
          notifications: [notification, ...draft.notifications],
        }
        return audit(
          next,
          decision === 'approve' ? '重複審査:承認' : decision === 'block' ? '重複審査:営業不可' : '重複審査:差し戻し',
          '案件',
          review.dealId,
          message,
        )
      })
      pushToast('ok', '審査結果を登録し、申請者本人へ通知しました')
    },
    [audit, currentUserId, mutate, pushToast],
  )

  const markNotificationRead = useCallback<StoreValue['markNotificationRead']>(
    (id) => {
      mutate((draft) => ({
        ...draft,
        notifications: draft.notifications.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? nowISO() } : n)),
      }))
    },
    [mutate],
  )

  const upsertProduct = useCallback<StoreValue['upsertProduct']>(
    (product) => {
      mutate((draft) => {
        const exists = draft.products.some((p) => p.id === product.id)
        const products = exists
          ? draft.products.map((p) => (p.id === product.id ? { ...product, updatedAt: nowISO() } : p))
          : [...draft.products, { ...product, createdAt: nowISO(), updatedAt: nowISO() }]
        return audit({ ...draft, products }, exists ? '商品マスターを更新' : '商品マスターを追加', '商品', product.id, product.name)
      })
      pushToast('ok', '商品マスターを保存しました')
    },
    [audit, mutate, pushToast],
  )

  const deleteProductImage = useCallback<StoreValue['deleteProductImage']>(
    (productId) => {
      mutate((draft) => ({
        ...draft,
        products: draft.products.map((p) => (p.id === productId ? { ...p, imageDataUrl: null, updatedAt: nowISO() } : p)),
      }))
      pushToast('ok', '商品画像を削除しました')
    },
    [mutate, pushToast],
  )

  const upsertReserved = useCallback<StoreValue['upsertReserved']>(
    (rc) => {
      const normalized: ReservedCase = {
        ...rc,
        companyNameNorm: normalizeCompanyName(rc.companyName),
        facilityNameNorm: normalizeFacilityName(rc.facilityName),
        phoneNorm: normalizePhone(rc.phone),
        websiteDomain: normalizeDomain(rc.website) ?? '',
      }
      mutate((draft) => {
        const exists = draft.reserved.some((r) => r.id === normalized.id)
        const reserved = exists
          ? draft.reserved.map((r) => (r.id === normalized.id ? normalized : r))
          : [normalized, ...draft.reserved]
        return audit({ ...draft, reserved }, exists ? 'Reserved案件を更新' : 'Reserved案件を登録', 'Reserved案件', normalized.id, normalized.companyName)
      })
      pushToast('ok', 'Reserved案件を保存しました')
    },
    [audit, mutate, pushToast],
  )

  const toggleReserved = useCallback<StoreValue['toggleReserved']>(
    (id, active) => {
      mutate((draft) => {
        const reserved = draft.reserved.map((r) => (r.id === id ? { ...r, active } : r))
        return audit({ ...draft, reserved }, active ? 'Reserved案件を有効化' : 'Reserved案件を解除', 'Reserved案件', id, '')
      })
    },
    [audit, mutate],
  )

  /** 基本設定の変更(§10.7)。既存案件へ反映するかを選べる。 */
  const updateSettings = useCallback<StoreValue['updateSettings']>(
    (next, applyToExisting) => {
      mutate((draft) => {
        let deals = draft.deals
        if (applyToExisting) {
          deals = draft.deals.map((d) => recalcProtection(d, next, currentUserId ?? 'unknown'))
        }
        return audit(
          { ...draft, settings: next, deals },
          '基本設定を変更',
          '基本設定',
          'settings',
          applyToExisting ? '既存案件へ反映あり' : '既存案件へ反映なし',
        )
      })
      pushToast('ok', applyToExisting ? '基本設定を保存し、既存案件へ反映しました' : '基本設定を保存しました')
    },
    [audit, currentUserId, mutate, pushToast],
  )

  const upsertAgencyUser = useCallback<StoreValue['upsertAgencyUser']>(
    (user) => {
      mutate((draft) => {
        const exists = draft.users.some((u) => u.id === user.id)
        const users = exists ? draft.users.map((u) => (u.id === user.id ? user : u)) : [...draft.users, user]
        return audit({ ...draft, users }, exists ? '代理店ユーザーを更新' : '代理店ユーザーを登録', '代理店ユーザー', user.id, user.name)
      })
      pushToast('ok', 'ユーザー情報を保存しました')
    },
    [audit, mutate, pushToast],
  )

  const setUserAccount = useCallback<StoreValue['setUserAccount']>(
    (userId, account) => {
      mutate((draft) => {
        const users = draft.users.map((u) => (u.id === userId ? { ...u, account } : u))
        return audit({ ...draft, users }, `アカウント状態を${account}へ変更`, '代理店ユーザー', userId, '')
      })
    },
    [audit, mutate],
  )

  const setUserEmployment = useCallback<StoreValue['setUserEmployment']>(
    (userId, employment) => {
      mutate((draft) => {
        const users = draft.users.map((u) => (u.id === userId ? { ...u, employment } : u))
        return audit({ ...draft, users }, `在籍状態を${employment}へ変更`, '代理店ユーザー', userId, '')
      })
    },
    [audit, mutate],
  )

  const handoverDeals = useCallback<StoreValue['handoverDeals']>(
    (fromUserId, toUserId, dealIds, mode) => {
      const to0 = dbRef.current.users.find((u) => u.id === toUserId)
      const movedCount = dbRef.current.deals.filter(
        (d) => dealIds.includes(d.id) && d.ownerUserId === fromUserId && d.agencyId === to0?.agencyId,
      ).length
      mutate((draft) => {
        const at = nowISO()
        const from = draft.users.find((u) => u.id === fromUserId)
        const to = draft.users.find((u) => u.id === toUserId)
        if (!to) return draft
        // 画面を開いたあとに担当が変わっている場合があるので、いまも引継ぎ元が担当している
        // 同一代理店の案件だけを対象にする(§17)
        const targets = draft.deals.filter(
          (d) => dealIds.includes(d.id) && d.ownerUserId === fromUserId && d.agencyId === to.agencyId,
        )
        if (targets.length === 0) return draft
        const targetIds = targets.map((d) => d.id)
        const deals = draft.deals.map((d) =>
          targetIds.includes(d.id)
            ? {
                ...d,
                ownerUserId: toUserId,
                updatedAt: at,
                changes: [
                  ...d.changes,
                  {
                    id: newId('CH'),
                    at,
                    actorUserId: currentUserId ?? 'unknown',
                    field: '担当営業(引継ぎ)',
                    before: from?.name ?? fromUserId,
                    after: to.name,
                    note: '',
                  },
                ],
              }
            : d,
        )
        const handovers = [
          {
            id: newId('HO'),
            agencyId: to.agencyId ?? '',
            fromUserId,
            toUserId,
            actorUserId: currentUserId ?? 'unknown',
            at,
            dealIds: targetIds,
            mode,
          },
          ...draft.handovers,
        ]
        return audit(
          { ...draft, deals, handovers },
          '担当案件を引継ぎ',
          '代理店ユーザー',
          fromUserId,
          `${from?.name ?? fromUserId} → ${to.name}(${targetIds.length}件)`,
        )
      })
      if (movedCount === 0) {
        pushToast('warn', '引継ぎできる案件がありませんでした(担当が変わっている可能性があります)')
        return
      }
      pushToast('ok', `${movedCount}件の案件を引継ぎました`)
    },
    [audit, currentUserId, mutate, pushToast],
  )

  const createExtension = useCallback<StoreValue['createExtension']>(
    (dealId, days, reason) => {
      mutate((draft) => {
        const user = draft.users.find((u) => u.id === currentUserId)
        const ex = {
          id: newId('EX'),
          dealId,
          agencyId: user?.agencyId ?? '',
          requestedByUserId: user?.id ?? 'unknown',
          requestedDays: days,
          reason,
          state: 'pending' as const,
          createdAt: nowISO(),
          decidedAt: null,
          decidedByUserId: null,
          message: '',
        }
        return audit({ ...draft, extensions: [ex, ...draft.extensions] }, '延長申請', '案件', dealId, `${days}日`)
      })
      pushToast('ok', '延長申請を送信しました')
    },
    [audit, currentUserId, mutate, pushToast],
  )

  const decideExtension = useCallback<StoreValue['decideExtension']>(
    (id, approve, message) => {
      mutate((draft) => {
        const ex = draft.extensions.find((e) => e.id === id)
        // 二重送信で保護期限が二重に延びないよう、申請中のものだけ確定する
        if (!ex || ex.state !== 'pending') return draft
        const at = nowISO()
        const extensions = draft.extensions.map((e) =>
          e.id === id
            ? { ...e, state: approve ? ('approved' as const) : ('rejected' as const), decidedAt: at, decidedByUserId: currentUserId ?? 'unknown', message }
            : e,
        )
        const deals = approve
          ? draft.deals.map((d) => (d.id === ex.dealId ? extendProtection(d, ex.requestedDays, currentUserId ?? 'unknown', at) : d))
          : draft.deals
        const applicant = draft.users.find((u) => u.id === ex.requestedByUserId)
        const notification: Notification = {
          id: newId('NT'),
          type: 'extension-result',
          recipientUserId: ex.requestedByUserId,
          recipientEmail: applicant?.email ?? '',
          mailState: 'sent',
          applicationId: null,
          dealId: ex.dealId,
          result: approve ? 'approve' : 'block',
          title: approve ? '延長申請の結果:承認' : '延長申請の結果:却下',
          message,
          reviewedAt: at,
          readAt: null,
          canReapply: !approve,
        }
        return audit(
          { ...draft, extensions, deals, notifications: [notification, ...draft.notifications] },
          approve ? '延長申請を承認' : '延長申請を却下',
          '案件',
          ex.dealId,
          message,
        )
      })
      pushToast('ok', '延長申請を処理しました')
    },
    [audit, currentUserId, mutate, pushToast],
  )

  const createInquiry = useCallback<StoreValue['createInquiry']>(
    (subject, body) => {
      mutate((draft) => {
        const user = draft.users.find((u) => u.id === currentUserId)
        const iq = {
          id: newId('IQ'),
          fromUserId: user?.id ?? 'unknown',
          agencyId: user?.agencyId ?? '',
          subject,
          body,
          state: 'open' as const,
          createdAt: nowISO(),
          replies: [],
        }
        return audit({ ...draft, inquiries: [iq, ...draft.inquiries] }, '本部へ問い合わせ', '問い合わせ', iq.id, subject)
      })
      pushToast('ok', '本部へ問い合わせを送信しました')
    },
    [audit, currentUserId, mutate, pushToast],
  )

  const replyInquiry = useCallback<StoreValue['replyInquiry']>(
    (id, body) => {
      mutate((draft) => {
        const at = nowISO()
        const inquiries = draft.inquiries.map((q) =>
          q.id === id
            ? {
                ...q,
                state: 'answered' as const,
                replies: [...q.replies, { id: newId('IR'), at, authorUserId: currentUserId ?? 'unknown', body }],
              }
            : q,
        )
        const target = draft.inquiries.find((q) => q.id === id)
        const applicant = draft.users.find((u) => u.id === target?.fromUserId)
        const notification: Notification | null = target
          ? {
              id: newId('NT'),
              type: 'inquiry-reply',
              recipientUserId: target.fromUserId,
              recipientEmail: applicant?.email ?? '',
              mailState: 'sent',
              applicationId: null,
              dealId: null,
              result: null,
              title: '問い合わせへの回答',
              message: body,
              reviewedAt: at,
              readAt: null,
              canReapply: false,
            }
          : null
        return audit(
          {
            ...draft,
            inquiries,
            notifications: notification ? [notification, ...draft.notifications] : draft.notifications,
          },
          '問い合わせへ回答',
          '問い合わせ',
          id,
          body.slice(0, 60),
        )
      })
      pushToast('ok', '回答を送信しました')
    },
    [audit, currentUserId, mutate, pushToast],
  )

  const upsertAgency = useCallback<StoreValue['upsertAgency']>(
    (agency) => {
      mutate((draft) => {
        const exists = draft.agencies.some((a) => a.id === agency.id)
        const agencies = exists ? draft.agencies.map((a) => (a.id === agency.id ? agency : a)) : [...draft.agencies, agency]
        return audit({ ...draft, agencies }, exists ? '代理店を更新' : '代理店を登録', '代理店', agency.id, agency.name)
      })
      pushToast('ok', '代理店情報を保存しました')
    },
    [audit, mutate, pushToast],
  )

  const value = useMemo<StoreValue>(
    () => ({
      db,
      settings: db.settings,
      currentUser,
      toasts,
      pushToast,
      dismissToast,
      login,
      logout,
      resetDemo,
      userById,
      agencyById,
      dealById,
      runEligibility,
      registerDeal,
      judgeOnly,
      saveActivity,
      saveDealAmounts,
      addAdditional,
      voidAmountSnapshot,
      voidOrderEvent,
      updateDealBasic,
      decideReview,
      markNotificationRead,
      upsertProduct,
      deleteProductImage,
      upsertReserved,
      toggleReserved,
      updateSettings,
      upsertAgencyUser,
      setUserAccount,
      setUserEmployment,
      handoverDeals,
      createExtension,
      decideExtension,
      createInquiry,
      replyInquiry,
      upsertAgency,
    }),
    [
      db, currentUser, toasts, pushToast, dismissToast, login, logout, resetDemo,
      userById, agencyById, dealById, runEligibility, registerDeal, judgeOnly,
      saveActivity, saveDealAmounts, addAdditional, voidAmountSnapshot, voidOrderEvent,
      updateDealBasic, decideReview, markNotificationRead, upsertProduct, deleteProductImage,
      upsertReserved, toggleReserved, updateSettings, upsertAgencyUser, setUserAccount,
      setUserEmployment, handoverDeals, createExtension, decideExtension, createInquiry,
      replyInquiry, upsertAgency,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
