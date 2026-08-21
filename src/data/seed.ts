/**
 * モックの初期データ。すべて架空の企業・人物・連絡先。
 * 案件はドメインの更新関数(dealOps)を通して組み立てるため、
 * 保護期限・履歴・ダッシュボード集計が実運用と同じ経路で整合する。
 */
import { addDays, today } from '../domain/dates'
import { DEFAULT_SETTINGS } from '../domain/protection'
import {
  addAdditionalOrder,
  applyActivity,
  createDeal,
  extendProtection,
  saveAmounts,
} from '../domain/dealOps'
import { newId } from '../domain/id'
import { judge } from '../domain/duplicate'
import {
  normalizeCompanyName,
  normalizeDomain,
  normalizeFacilityName,
  normalizePhone,
} from '../domain/normalize'
import type {
  Agency,
  Application,
  AuditLog,
  DB,
  Deal,
  DealStatus,
  ExtensionRequest,
  HandoverLog,
  Inquiry,
  Notification,
  Product,
  ReservedCase,
  ReviewCase,
  Settings,
  User,
} from '../domain/types'

export const SCHEMA_VERSION = 5

const S: Settings = { ...DEFAULT_SETTINGS }

function ago(days: number): string {
  return addDays(today(), -days)
}

/** 表示は現地時刻になるため、指定した時刻がそのまま画面に出るようにISOを組み立てる。 */
function stamp(days: number, hour = 10): string {
  const [y, m, d] = ago(days).split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, hour, 0, 0).toISOString()
}

// ---------------------------------------------------------------- 代理店
const agencies: Agency[] = [
  {
    id: 'AG-01',
    code: 'LX-KT-01',
    name: '株式会社リンクスプロモーション',
    area: '関東',
    contactEmail: 'info@linx-promo.example.jp',
    contactPhone: '03-5555-0101',
    createdAt: stamp(720),
    active: true,
  },
  {
    id: 'AG-02',
    code: 'LX-KS-02',
    name: '有限会社サンフィールド商会',
    area: '関西',
    contactEmail: 'contact@sunfield-sho.example.jp',
    contactPhone: '06-6666-0202',
    createdAt: stamp(690),
    active: true,
  },
  {
    id: 'AG-03',
    code: 'LX-TH-03',
    name: '合同会社ノルテ企画',
    area: '北海道・東北',
    contactEmail: 'office@norte-kikaku.example.jp',
    contactPhone: '011-777-0303',
    createdAt: stamp(540),
    active: true,
  },
  {
    id: 'AG-04',
    code: 'LX-KY-04',
    name: '株式会社セイリュウトレーディング',
    area: '九州',
    contactEmail: 'sales@seiryu-trading.example.jp',
    contactPhone: '092-888-0404',
    createdAt: stamp(430),
    active: true,
  },
]

// ---------------------------------------------------------------- 利用者
const users: User[] = [
  {
    id: 'U-HQ-1', agencyId: null, role: 'hq', name: '大槻 志保',
    email: 'shiho.otsuki@luxive-hq.example.jp', department: '営業推進部',
    employment: 'active', account: 'active', invitedAt: null, lastLoginAt: stamp(0, 8), createdAt: stamp(800),
  },
  {
    id: 'U-HQ-2', agencyId: null, role: 'hq', name: '三上 遼',
    email: 'ryo.mikami@luxive-hq.example.jp', department: '代理店管理課',
    employment: 'active', account: 'active', invitedAt: null, lastLoginAt: stamp(1, 18), createdAt: stamp(760),
  },
  {
    id: 'U-A1-ADM', agencyId: 'AG-01', role: 'agency_admin', name: '芝田 直人',
    email: 'shibata@linx-promo.example.jp', department: '営業一部',
    employment: 'active', account: 'active', invitedAt: stamp(719), lastLoginAt: stamp(0, 9), createdAt: stamp(719),
  },
  {
    id: 'U-A1-M1', agencyId: 'AG-01', role: 'agency_member', name: '遠藤 千尋',
    email: 'endo@linx-promo.example.jp', department: '営業一部',
    employment: 'active', account: 'active', invitedAt: stamp(700), lastLoginAt: stamp(0, 11), createdAt: stamp(700),
  },
  {
    id: 'U-A1-M2', agencyId: 'AG-01', role: 'agency_member', name: '若林 翔太',
    email: 'wakabayashi@linx-promo.example.jp', department: '営業二部',
    employment: 'active', account: 'active', invitedAt: stamp(410), lastLoginAt: stamp(3, 15), createdAt: stamp(410),
  },
  {
    id: 'U-A1-M3', agencyId: 'AG-01', role: 'agency_member', name: '桑野 里佳',
    email: 'kuwano@linx-promo.example.jp', department: '営業二部',
    employment: 'leave', account: 'suspended', invitedAt: stamp(300), lastLoginAt: stamp(64, 13), createdAt: stamp(300),
  },
  {
    id: 'U-A2-ADM', agencyId: 'AG-02', role: 'agency_admin', name: '桑原 恵',
    email: 'kuwahara@sunfield-sho.example.jp', department: '営業部',
    employment: 'active', account: 'active', invitedAt: stamp(688), lastLoginAt: stamp(1, 10), createdAt: stamp(688),
  },
  {
    id: 'U-A2-M1', agencyId: 'AG-02', role: 'agency_member', name: '西野 真紀',
    email: 'nishino@sunfield-sho.example.jp', department: '営業部',
    employment: 'active', account: 'active', invitedAt: stamp(520), lastLoginAt: stamp(0, 14), createdAt: stamp(520),
  },
  {
    id: 'U-A2-M2', agencyId: 'AG-02', role: 'agency_member', name: '藤沢 亮介',
    email: 'fujisawa@sunfield-sho.example.jp', department: '営業部',
    employment: 'active', account: 'invited', invitedAt: stamp(4), lastLoginAt: null, createdAt: stamp(4),
  },
  {
    id: 'U-A3-ADM', agencyId: 'AG-03', role: 'agency_admin', name: '佐久間 亮',
    email: 'sakuma@norte-kikaku.example.jp', department: '事業推進室',
    employment: 'active', account: 'active', invitedAt: stamp(538), lastLoginAt: stamp(2, 16), createdAt: stamp(538),
  },
  {
    id: 'U-A3-M1', agencyId: 'AG-03', role: 'agency_member', name: '板垣 悠',
    email: 'itagaki@norte-kikaku.example.jp', department: '事業推進室',
    employment: 'active', account: 'active', invitedAt: stamp(430), lastLoginAt: stamp(5, 9), createdAt: stamp(430),
  },
  {
    id: 'U-A4-ADM', agencyId: 'AG-04', role: 'agency_admin', name: '東 麻衣',
    email: 'azuma@seiryu-trading.example.jp', department: '営業統括',
    employment: 'active', account: 'active', invitedAt: stamp(428), lastLoginAt: stamp(1, 12), createdAt: stamp(428),
  },
  {
    id: 'U-A4-M1', agencyId: 'AG-04', role: 'agency_member', name: '中原 健吾',
    email: 'nakahara@seiryu-trading.example.jp', department: '営業統括',
    employment: 'retired', account: 'suspended', invitedAt: stamp(400), lastLoginAt: stamp(35, 17), createdAt: stamp(400),
  },
  {
    id: 'U-A4-M2', agencyId: 'AG-04', role: 'agency_member', name: '宮下 沙也加',
    email: 'miyashita@seiryu-trading.example.jp', department: '営業統括',
    employment: 'active', account: 'active', invitedAt: stamp(210), lastLoginAt: stamp(0, 13), createdAt: stamp(210),
  },
]

