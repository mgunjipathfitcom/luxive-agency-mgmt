import { beforeAll, describe, expect, it } from 'vitest'
import { addDays, setClock } from '../../src/domain/dates'
import { judge, scoreCandidate, normalizeFields } from '../../src/domain/duplicate'
import { TODAY, deal, legacySettings, orderedDeal, reserved, settings } from './_factories'

beforeAll(() => setClock(TODAY))

const emptyDb = { deals: [], reserved: [] }

describe('§4.2 判定優先順位', () => {
  it('Reserved案件に一致したら reserved', () => {
    const db = {
      deals: [],
      reserved: [reserved({ id: 'RS-1', companyName: '株式会社グランドオーシャンホテルズ' })],
    }
    const r = judge(
      { companyName: 'グランドオーシャンホテルズ', facilityName: '', phone: '', website: '' },
      db,
      settings(),
    )
    expect(r.judgement).toBe('reserved')
    expect(r.reasonCode).toBe('reserved-hit')
  })

  it('解除されたReserved案件は判定に効かない', () => {
    const db = {
      deals: [],
      reserved: [reserved({ id: 'RS-1', companyName: '株式会社テスト', active: false })],
    }
    const r = judge({ companyName: '株式会社テスト', facilityName: '', phone: '', website: '' }, db, settings())
    expect(r.judgement).toBe('clear')
  })

  it('保護期限内の受注案件に一致したら ordered', () => {
    const db = {
      deals: [orderedDeal('DL-1', '株式会社ベイサイドリゾート', { expiresAt: addDays(TODAY, 300) })],
      reserved: [],
    }
    const r = judge(
      { companyName: 'ベイサイドリゾート', facilityName: '', phone: '', website: '' },
      db,
      settings(),
    )
    expect(r.judgement).toBe('ordered')
    expect(r.reasonCode).toBe('active-order-hit')
  })

  it('Reserved案件は受注案件より優先する', () => {
    const db = {
      deals: [orderedDeal('DL-1', '株式会社テスト', { expiresAt: addDays(TODAY, 300) })],
      reserved: [reserved({ id: 'RS-1', companyName: '株式会社テスト' })],
    }
    const r = judge({ companyName: '株式会社テスト', facilityName: '', phone: '', website: '' }, db, settings())
    expect(r.judgement).toBe('reserved')
  })

  it('一致も類似もなければ clear', () => {
    const r = judge(
      { companyName: '株式会社まったく新しい会社', facilityName: '', phone: '', website: '' },
      emptyDb,
      settings(),
    )
    expect(r.judgement).toBe('clear')
    expect(r.candidates).toHaveLength(0)
  })
})

describe('§4.4 正規化企業名の完全一致はスコア判定より優先する', () => {
  const db = {
    deals: [deal({ id: 'DL-1', companyName: '東都ホテル株式会社', facilityName: '本館' })],
    reserved: [],
  }

  it('東都ホテル株式会社と東都ホテルは、電話・Web空欄でも similar', () => {
    const r = judge({ companyName: '東都ホテル', facilityName: '', phone: '', website: '' }, db, settings())
    expect(r.judgement).toBe('similar')
    expect(r.reasonCode).toBe('company-name-exact')
  })

  it('旧設定(company weight 40 / threshold 50)でも完全一致は similar', () => {
    const s = legacySettings()
    const r = judge({ companyName: '東都ホテル', facilityName: '', phone: '', website: '' }, db, s)
    expect(r.judgement).toBe('similar')
    expect(r.reasonCode).toBe('company-name-exact')
    // スコア単体では閾値に届かないことも確認する
    expect(r.topScore).toBeLessThan(s.duplicateThreshold)
  })

  it('ウェイトを0にしても完全一致は similar のまま', () => {
    const s = settings({ weightCompanyName: 0, duplicateThreshold: 99 })
    const r = judge({ companyName: '東都ホテル', facilityName: '', phone: '', website: '' }, db, s)
    expect(r.judgement).toBe('similar')
    // スコアが0でも、比較画面へ渡す候補から落とさない(§14.1)
    expect(r.candidates.map((c) => c.refId)).toContain('DL-1')
    expect(r.reasonCode).toBe('company-name-exact')
  })

  it('連絡先の完全一致で拾った候補も、スコアが低くても比較画面に残る', () => {
    const contactDb = {
      deals: [deal({ id: 'DL-PHONE', companyName: '甲社', phone: '03-1111-2222' })],
      reserved: [],
    }
    const r = judge(
      { companyName: '乙商店', facilityName: '', phone: '03-1111-2222', website: '' },
      contactDb,
      settings(),
    )
    expect(r.judgement).toBe('similar')
    expect(r.candidates.map((c) => c.refId)).toContain('DL-PHONE')
  })

  it('全角・法人格違いの3表記はすべて同じ企業として similar', () => {
    const luxiveDb = { deals: [deal({ id: 'DL-9', companyName: '株式会社Luxive' })], reserved: [] }
    for (const name of ['Luxive', 'Ｌｕｘｉｖｅ（株）', '㈱Luxive']) {
      const r = judge({ companyName: name, facilityName: '', phone: '', website: '' }, luxiveDb, settings())
      expect(r.judgement, name).toBe('similar')
    }
  })
})

