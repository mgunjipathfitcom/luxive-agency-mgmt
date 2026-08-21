/**
 * Luxive Agency Management - ドメイン型定義
 * 仕様書「Luxive Agency Management 統合仕様書」に対応する。
 */

/** 利用者ロール(§2) */
export type Role = 'hq' | 'agency_admin' | 'agency_member'

/** 案件の内部ステータス。主要業務フロー5段階(§1)に対応する。
 *  inquiry(営業可否照会)は案件生成前の段階のため、案件はplanned以降を持つ。 */
export type DealStage = 'inquiry' | 'planned' | 'meeting' | 'quoted' | 'ordered'
export type DealStatus = Exclude<DealStage, 'inquiry'>

/** 重複判定の4区分(§4.3) */
export type Judgement = 'clear' | 'similar' | 'reserved' | 'ordered'

/** 案件の審査状態 */
export type ReviewState = 'none' | 'pending' | 'approved' | 'blocked' | 'returned'

/** 本部の審査操作(§14.3) */
export type ReviewDecision = 'approve' | 'block' | 'return'

/** 商品の販売状態(§7.2) */
export type SalesStatus = 'active' | 'suspended'

/** 代理店ユーザーの在籍状態(§17) */
export type EmploymentState = 'active' | 'leave' | 'retired'
/** アカウント状態(§17) */
export type AccountState = 'invited' | 'active' | 'suspended'

export interface Agency {
  id: string
  code: string
  name: string
  area: string
  contactEmail: string
  contactPhone: string
  createdAt: string
  active: boolean
}

export interface User {
  id: string
  agencyId: string | null
  role: Role
  name: string
  email: string
  department: string
  employment: EmploymentState
  account: AccountState
  invitedAt: string | null
  lastLoginAt: string | null
  createdAt: string
}

export interface Product {
  id: string
  sku: string
  brand: string
  category: string
  name: string
  scent: string
  size: string
  description: string
  imageDataUrl: string | null
  salesStatus: SalesStatus
  note: string
  createdAt: string
  updatedAt: string
}

/** 案件の提案・見積・受注の商品行(§12) */
export interface DealProductLine {
  productName: string
  proposed: boolean
  quoteAmount: number | null
  orderAmount: number | null
}

/** 案件進捗・営業活動の履歴(§11.3) */
export interface ActivityEntry {
  id: string
  activityDate: string
  fromStatus: DealStatus | null
  toStatus: DealStatus | null
  body: string
  authorUserId: string
  createdAt: string
  protectionExpiresAt: string | null
}

/** 提案・見積・受注情報のスナップショット履歴(§12.3) */
export interface AmountSnapshot {
  id: string
  registeredAt: string
  quoteDate: string | null
  orderDate: string | null
  lines: DealProductLine[]
  quoteTotal: number
  orderTotal: number
  orderKind: 'none' | 'initial' | 'additional'
  authorUserId: string
  createdAt: string
  voided: boolean
}

/** 受注イベント(初回・追加)(§13) */
export interface OrderEvent {
  id: string
  kind: 'initial' | 'additional'
  orderDate: string
  lines: { productName: string; amount: number }[]
  total: number
  authorUserId: string
  createdAt: string
  voided: boolean
}

/** 変更履歴(§9.1) */
export interface ChangeEntry {
  id: string
  at: string
  actorUserId: string
  field: string
  before: string
  after: string
  note: string
}

export interface Deal {
  id: string
  agencyId: string
  ownerUserId: string
  createdByUserId: string
  companyName: string
  companyNameNorm: string
  facilityName: string
  facilityNameNorm: string
  phone: string
  phoneNorm: string
  website: string
  websiteDomain: string
  contactPersonName: string
  contactPersonContact: string
  status: DealStatus
  fromInquiry: boolean
  judgement: Judgement
  reviewState: ReviewState
  protectionStartAt: string
  protectionExpiresAt: string
  firstReachedAt: Partial<Record<DealStatus, string>>
  lastOrderDate: string | null
  createdAt: string
  updatedAt: string
  lines: DealProductLine[]
  activities: ActivityEntry[]
  amountHistory: AmountSnapshot[]
  orders: OrderEvent[]
  changes: ChangeEntry[]
  blockedReason: string
}

/** Reserved案件(§4.2) */
export interface ReservedCase {
  id: string
  companyName: string
  companyNameNorm: string
  facilityName: string
  facilityNameNorm: string
  phone: string
  phoneNorm: string
  website: string
  websiteDomain: string
  reason: string
  registeredAt: string
  active: boolean
}