// ---------------------------------------------------------------- 商品マスター
function product(
  id: string, sku: string, brand: string, category: string, name: string,
  scent: string, size: string, description: string, salesStatus: Product['salesStatus'], note = '',
): Product {
  return {
    id, sku, brand, category, name, scent, size, description,
    imageDataUrl: null, salesStatus, note,
    createdAt: stamp(600), updatedAt: stamp(90),
  }
}

const products: Product[] = [
  product('PR-01', 'LX-DF-101', 'Luxive', 'ディフューザー', 'ルミエール ディフューザー', 'シトラスハーブ', '200mL',
    'ロビーやフロント向けの据置型。香りの強さを3段階で調整できる。', 'active'),
  product('PR-02', 'LX-DF-102', 'Luxive', 'ディフューザー', 'ルミエール ディフューザー ラージ', 'シトラスハーブ', '500mL',
    '吹き抜けや大型ロビー向けの大容量モデル。', 'active'),
  product('PR-03', 'LX-OL-201', 'Luxive', 'アロマオイル', 'セレスト アロマオイル', 'ホワイトフローラル', '100mL',
    'ディフューザー専用の詰め替えオイル。定期購入の主力。', 'active'),
  product('PR-04', 'LX-OL-202', 'Luxive', 'アロマオイル', 'セレスト アロマオイル ウッディ', 'シダーウッド', '100mL',
    '和の空間や旅館向けの落ち着いた香り。', 'active'),
  product('PR-05', 'LX-AM-301', 'Luxive Pro', 'アメニティ', 'ノワール ハンドソープ', 'ベルガモット', '300mL',
    '客室・パウダールーム向けの詰め替え式ハンドソープ。', 'active'),
  product('PR-06', 'LX-AM-302', 'Luxive Pro', 'アメニティ', 'ノワール ボディソープ', 'ベルガモット', '400mL',
    'ノワールシリーズのボディソープ。', 'active'),
  product('PR-07', 'LX-AM-303', 'Luxive Pro', 'アメニティ', 'ブラン シャンプー', 'ミュゲ', '400mL',
    'ノンシリコン処方の客室用シャンプー。', 'active'),
  product('PR-08', 'LX-AM-304', 'Luxive Pro', 'アメニティ', 'ブラン コンディショナー', 'ミュゲ', '400mL',
    'ブラン シャンプーとセットで導入されることが多い。', 'active'),
  product('PR-09', 'LX-SP-401', 'Luxive', 'ルームケア', 'リュクス ルームスプレー', 'ネロリ', '150mL',
    '客室清掃時の仕上げ用スプレー。', 'active'),
  product('PR-10', 'LX-SV-501', 'Luxive', 'サービス', 'メンテナンスパック(年間)', '—', '—',
    '設置機器の年1回点検とノズル交換を含む保守契約。', 'active'),
  product('PR-11', 'LX-CL-601', 'Luxive', 'ルームケア', 'クラシック ポプリ', 'ローズ', '80g',
    '旧シリーズ。2026年春に販売終了。', 'suspended', '在庫終了のため停止。既存案件の表示は維持する'),
  product('PR-12', 'LX-CL-602', 'Luxive', 'ルームケア', 'ヴィンテージ キャンドル', 'アンバー', '120g',
    '旧シリーズ。安全基準見直しのため販売停止。', 'suspended', '再開未定'),
]

// ---------------------------------------------------------------- Reserved案件
function reserved(
  id: string, companyName: string, facilityName: string, phone: string, website: string,
  reason: string, days: number,
): ReservedCase {
  return {
    id, companyName, companyNameNorm: normalizeCompanyName(companyName),
    facilityName, facilityNameNorm: normalizeFacilityName(facilityName),
    phone, phoneNorm: normalizePhone(phone),
    website, websiteDomain: normalizeDomain(website) ?? '',
    reason, registeredAt: stamp(days), active: true,
  }
}

const reservedCases: ReservedCase[] = [
  reserved('RS-01', '株式会社グランドオーシャンホテルズ', '', '03-5555-2100', 'https://www.grand-ocean.example.jp',
    '本部直販。全国チェーンのため代理店営業の対象外', 240),
  reserved('RS-02', '医療法人社団 桐生会', '', '045-333-1200', 'kiryu-kai.example.jp',
    '本部と包括契約の交渉中。決着まで営業停止', 120),
  reserved('RS-03', '株式会社アルバフーズ', '本社ビル', '052-222-8800', 'https://alba-foods.example.jp/company/',
    '本社ビルのみ本部直轄。他施設は代理店営業可', 70),
]

// ---------------------------------------------------------------- 案件
interface Step {
  daysAgo: number
  to?: DealStatus
  body: string
}