describe('§4.5 保護期限切れの扱い', () => {
  it('保護期限切れの通常案件でも、企業名が一致すれば similar', () => {
    const db = {
      deals: [
        deal({
          id: 'DL-EXP',
          companyName: '桜井メディカルクリニック',
          protectionStartAt: addDays(TODAY, -200),
          protectionExpiresAt: addDays(TODAY, -170),
        }),
      ],
      reserved: [],
    }
    const r = judge(
      { companyName: '桜井メディカルクリニック', facilityName: '', phone: '', website: '' },
      db,
      settings(),
    )
    expect(r.judgement).toBe('similar')
    expect(r.candidates[0]?.protectionState).toBe('expired')
  })

  it('保護期限切れの受注案件は ordered にせず similar にする', () => {
    const db = {
      deals: [orderedDeal('DL-OLD', '株式会社ノースウィング', { expiresAt: addDays(TODAY, -35) })],
      reserved: [],
    }
    const r = judge(
      { companyName: '株式会社ノースウィング', facilityName: '', phone: '', website: '' },
      db,
      settings(),
    )
    expect(r.judgement).toBe('similar')
    expect(r.judgement).not.toBe('ordered')
    expect(r.candidates[0]?.protectionState).toBe('expired')
  })

  it('有効保護中と保護期限切れを候補上で区別する', () => {
    const db = {
      deals: [
        deal({ id: 'DL-A', companyName: '同名商事', protectionExpiresAt: addDays(TODAY, 10) }),
        deal({
          id: 'DL-B',
          companyName: '同名商事',
          protectionStartAt: addDays(TODAY, -100),
          protectionExpiresAt: addDays(TODAY, -1),
        }),
      ],
      reserved: [],
    }
    const r = judge({ companyName: '同名商事', facilityName: '', phone: '', website: '' }, db, settings())
    const states = r.candidates.map((c) => c.protectionState).sort()
    expect(states).toEqual(['active', 'expired'])
  })
})

describe('§4.6 重複可能性スコア', () => {
  it('企業名・電話・ドメインがすべて一致すると高スコアになる', () => {
    const a = normalizeFields({
      companyName: '東都ホテル',
      facilityName: '本館',
      phone: '03-5555-1010',
      website: 'https://www.toto-hotel.example.jp/',
    })
    const b = normalizeFields({
      companyName: '東都ホテル株式会社',
      facilityName: '本館',
      phone: '0355551010',
      website: 'toto-hotel.example.jp',
    })
    expect(scoreCandidate(a, b, settings()).score).toBe(100)
  })

  it('共通の親ドメインを持つだけの別会社には加点しない', () => {
    const a = normalizeFields({ companyName: 'A社', facilityName: '', phone: '', website: 'a-corp.example.jp' })
    const b = normalizeFields({ companyName: 'B社', facilityName: '', phone: '', website: 'b-corp.example.jp' })
    const sb = scoreCandidate(a, b, settings())
    expect(sb.matched).not.toContain('Webドメイン')
    expect(sb.score).toBeLessThan(25)
  })

  it('サブドメイン関係のときだけ部分点を出す', () => {
    const a = normalizeFields({ companyName: 'A社', facilityName: '', phone: '', website: 'shop.a-corp.example.jp' })
    const b = normalizeFields({ companyName: 'A社', facilityName: '', phone: '', website: 'a-corp.example.jp' })
    const sb = scoreCandidate(a, b, settings())
    expect(sb.score).toBeGreaterThan(settings().weightCompanyName)
  })

  it('一致項目・不一致項目を返す', () => {
    const a = normalizeFields({ companyName: '東都ホテル', facilityName: '本館', phone: '03-5555-1010', website: '' })
    const b = normalizeFields({ companyName: '東都ホテル', facilityName: '別館', phone: '03-5555-1010', website: '' })
    const sb = scoreCandidate(a, b, settings())
    expect(sb.matched).toContain('企業名')
    expect(sb.matched).toContain('電話番号')
    expect(sb.unmatched).toContain('施設名')
  })
})