/** 重複候補(§4.6 / §14.1) */
export interface DuplicateCandidate {
  kind: 'reserved' | 'deal'
  refId: string
  score: number
  matched: string[]
  unmatched: string[]
  reason: string
  protectionState: 'reserved' | 'active' | 'expired' | 'none'
  recommendation: 'approve' | 'check' | 'block'
}

export interface JudgeInput {
  companyName: string
  facilityName: string
  phone: string
  website: string
  excludeDealId?: string
}

export type JudgeReasonCode =
  | 'reserved-hit'
  | 'active-order-hit'
  | 'company-name-exact'
  | 'contact-exact'
  | 'score-threshold'
  | 'no-match'

export interface JudgeResult {
  judgement: Judgement
  topScore: number
  candidates: DuplicateCandidate[]
  reasonCode: JudgeReasonCode
  reasonText: string
  normalized: {
    companyNameNorm: string
    facilityNameNorm: string
    phoneNorm: string
    websiteDomain: string
  }
}

/** 申請履歴(§6.3 / §15.3) */
export interface Application {
  id: string
  kind: 'eligibility' | 'deal-register'
  applicantUserId: string
  agencyId: string
  dealId: string | null
  input: { companyName: string; facilityName: string; phone: string; website: string }
  productNames: string[]
  judgement: Judgement
  topScore: number
  reasonText: string
  candidateRefIds: string[]
  createdAt: string
  reviewState: ReviewState
  decidedAt: string | null
  decidedByUserId: string | null
  decisionMessage: string
  canReapply: boolean
}

/** 本部重複審査キュー(§14) */
export interface ReviewCase {
  id: string
  applicationId: string
  dealId: string
  agencyId: string
  applicantUserId: string
  submittedAt: string
  topScore: number
  candidates: DuplicateCandidate[]
  reasonText: string
  state: ReviewState
  decidedAt: string | null
  decidedByUserId: string | null
  decision: ReviewDecision | null
  message: string
}

/** 本人限定通知(§15.2) */
export interface Notification {
  id: string
  type: 'review-result' | 'extension-result' | 'inquiry-reply' | 'handover'
  recipientUserId: string
  recipientEmail: string
  mailState: 'queued' | 'sent' | 'failed'
  applicationId: string | null
  dealId: string | null
  result: ReviewDecision | null
  title: string
  message: string
  reviewedAt: string
  readAt: string | null
  canReapply: boolean
}

/** 延長申請 */
export interface ExtensionRequest {
  id: string
  dealId: string
  agencyId: string
  requestedByUserId: string
  requestedDays: number
  reason: string
  state: 'pending' | 'approved' | 'rejected'
  createdAt: string
  decidedAt: string | null
  decidedByUserId: string | null
  message: string
}

/** 問い合わせ */
export interface Inquiry {
  id: string
  fromUserId: string
  agencyId: string
  subject: string
  body: string
  state: 'open' | 'answered' | 'closed'
  createdAt: string
  replies: { id: string; at: string; authorUserId: string; body: string }[]
}

/** 引継ぎ履歴(§17) */
export interface HandoverLog {
  id: string
  agencyId: string
  fromUserId: string
  toUserId: string
  actorUserId: string
  at: string
  dealIds: string[]
  mode: 'single' | 'bulk' | 'all'
}

/** 監査ログ(§2.1) */
export interface AuditLog {
  id: string
  at: string
  actorUserId: string
  action: string
  targetType: string
  targetId: string
  detail: string
}

/** 本部基本設定(§10.1 / §4.6 / §18.6) */
export interface Settings {
  plannedDays: number
  meetingDays: number
  quotedDays: number
  orderDays: number
  additionalOrderDays: number
  warningDays: number
  duplicateThreshold: number
  weightCompanyName: number
  weightPhone: number
  weightWebDomain: number
  weightFacilityName: number
  /** 電話番号・Webドメインの完全一致を必ず重複候補にする(既定ON) */
  forceContactExactSimilar: boolean
}

export interface EligibilityDraft {
  companyName: string
  facilityName: string
  phone: string
  website: string
  createdAt: string
}

export interface DB {
  schemaVersion: number
  agencies: Agency[]
  users: User[]
  products: Product[]
  deals: Deal[]
  reserved: ReservedCase[]
  applications: Application[]
  reviews: ReviewCase[]
  notifications: Notification[]
  extensions: ExtensionRequest[]
  inquiries: Inquiry[]
  handovers: HandoverLog[]
  audits: AuditLog[]
  settings: Settings
  seededAt: string
}