interface DealSpec {
  id: string
  agencyId: string
  ownerUserId: string
  createdByUserId?: string
  companyName: string
  facilityName?: string
  phone: string
  website: string
  contactPersonName?: string
  contactPersonContact?: string
  productNames: string[]
  registeredDaysAgo: number
  fromInquiry?: boolean
  steps?: Step[]
  quote?: { daysAgo: number; lines: [string, number][] }
  order?: { daysAgo: number; lines: [string, number][] }
  additionalOrders?: { daysAgo: number; lines: [string, number][] }[]
  reviewState?: Deal['reviewState']
  judgement?: Deal['judgement']
  blockedReason?: string
}

function buildDeal(spec: DealSpec): Deal {
  let deal = createDeal({
    id: spec.id,
    agencyId: spec.agencyId,
    ownerUserId: spec.ownerUserId,
    createdByUserId: spec.createdByUserId ?? spec.ownerUserId,
    companyName: spec.companyName,
    facilityName: spec.facilityName ?? '',
    phone: spec.phone,
    website: spec.website,
    contactPersonName: spec.contactPersonName ?? '',
    contactPersonContact: spec.contactPersonContact ?? '',
    productNames: spec.productNames,
    judgement: spec.judgement ?? 'clear',
    reviewState: spec.reviewState ?? 'none',
    fromInquiry: spec.fromInquiry ?? true,
    registeredAt: ago(spec.registeredDaysAgo),
    settings: S,
  })

  for (const step of spec.steps ?? []) {
    deal = applyActivity(deal, {
      activityDate: ago(step.daysAgo),
      toStatus: step.to ?? null,
      body: step.body,
      authorUserId: spec.ownerUserId,
      settings: S,
      at: stamp(step.daysAgo, 11),
    })
  }

  if (spec.quote) {
    const lines = deal.lines.map((l) => {
      const hit = spec.quote!.lines.find(([n]) => n === l.productName)
      return { ...l, proposed: true, quoteAmount: hit ? hit[1] : l.quoteAmount }
    })
    for (const [name, amount] of spec.quote.lines) {
      if (!lines.some((l) => l.productName === name)) {
        lines.push({ productName: name, proposed: true, quoteAmount: amount, orderAmount: null })
      }
    }
    deal = saveAmounts(deal, {
      lines,
      quoteDate: ago(spec.quote.daysAgo),
      orderDate: null,
      authorUserId: spec.ownerUserId,
      settings: S,
      at: stamp(spec.quote.daysAgo, 14),
    })
  }

  if (spec.order) {
    const lines = deal.lines.map((l) => {
      const hit = spec.order!.lines.find(([n]) => n === l.productName)
      return { ...l, orderAmount: hit ? hit[1] : l.orderAmount }
    })
    for (const [name, amount] of spec.order.lines) {
      if (!lines.some((l) => l.productName === name)) {
        lines.push({ productName: name, proposed: true, quoteAmount: null, orderAmount: amount })
      }
    }
    deal = saveAmounts(deal, {
      lines,
      quoteDate: ago(spec.quote ? spec.quote.daysAgo : spec.order.daysAgo),
      orderDate: ago(spec.order.daysAgo),
      authorUserId: spec.ownerUserId,
      settings: S,
      at: stamp(spec.order.daysAgo, 15),
    })
  }

  for (const add of spec.additionalOrders ?? []) {
    deal = addAdditionalOrder(deal, {
      orderDate: ago(add.daysAgo),
      lines: add.lines.map(([productName, amount]) => ({ productName, amount })),
      authorUserId: spec.ownerUserId,
      settings: S,
      at: stamp(add.daysAgo, 16),
    })
  }

  if (spec.reviewState) deal.reviewState = spec.reviewState
  if (spec.judgement) deal.judgement = spec.judgement
  if (spec.blockedReason) deal.blockedReason = spec.blockedReason
  return deal
}