describe('連絡先の完全一致(設定でON/OFF)', () => {
  const db = {
    deals: [deal({ id: 'DL-1', companyName: '甲社', phone: '03-1111-2222', website: 'kou.example.jp' })],
    reserved: [],
  }

  it('企業名が違っても電話番号が一致すれば similar(既定)', () => {
    const r = judge(
      { companyName: '乙商店', facilityName: '', phone: '03-1111-2222', website: '' },
      db,
      settings(),
    )
    expect(r.judgement).toBe('similar')
    expect(r.reasonCode).toBe('contact-exact')
  })

  it('設定をOFFにするとスコア判定へ落ちる', () => {
    const r = judge(
      { companyName: '乙商店', facilityName: '', phone: '03-1111-2222', website: '' },
      db,
      settings({ forceContactExactSimilar: false }),
    )
    expect(r.judgement).toBe('clear')
  })
})

describe('施設単位の扱い', () => {
  it('Reserved案件に施設名が指定されている場合、別施設は即時停止にしない', () => {
    const db = {
      deals: [],
      reserved: [reserved({ id: 'RS-1', companyName: '株式会社アルバフーズ', facilityName: '本社ビル' })],
    }
    const r = judge(
      { companyName: '株式会社アルバフーズ', facilityName: '名古屋工場', phone: '', website: '' },
      db,
      settings(),
    )
    expect(r.judgement).toBe('similar')
  })

  it('同じ施設なら reserved で止まる', () => {
    const db = {
      deals: [],
      reserved: [reserved({ id: 'RS-1', companyName: '株式会社アルバフーズ', facilityName: '本社ビル' })],
    }
    const r = judge(
      { companyName: '株式会社アルバフーズ', facilityName: '本社ビル', phone: '', website: '' },
      db,
      settings(),
    )
    expect(r.judgement).toBe('reserved')
  })

  it('有効受注案件でも施設が違えば即時停止にしない', () => {
    const db = {
      deals: [
        orderedDeal('DL-1', '株式会社ベイサイドリゾート', {
          expiresAt: addDays(TODAY, 300),
          facilityName: 'みなとみらい店',
        }),
      ],
      reserved: [],
    }
    const r = judge(
      { companyName: '株式会社ベイサイドリゾート', facilityName: '小樽店', phone: '', website: '' },
      db,
      settings(),
    )
    expect(r.judgement).toBe('similar')
  })
})

describe('判定対象の除外', () => {
  it('営業不可になった案件は候補に含めない', () => {
    const db = {
      deals: [deal({ id: 'DL-BLOCK', companyName: '止まった会社', reviewState: 'blocked' })],
      reserved: [],
    }
    const r = judge({ companyName: '止まった会社', facilityName: '', phone: '', website: '' }, db, settings())
    expect(r.judgement).toBe('clear')
  })

  it('excludeDealId で自分自身を除外できる', () => {
    const db = { deals: [deal({ id: 'DL-SELF', companyName: '自分の会社' })], reserved: [] }
    const r = judge(
      { companyName: '自分の会社', facilityName: '', phone: '', website: '', excludeDealId: 'DL-SELF' },
      db,
      settings(),
    )
    expect(r.judgement).toBe('clear')
  })
})

describe('§4.1 共通判定関数', () => {
  it('照会でclearでも、編集後の値では別の判定になりうる', () => {
    const db = {
      deals: [deal({ id: 'DL-1', companyName: '東都ホテル株式会社', facilityName: '本館' })],
      reserved: [],
    }
    const first = judge({ companyName: '新しい会社', facilityName: '', phone: '', website: '' }, db, settings())
    expect(first.judgement).toBe('clear')
    const second = judge({ companyName: '東都ホテル', facilityName: '', phone: '', website: '' }, db, settings())
    expect(second.judgement).toBe('similar')
  })
})
