import { beforeAll, describe, expect, it } from 'vitest'
import { addDays, setClock } from '../../src/domain/dates'
import {
  DEFAULT_SETTINGS,
  calcAdditionalOrderProtection,
  calcProtection,
  isActiveOrder,
  protectionDaysFor,
  protectionState,
  remainingDays,
} from '../../src/domain/protection'
import { TODAY, orderedDeal, settings } from './_factories'

beforeAll(() => setClock(TODAY))

describe('§10.1 基本設定の初期値', () => {
  it('日数単位で統一されている', () => {
    expect(DEFAULT_SETTINGS.plannedDays).toBe(30)
    expect(DEFAULT_SETTINGS.meetingDays).toBe(90)
    expect(DEFAULT_SETTINGS.quotedDays).toBe(90)
    expect(DEFAULT_SETTINGS.orderDays).toBe(365)
    expect(DEFAULT_SETTINGS.additionalOrderDays).toBe(365)
  })

  it('ステータスごとの日数を引ける', () => {
    const s = settings()
    expect(protectionDaysFor('planned', s)).toBe(30)
    expect(protectionDaysFor('meeting', s)).toBe(90)
    expect(protectionDaysFor('quoted', s)).toBe(90)
    expect(protectionDaysFor('ordered', s)).toBe(365)
  })
})

describe('§10.2 営業予定登録', () => {
  it('変更日を保護開始日とし、30日後を期限にする', () => {
    const p = calcProtection({
      status: 'planned',
      changeDate: TODAY,
      currentExpiresAt: null,
      currentStartAt: null,
      settings: settings(),
    })
    expect(p.startAt).toBe(TODAY)
    expect(p.expiresAt).toBe(addDays(TODAY, 30))
    expect(p.days).toBe(30)
  })
})

describe('§10.3 / §10.4 商談・見積提出', () => {
  it('変更日から日数を足す', () => {
    const p = calcProtection({
      status: 'meeting',
      changeDate: TODAY,
      currentExpiresAt: addDays(TODAY, 5),
      currentStartAt: addDays(TODAY, -25),
      settings: settings(),
    })
    expect(p.expiresAt).toBe(addDays(TODAY, 90))
    expect(p.keptLonger).toBe(false)
  })

  it('既存期限の方が長い場合は短縮しない', () => {
    const longer = addDays(TODAY, 200)
    const p = calcProtection({
      status: 'meeting',
      changeDate: TODAY,
      currentExpiresAt: longer,
      currentStartAt: addDays(TODAY, -10),
      settings: settings(),
    })
    expect(p.expiresAt).toBe(longer)
    expect(p.keptLonger).toBe(true)
  })

  it('見積提出でも短縮しない', () => {
    const longer = addDays(TODAY, 120)
    const p = calcProtection({
      status: 'quoted',
      changeDate: TODAY,
      currentExpiresAt: longer,
      currentStartAt: addDays(TODAY, -10),
      settings: settings(),
    })
    expect(p.expiresAt).toBe(longer)
  })

  it('保護開始日は既存のものを引き継ぐ', () => {
    const start = addDays(TODAY, -25)
    const p = calcProtection({
      status: 'quoted',
      changeDate: TODAY,
      currentExpiresAt: addDays(TODAY, 5),
      currentStartAt: start,
      settings: settings(),
    })
    expect(p.startAt).toBe(start)
  })
})

describe('§10.5 受注・追加受注', () => {
  it('受注日を保護開始日とし、365日後を期限にする', () => {
    const orderDate = addDays(TODAY, -10)
    const p = calcProtection({
      status: 'ordered',
      changeDate: orderDate,
      currentExpiresAt: addDays(TODAY, 80),
      currentStartAt: addDays(TODAY, -100),
      settings: settings(),
    })
    expect(p.startAt).toBe(orderDate)
    expect(p.expiresAt).toBe(addDays(orderDate, 365))
  })

  it('追加受注も受注日から数え直す', () => {
    const orderDate = addDays(TODAY, -3)
    const p = calcAdditionalOrderProtection(orderDate, settings())
    expect(p.startAt).toBe(orderDate)
    expect(p.expiresAt).toBe(addDays(orderDate, 365))
  })

  it('設定を変えれば日数も変わる', () => {
    const p = calcAdditionalOrderProtection(TODAY, settings({ additionalOrderDays: 180 }))
    expect(p.expiresAt).toBe(addDays(TODAY, 180))
  })
})

describe('§10.6 残り日数', () => {
  it('保護期限 - 現在日 で毎回算出する', () => {
    expect(remainingDays(addDays(TODAY, 30))).toBe(30)
    expect(remainingDays(TODAY)).toBe(0)
    expect(remainingDays(addDays(TODAY, -5))).toBe(-5)
  })

  it('警告日数以内は warning、過ぎていれば expired', () => {
    const s = settings({ warningDays: 30 })
    expect(protectionState(addDays(TODAY, 100), s)).toBe('active')
    expect(protectionState(addDays(TODAY, 30), s)).toBe('warning')
    expect(protectionState(addDays(TODAY, 1), s)).toBe('warning')
    expect(protectionState(addDays(TODAY, -1), s)).toBe('expired')
  })
})

describe('有効な受注案件の判定', () => {
  it('保護期限内の受注案件だけが有効', () => {
    expect(isActiveOrder(orderedDeal('A', 'X社', { expiresAt: addDays(TODAY, 1) }))).toBe(true)
    expect(isActiveOrder(orderedDeal('B', 'X社', { expiresAt: TODAY }))).toBe(true)
    expect(isActiveOrder(orderedDeal('C', 'X社', { expiresAt: addDays(TODAY, -1) }))).toBe(false)
  })

  it('営業不可になった受注案件は有効扱いしない', () => {
    const d = orderedDeal('D', 'X社', { expiresAt: addDays(TODAY, 100) })
    expect(isActiveOrder({ ...d, reviewState: 'blocked' })).toBe(false)
  })
})