const dealSpecs: DealSpec[] = [
  // --- 受入テストの基準になる案件 -------------------------------------------
  {
    id: 'DL-2026-0001', agencyId: 'AG-01', ownerUserId: 'U-A1-M1',
    companyName: '東都ホテル株式会社', facilityName: '本館',
    phone: '03-5555-1010', website: 'https://www.toto-hotel.example.jp/',
    contactPersonName: '総務部 岩瀬様', contactPersonContact: '03-5555-1011',
    productNames: ['ルミエール ディフューザー', 'セレスト アロマオイル'],
    registeredDaysAgo: 48,
    steps: [
      { daysAgo: 40, body: 'フロント責任者へ資料送付。ロビーの香り演出に関心あり。' },
      { daysAgo: 22, to: 'meeting', body: '本館ロビーで実機デモ。支配人・総務部長が同席。' },
      { daysAgo: 9, body: '香りの強さ調整について再デモの依頼あり。来週訪問予定。' },
    ],
  },
  {
    id: 'DL-2026-0002', agencyId: 'AG-01', ownerUserId: 'U-A1-ADM',
    companyName: '株式会社ベイサイドリゾート', facilityName: 'みなとみらい店',
    phone: '045-222-3300', website: 'https://bayside-resort.example.jp',
    contactPersonName: '運営部 小西様', contactPersonContact: 'konishi@bayside-resort.example.jp',
    productNames: ['ルミエール ディフューザー ラージ', 'セレスト アロマオイル', 'メンテナンスパック(年間)'],
    registeredDaysAgo: 150,
    steps: [
      { daysAgo: 140, to: 'meeting', body: '館内3フロアへの導入を提案。' },
      { daysAgo: 110, to: 'quoted', body: '見積提出。年間保守を含む構成で調整。' },
    ],
    quote: { daysAgo: 110, lines: [['ルミエール ディフューザー ラージ', 480000], ['セレスト アロマオイル', 216000], ['メンテナンスパック(年間)', 120000]] },
    order: { daysAgo: 62, lines: [['ルミエール ディフューザー ラージ', 480000], ['セレスト アロマオイル', 216000], ['メンテナンスパック(年間)', 120000]] },
    additionalOrders: [{ daysAgo: 18, lines: [['セレスト アロマオイル', 108000], ['リュクス ルームスプレー', 46000]] }],
  },
  {
    id: 'DL-2026-0003', agencyId: 'AG-02', ownerUserId: 'U-A2-M1',
    companyName: '桜井メディカルクリニック', facilityName: '',
    phone: '06-6666-4400', website: 'https://sakurai-medical.example.jp',
    productNames: ['リュクス ルームスプレー'],
    registeredDaysAgo: 210,
    steps: [{ daysAgo: 205, body: '受付へ訪問。院長不在のため資料のみ。' }],
  },
  {
    id: 'DL-2026-0004', agencyId: 'AG-03', ownerUserId: 'U-A3-M1',
    companyName: '株式会社ノースウィング', facilityName: '札幌本店',
    phone: '011-777-5500', website: 'https://northwing.example.jp',
    productNames: ['ルミエール ディフューザー', 'ノワール ハンドソープ', 'クラシック ポプリ'],
    registeredDaysAgo: 520,
    steps: [
      { daysAgo: 510, to: 'meeting', body: '店舗巡回時に商談。' },
      { daysAgo: 480, to: 'quoted', body: '見積提出。' },
    ],
    quote: { daysAgo: 480, lines: [['ルミエール ディフューザー', 240000], ['クラシック ポプリ', 60000]] },
    order: { daysAgo: 400, lines: [['ルミエール ディフューザー', 240000], ['クラシック ポプリ', 60000]] },
  },

  // --- 保護期限が近い / 進行中 ----------------------------------------------
  {
    id: 'DL-2026-0005', agencyId: 'AG-01', ownerUserId: 'U-A1-M2',
    companyName: '合同会社リバーサイドカフェ', facilityName: '中目黒店',
    phone: '03-5555-7788', website: 'https://riverside-cafe.example.jp',
    productNames: ['リュクス ルームスプレー', 'ノワール ハンドソープ'],
    registeredDaysAgo: 24,
    steps: [{ daysAgo: 20, body: '店長へ試供品を提供。反応は良好。' }],
  },
  {
    id: 'DL-2026-0006', agencyId: 'AG-01', ownerUserId: 'U-A1-M1',
    companyName: '株式会社ミナトデンタル', facilityName: '横浜駅前医院',
    phone: '045-222-9911', website: 'https://minato-dental.example.jp',
    productNames: ['ルミエール ディフューザー', 'セレスト アロマオイル ウッディ'],
    registeredDaysAgo: 70,
    steps: [
      { daysAgo: 66, to: 'meeting', body: '院長と面談。待合室の印象改善が狙い。' },
      { daysAgo: 12, to: 'quoted', body: '2台構成で見積提出。' },
    ],
    quote: { daysAgo: 12, lines: [['ルミエール ディフューザー', 168000], ['セレスト アロマオイル ウッディ', 72000]] },
  },
  {
    id: 'DL-2026-0007', agencyId: 'AG-02', ownerUserId: 'U-A2-ADM',
    companyName: '株式会社なにわ観光ホテル', facilityName: '道頓堀館',
    phone: '06-6666-1234', website: 'https://naniwa-kanko.example.jp',
    contactPersonName: '購買部 立花様', contactPersonContact: '06-6666-1235',
    productNames: ['ブラン シャンプー', 'ブラン コンディショナー', 'ノワール ボディソープ'],
    registeredDaysAgo: 120,
    steps: [
      { daysAgo: 112, to: 'meeting', body: '客室200室分のアメニティ入替を検討。' },
      { daysAgo: 74, to: 'quoted', body: '3点セットで見積提出。' },
    ],
    quote: { daysAgo: 74, lines: [['ブラン シャンプー', 640000], ['ブラン コンディショナー', 640000], ['ノワール ボディソープ', 520000]] },
    order: { daysAgo: 40, lines: [['ブラン シャンプー', 640000], ['ブラン コンディショナー', 640000], ['ノワール ボディソープ', 520000]] },
  },
  {
    id: 'DL-2026-0008', agencyId: 'AG-02', ownerUserId: 'U-A2-M1',
    companyName: '医療法人 なでしこ会', facilityName: '天王寺リハビリセンター',
    phone: '06-6666-2244', website: 'https://nadeshiko-kai.example.jp',
    productNames: ['ノワール ハンドソープ'],
    registeredDaysAgo: 33,
    steps: [{ daysAgo: 28, to: 'meeting', body: '衛生管理責任者と面談。' }],
  },
  {
    id: 'DL-2026-0009', agencyId: 'AG-03', ownerUserId: 'U-A3-ADM',
    companyName: '株式会社雪見荘', facilityName: '登別本館',
    phone: '0143-88-2200', website: 'https://yukimisou.example.jp',
    contactPersonName: '女将 白石様', contactPersonContact: '0143-88-2201',
    productNames: ['セレスト アロマオイル ウッディ', 'ルミエール ディフューザー'],
    registeredDaysAgo: 95,
    steps: [
      { daysAgo: 90, to: 'meeting', body: '和の香りを希望。ウッディ系で提案。' },
      { daysAgo: 55, to: 'quoted', body: '大浴場前・ロビー向けで見積。' },
    ],
    quote: { daysAgo: 55, lines: [['ルミエール ディフューザー', 168000], ['セレスト アロマオイル ウッディ', 96000]] },
    order: { daysAgo: 21, lines: [['ルミエール ディフューザー', 168000], ['セレスト アロマオイル ウッディ', 96000]] },
  },
  {
    id: 'DL-2026-0010', agencyId: 'AG-03', ownerUserId: 'U-A3-M1',
    companyName: '有限会社みちのく物産', facilityName: '仙台駅前店',
    phone: '022-999-3311', website: 'https://michinoku-bussan.example.jp',
    productNames: ['クラシック ポプリ', 'リュクス ルームスプレー'],
    registeredDaysAgo: 26,
    steps: [{ daysAgo: 24, body: '店頭什器の香り演出を提案中。' }],
  },
  {
    id: 'DL-2026-0011', agencyId: 'AG-04', ownerUserId: 'U-A4-ADM',
    companyName: '株式会社博多ステイ', facilityName: '天神ホテル',
    phone: '092-888-6600', website: 'https://hakata-stay.example.jp',
    contactPersonName: '支配人 大隈様', contactPersonContact: 'okuma@hakata-stay.example.jp',
    productNames: ['ルミエール ディフューザー ラージ', 'セレスト アロマオイル', 'メンテナンスパック(年間)'],
    registeredDaysAgo: 200,
    steps: [
      { daysAgo: 190, to: 'meeting', body: 'ロビー・エレベーターホールへの導入を提案。' },
      { daysAgo: 160, to: 'quoted', body: '見積提出。' },
    ],
    quote: { daysAgo: 160, lines: [['ルミエール ディフューザー ラージ', 320000], ['セレスト アロマオイル', 144000]] },
    order: { daysAgo: 132, lines: [['ルミエール ディフューザー ラージ', 320000], ['セレスト アロマオイル', 144000]] },
    additionalOrders: [
      { daysAgo: 45, lines: [['メンテナンスパック(年間)', 120000]] },
      { daysAgo: 6, lines: [['セレスト アロマオイル', 144000]] },
    ],
  },
  {
    id: 'DL-2026-0012', agencyId: 'AG-04', ownerUserId: 'U-A4-M2',
    companyName: '株式会社ゆふいん癒しの杜', facilityName: '',
    phone: '0977-55-7700', website: 'https://yufuin-iyashi.example.jp',
    productNames: ['セレスト アロマオイル ウッディ'],
    registeredDaysAgo: 15,
    steps: [{ daysAgo: 13, body: '支配人へ初回訪問。次回サンプル持参。' }],
  },
  {
    id: 'DL-2026-0013', agencyId: 'AG-01', ownerUserId: 'U-A1-M2',
    companyName: '株式会社クレアヴィータ', facilityName: '銀座サロン',
    phone: '03-5555-4422', website: 'https://crea-vita.example.jp',
    productNames: ['リュクス ルームスプレー', 'ノワール ハンドソープ', 'セレスト アロマオイル'],
    registeredDaysAgo: 88,
    steps: [
      { daysAgo: 84, to: 'meeting', body: 'サロン全店への横展開を視野に商談。' },
      { daysAgo: 33, to: 'quoted', body: '銀座サロン単店で見積提出。' },
    ],
    quote: { daysAgo: 33, lines: [['リュクス ルームスプレー', 92000], ['ノワール ハンドソープ', 78000], ['セレスト アロマオイル', 72000]] },
  },
  {
    id: 'DL-2026-0014', agencyId: 'AG-02', ownerUserId: 'U-A2-M1',
    companyName: '株式会社堺スポーツクラブ', facilityName: '本店',
    phone: '072-444-1100', website: 'https://sakai-sports.example.jp',
    productNames: ['ノワール ボディソープ', 'ブラン シャンプー'],
    registeredDaysAgo: 58,
    steps: [
      { daysAgo: 52, to: 'meeting', body: 'シャワールームのアメニティ見直し。' },
      { daysAgo: 27, to: 'quoted', body: '2点で見積提出。' },
    ],
    quote: { daysAgo: 27, lines: [['ノワール ボディソープ', 156000], ['ブラン シャンプー', 148000]] },
    order: { daysAgo: 5, lines: [['ノワール ボディソープ', 156000], ['ブラン シャンプー', 148000]] },
  },
  {
    id: 'DL-2026-0015', agencyId: 'AG-03', ownerUserId: 'U-A3-M1',
    companyName: '株式会社函館ベイヒルズ', facilityName: '',
    phone: '0138-22-9900', website: 'https://hakodate-bayhills.example.jp',
    productNames: ['ルミエール ディフューザー'],
    registeredDaysAgo: 4,
    steps: [],
  },
  {
    id: 'DL-2026-0016', agencyId: 'AG-04', ownerUserId: 'U-A4-M2',
    companyName: '株式会社シーサイド長崎', facilityName: '出島本店',
    phone: '095-333-4400', website: 'https://seaside-nagasaki.example.jp',
    productNames: ['ノワール ハンドソープ', 'リュクス ルームスプレー'],
    registeredDaysAgo: 41,
    steps: [{ daysAgo: 37, to: 'meeting', body: '館内3か所への設置を検討。' }],
  },
  {
    id: 'DL-2026-0017', agencyId: 'AG-01', ownerUserId: 'U-A1-ADM',
    companyName: '株式会社アオヤマ不動産', facilityName: '青山モデルルーム',
    phone: '03-5555-6060', website: 'https://aoyama-fudosan.example.jp',
    productNames: ['ルミエール ディフューザー', 'セレスト アロマオイル'],
    registeredDaysAgo: 175,
    steps: [
      { daysAgo: 170, to: 'meeting', body: 'モデルルームの内見体験を強化したい意向。' },
      { daysAgo: 150, to: 'quoted', body: '見積提出。' },
    ],
    quote: { daysAgo: 150, lines: [['ルミエール ディフューザー', 120000], ['セレスト アロマオイル', 72000]] },
  },
  {
    id: 'DL-2026-0018', agencyId: 'AG-02', ownerUserId: 'U-A2-ADM',
    companyName: '株式会社京町家めぐり', facilityName: '祇園別邸',
    phone: '075-111-2233', website: 'https://kyomachiya.example.jp',
    productNames: ['セレスト アロマオイル ウッディ', 'ヴィンテージ キャンドル'],
    registeredDaysAgo: 300,
    steps: [
      { daysAgo: 295, to: 'meeting', body: '町家の雰囲気に合う香りを検討。' },
      { daysAgo: 270, to: 'quoted', body: 'キャンドルを含めて見積。' },
    ],
    quote: { daysAgo: 270, lines: [['セレスト アロマオイル ウッディ', 84000], ['ヴィンテージ キャンドル', 56000]] },
  },
  {
    id: 'DL-2026-0019', agencyId: 'AG-04', ownerUserId: 'U-A4-ADM',
    companyName: '株式会社阿蘇グリーンステイ', facilityName: '',
    phone: '096-777-8811', website: 'https://aso-greenstay.example.jp',
    productNames: ['ルミエール ディフューザー', 'メンテナンスパック(年間)'],
    registeredDaysAgo: 63,
    steps: [
      { daysAgo: 60, to: 'meeting', body: '新築棟のオープンに合わせた導入を検討。' },
      { daysAgo: 30, to: 'quoted', body: '見積提出。オープンは3か月後。' },
    ],
    quote: { daysAgo: 30, lines: [['ルミエール ディフューザー', 192000], ['メンテナンスパック(年間)', 120000]] },
  },
  {
    id: 'DL-2026-0020', agencyId: 'AG-01', ownerUserId: 'U-A1-M1',
    companyName: '株式会社トウキョウベイ物流', facilityName: '有明センター',
    phone: '03-5555-9090', website: 'https://tokyobay-logi.example.jp',
    productNames: ['ノワール ハンドソープ'],
    registeredDaysAgo: 12,
    steps: [{ daysAgo: 10, body: '休憩室向けに提案。決裁は本社。' }],
  },

  // --- 重複審査に関わる案件 --------------------------------------------------
  {
    id: 'DL-2026-0021', agencyId: 'AG-02', ownerUserId: 'U-A2-M1',
    companyName: '東都ホテル', facilityName: '大阪別館',
    phone: '06-6666-1010', website: 'https://toto-hotel.example.jp',
    productNames: ['ブラン シャンプー'],
    registeredDaysAgo: 3,
    steps: [],
    judgement: 'similar', reviewState: 'pending',
  },
  {
    id: 'DL-2026-0022', agencyId: 'AG-03', ownerUserId: 'U-A3-M1',
    companyName: '株式会社ベイサイドリゾート', facilityName: '小樽店',
    phone: '0134-55-6600', website: 'https://bayside-resort.example.jp',
    productNames: ['ルミエール ディフューザー'],
    registeredDaysAgo: 2,
    steps: [],
    judgement: 'similar', reviewState: 'pending',
  },
  {
    id: 'DL-2026-0023', agencyId: 'AG-04', ownerUserId: 'U-A4-M2',
    companyName: '桜井メディカルクリニック', facilityName: '',
    phone: '092-888-1212', website: 'https://sakurai-medical.example.jp',
    productNames: ['リュクス ルームスプレー'],
    registeredDaysAgo: 1,
    steps: [],
    judgement: 'similar', reviewState: 'pending',
  },
  {
    id: 'DL-2026-0024', agencyId: 'AG-01', ownerUserId: 'U-A1-M2',
    companyName: '株式会社ミナトデンタル', facilityName: '川崎医院',
    phone: '044-321-7000', website: 'https://minato-dental.example.jp',
    productNames: ['ルミエール ディフューザー'],
    registeredDaysAgo: 20,
    steps: [{ daysAgo: 16, body: '本部承認後に初回訪問。' }],
    judgement: 'similar', reviewState: 'approved',
  },
  {
    id: 'DL-2026-0025', agencyId: 'AG-03', ownerUserId: 'U-A3-ADM',
    companyName: '東都ホテル', facilityName: '名古屋別館',
    phone: '052-222-3300', website: 'https://toto-hotel.example.jp',
    productNames: ['ノワール ハンドソープ'],
    registeredDaysAgo: 35,
    steps: [],
    judgement: 'similar', reviewState: 'blocked',
    blockedReason: '同一法人を既存代理店が商談中のため、今回の登録は営業不可としました',
  },
  {
    id: 'DL-2026-0026', agencyId: 'AG-04', ownerUserId: 'U-A4-M2',
    companyName: '株式会社なにわ観光ホテル', facilityName: '難波館',
    phone: '06-6666-1299', website: 'https://naniwa-kanko.example.jp',
    productNames: ['ブラン シャンプー'],
    registeredDaysAgo: 9,
    steps: [],
    judgement: 'similar', reviewState: 'returned',
  },
  // 引継ぎ対象(退職者が担当していた案件)
  {
    id: 'DL-2026-0027', agencyId: 'AG-04', ownerUserId: 'U-A4-M1',
    companyName: '株式会社別府ロイヤル', facilityName: '',
    phone: '0977-22-3300', website: 'https://beppu-royal.example.jp',
    productNames: ['ルミエール ディフューザー', 'セレスト アロマオイル'],
    registeredDaysAgo: 50,
    steps: [{ daysAgo: 46, to: 'meeting', body: '大浴場の休憩スペースへの設置を検討。' }],
  },
  {
    id: 'DL-2026-0028', agencyId: 'AG-04', ownerUserId: 'U-A4-M1',
    companyName: '有限会社くまもと商会', facilityName: '',
    phone: '096-555-1122', website: 'https://kumamoto-shokai.example.jp',
    productNames: ['ノワール ハンドソープ'],
    registeredDaysAgo: 29,
    steps: [],
  },
]

// ---------------------------------------------------------------- 申請・審査・通知
function buildDerived(deals: Deal[], reservedList: ReservedCase[]) {
  const applications: Application[] = []
  const reviews: ReviewCase[] = []
  const notifications: Notification[] = []
  const audits: AuditLog[] = []

  const userById = new Map(users.map((u) => [u.id, u]))

  const reviewSeed: {
    dealId: string
    daysAgo: number
    state: Deal['reviewState']
    decision?: 'approve' | 'block' | 'return'
    message?: string
    decidedDaysAgo?: number
    decidedBy?: string
  }[] = [
    { dealId: 'DL-2026-0021', daysAgo: 3, state: 'pending' },
    { dealId: 'DL-2026-0022', daysAgo: 2, state: 'pending' },
    { dealId: 'DL-2026-0023', daysAgo: 1, state: 'pending' },
    {
      dealId: 'DL-2026-0024', daysAgo: 21, state: 'approved', decision: 'approve',
      message: '別医院のため重複にあたりません。営業を進めてください。',
      decidedDaysAgo: 20, decidedBy: 'U-HQ-1',
    },
    {
      dealId: 'DL-2026-0025', daysAgo: 36, state: 'blocked', decision: 'block',
      message:
        '同一法人を既存代理店が商談中です。先方本社の窓口が同じため、今回の登録は営業不可とします。別法人での案件があれば個別に照会してください。',
      decidedDaysAgo: 35, decidedBy: 'U-HQ-2',
    },
    {
      dealId: 'DL-2026-0026', daysAgo: 10, state: 'returned', decision: 'return',
      message: '同一法人の別館です。既存代理店との調整結果を確認したいので、先方の担当部署名を追記して再申請してください。',
      decidedDaysAgo: 9, decidedBy: 'U-HQ-1',
    },
  ]

  for (const rs of reviewSeed) {
    const deal = deals.find((d) => d.id === rs.dealId)
    if (!deal) continue
    const others = deals.filter((d) => d.id !== deal.id)
    const result = judge(
      {
        companyName: deal.companyName,
        facilityName: deal.facilityName,
        phone: deal.phone,
        website: deal.website,
        excludeDealId: deal.id,
      },
      { deals: others, reserved: reservedList },
      S,
    )
    const applicant = userById.get(deal.ownerUserId)
    const appId = `AP-${deal.id.slice(-4)}`
    const application: Application = {
      id: appId,
      kind: 'deal-register',
      applicantUserId: deal.ownerUserId,
      agencyId: deal.agencyId,
      dealId: deal.id,
      input: {
        companyName: deal.companyName,
        facilityName: deal.facilityName,
        phone: deal.phone,
        website: deal.website,
      },
      productNames: deal.lines.map((l) => l.productName),
      judgement: result.judgement,
      topScore: result.topScore,
      reasonText: result.reasonText,
      candidateRefIds: result.candidates.map((c) => c.refId),
      createdAt: stamp(rs.daysAgo, 10),
      reviewState: rs.state,
      decidedAt: rs.decidedDaysAgo !== undefined ? stamp(rs.decidedDaysAgo, 15) : null,
      decidedByUserId: rs.decidedBy ?? null,
      decisionMessage: rs.message ?? '',
      canReapply: rs.decision === 'return',
    }
    applications.push(application)

    reviews.push({
      id: `RV-${deal.id.slice(-4)}`,
      applicationId: appId,
      dealId: deal.id,
      agencyId: deal.agencyId,
      applicantUserId: deal.ownerUserId,
      submittedAt: stamp(rs.daysAgo, 10),
      topScore: result.topScore,
      candidates: result.candidates,
      reasonText: result.reasonText,
      state: rs.state,
      decidedAt: rs.decidedDaysAgo !== undefined ? stamp(rs.decidedDaysAgo, 15) : null,
      decidedByUserId: rs.decidedBy ?? null,
      decision: rs.decision ?? null,
      message: rs.message ?? '',
    })

    if (rs.decision && applicant) {
      notifications.push({
        id: `NT-${deal.id.slice(-4)}`,
        type: 'review-result',
        recipientUserId: applicant.id,
        recipientEmail: applicant.email,
        mailState: 'sent',
        applicationId: appId,
        dealId: deal.id,
        result: rs.decision,
        title:
          rs.decision === 'approve'
            ? '重複審査の結果:承認'
            : rs.decision === 'block'
              ? '重複審査の結果:営業不可'
              : '重複審査の結果:差し戻し',
        message: rs.message ?? '',
        reviewedAt: stamp(rs.decidedDaysAgo ?? rs.daysAgo, 15),
        readAt: rs.decision === 'approve' ? stamp((rs.decidedDaysAgo ?? 0) - 0, 16) : null,
        canReapply: rs.decision === 'return',
      })
      audits.push({
        id: `AU-RV-${deal.id.slice(-4)}`,
        at: stamp(rs.decidedDaysAgo ?? rs.daysAgo, 15),
        actorUserId: rs.decidedBy ?? 'U-HQ-1',
        action:
          rs.decision === 'approve' ? '重複審査:承認' : rs.decision === 'block' ? '重複審査:営業不可' : '重複審査:差し戻し',
        targetType: '案件',
        targetId: deal.id,
        detail: rs.message ?? '',
      })
    }
  }

  // 営業可否照会の申請履歴(案件化していないもの)
  const inquiryApps: Application[] = [
    {
      id: 'AP-EL-001', kind: 'eligibility', applicantUserId: 'U-A1-M1', agencyId: 'AG-01', dealId: null,
      input: { companyName: '株式会社グランドオーシャンホテルズ', facilityName: '', phone: '', website: '' },
      productNames: [], judgement: 'reserved', topScore: 100,
      reasonText: 'Reserved案件と一致しました。本部が営業対象外に指定しているため営業できません。',
      candidateRefIds: ['RS-01'], createdAt: stamp(7, 11), reviewState: 'none',
      decidedAt: null, decidedByUserId: null, decisionMessage: '', canReapply: false,
    },
    {
      id: 'AP-EL-002', kind: 'eligibility', applicantUserId: 'U-A2-M1', agencyId: 'AG-02', dealId: null,
      input: { companyName: '株式会社なんば商事', facilityName: '', phone: '06-6666-0000', website: '' },
      productNames: [], judgement: 'clear', topScore: 0,
      reasonText: '一致・類似する登録は見つかりませんでした。自動承認できます。',
      candidateRefIds: [], createdAt: stamp(5, 13), reviewState: 'none',
      decidedAt: null, decidedByUserId: null, decisionMessage: '', canReapply: false,
    },
    {
      id: 'AP-RS-001', kind: 'deal-register', applicantUserId: 'U-A3-ADM', agencyId: 'AG-03', dealId: null,
      input: {
        companyName: '株式会社アルバフーズ',
        facilityName: '本社ビル',
        phone: '052-222-8800',
        website: 'https://alba-foods.example.jp',
      },
      productNames: ['ノワール ハンドソープ'], judgement: 'reserved', topScore: 100,
      reasonText: 'Reserved案件と一致しました。本部が営業対象外に指定しているため営業できません。',
      candidateRefIds: ['RS-03'], createdAt: stamp(28, 14), reviewState: 'none',
      decidedAt: null, decidedByUserId: null, decisionMessage: '', canReapply: false,
    },
    {
      id: 'AP-EL-003', kind: 'eligibility', applicantUserId: 'U-A3-M1', agencyId: 'AG-03', dealId: null,
      input: { companyName: '株式会社ベイサイドリゾート', facilityName: '小樽店', phone: '', website: '' },
      productNames: [], judgement: 'similar', topScore: 62,
      reasonText: '法人格などを除いた企業名が既存の登録と完全に一致しました。スコアに関係なく重複審査へ回します。',
      candidateRefIds: ['DL-2026-0002'], createdAt: stamp(2, 9), reviewState: 'none',
      decidedAt: null, decidedByUserId: null, decisionMessage: '', canReapply: false,
    },
  ]
  applications.push(...inquiryApps)

  audits.push(
    {
      id: 'AU-000', at: stamp(28, 14), actorUserId: 'U-A3-ADM', action: '営業予定登録',
      targetType: '案件', targetId: 'AP-RS-001',
      detail: '株式会社アルバフーズ 本社ビル / 判定: reserved(Reserved案件のため案件は作成せず)',
    },
    {
      id: 'AU-001', at: stamp(35, 9), actorUserId: 'U-HQ-1', action: 'Reserved案件を登録',
      targetType: 'Reserved案件', targetId: 'RS-03', detail: '株式会社アルバフーズ 本社ビル',
    },
    {
      id: 'AU-002', at: stamp(90, 14), actorUserId: 'U-HQ-2', action: '商品マスターを更新',
      targetType: '商品', targetId: 'PR-11', detail: 'クラシック ポプリ を販売停止へ変更',
    },
    {
      id: 'AU-003', at: stamp(30, 10), actorUserId: 'U-HQ-1', action: '基本設定を変更',
      targetType: '基本設定', targetId: 'settings', detail: '保護期限の警告日数を30日に設定',
    },
    {
      id: 'AU-004', at: stamp(64, 14), actorUserId: 'U-A1-ADM', action: '担当案件を引継ぎ',
      targetType: '代理店ユーザー', targetId: 'U-A1-M3', detail: '桑野 里佳 → 芝田 直人(1件)',
    },
  )

  return { applications, reviews, notifications, audits }
}

// ---------------------------------------------------------------- 生成
export function buildSeed(): DB {
  const deals = dealSpecs.map(buildDeal)
  const { applications, reviews, notifications, audits } = buildDerived(deals, reservedCases)

  // 実行済みとして記録する引継ぎは、案件側の担当営業・変更履歴と必ず一致させる。
  // 桑野 里佳(休職中)の担当案件を、休職に入るときに芝田へ移した記録。
  const HANDOVER_DEAL_ID = 'DL-2026-0017'
  const handovers: HandoverLog[] = [
    {
      id: 'HO-001', agencyId: 'AG-01', fromUserId: 'U-A1-M3', toUserId: 'U-A1-ADM',
      actorUserId: 'U-A1-ADM', at: stamp(64, 14), dealIds: [HANDOVER_DEAL_ID], mode: 'single',
    },
  ]
  const handoverDeal = deals.find((d) => d.id === HANDOVER_DEAL_ID)
  if (handoverDeal) {
    handoverDeal.changes.push({
      id: newId('CH'),
      at: stamp(64, 14),
      actorUserId: 'U-A1-ADM',
      field: '担当営業(引継ぎ)',
      before: '桑野 里佳',
      after: '芝田 直人',
      note: '休職にともなう引継ぎ',
    })
  }

  const extensions: ExtensionRequest[] = [
    {
      id: 'EX-001', dealId: 'DL-2026-0013', agencyId: 'AG-01', requestedByUserId: 'U-A1-M2',
      requestedDays: 30, reason: '先方の予算確定が翌四半期にずれ込むため、保護期間の延長を希望します。',
      state: 'pending', createdAt: stamp(2, 11), decidedAt: null, decidedByUserId: null, message: '',
    },
    {
      id: 'EX-002', dealId: 'DL-2026-0017', agencyId: 'AG-01', requestedByUserId: 'U-A1-ADM',
      requestedDays: 60, reason: 'モデルルームの改装完了待ち。再提案の日程は確保済みです。',
      state: 'pending', createdAt: stamp(1, 15), decidedAt: null, decidedByUserId: null, message: '',
    },
    {
      id: 'EX-003', dealId: 'DL-2026-0019', agencyId: 'AG-04', requestedByUserId: 'U-A4-ADM',
      requestedDays: 30, reason: '新築棟のオープン延期にともなう延長。',
      state: 'approved', createdAt: stamp(20, 10), decidedAt: stamp(19, 11), decidedByUserId: 'U-HQ-2',
      message: 'オープン予定日の資料を確認しました。30日延長します。',
    },
  ]

  // 承認済みの延長申請は、案件の保護期限にも反映しておく(記録と実データを一致させる)
  const extendedIndex = deals.findIndex((d) => d.id === 'DL-2026-0019')
  if (extendedIndex >= 0) {
    const target = deals[extendedIndex] as Deal
    deals[extendedIndex] = extendProtection(target, 30, 'U-HQ-2', stamp(19, 11))
  }

  const inquiries: Inquiry[] = [
    {
      id: 'IQ-001', fromUserId: 'U-A2-M1', agencyId: 'AG-02',
      subject: '重複審査の判断基準について',
      body: '同じ法人でも施設が違う場合、どこまでを別案件として登録してよいか教えてください。',
      state: 'answered', createdAt: stamp(6, 10),
      replies: [
        {
          id: 'IR-001', at: stamp(5, 14), authorUserId: 'U-HQ-1',
          body: '施設名まで一致する場合は重複として扱います。別施設であれば登録は可能ですが、企業名が一致するため重複審査には入ります。',
        },
      ],
    },
    {
      id: 'IQ-002', fromUserId: 'U-A3-M1', agencyId: 'AG-03',
      subject: '停止中商品の見積について',
      body: '過去に提案したクラシック ポプリを追加受注できますか。',
      state: 'open', createdAt: stamp(1, 9), replies: [],
    },
  ]

  return {
    schemaVersion: SCHEMA_VERSION,
    agencies,
    users,
    products,
    deals,
    reserved: reservedCases,
    applications,
    reviews,
    notifications,
    extensions,
    inquiries,
    handovers,
    audits,
    settings: { ...DEFAULT_SETTINGS },
    seededAt: new Date().toISOString(),
  }
}
