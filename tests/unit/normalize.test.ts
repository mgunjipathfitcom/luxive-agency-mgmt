import { describe, expect, it } from 'vitest'
import {
  isValidPhone,
  isValidWebsite,
  normalizeCompanyName,
  normalizeDomain,
  normalizeFacilityName,
  normalizePhone,
  registrableDomain,
  similarity,
} from '../../src/domain/normalize'

describe('企業名の正規化(§3.4)', () => {
  it('法人格の有無・全角半角・記号の違いを吸収する', () => {
    const expected = normalizeCompanyName('Luxive')
    expect(normalizeCompanyName('株式会社Luxive')).toBe(expected)
    expect(normalizeCompanyName('Ｌｕｘｉｖｅ（株）')).toBe(expected)
    expect(normalizeCompanyName('㈱Luxive')).toBe(expected)
    expect(normalizeCompanyName('  LUXIVE  ')).toBe(expected)
    expect(normalizeCompanyName('Luxive Co., Ltd.')).toBe(expected)
  })

  it('東都ホテル株式会社と東都ホテルは同じ正規化値になる', () => {
    expect(normalizeCompanyName('東都ホテル株式会社')).toBe(normalizeCompanyName('東都ホテル'))
  })

  it('主要な法人格をすべて落とす', () => {
    for (const form of ['株式会社', '有限会社', '合同会社', '医療法人', '社団法人', '財団法人', '一般社団法人']) {
      expect(normalizeCompanyName(`${form}サンプル`)).toBe('サンプル')
      expect(normalizeCompanyName(`サンプル${form}`)).toBe('サンプル')
    }
  })

  it('英語の法人格は語境界があるときだけ落とす', () => {
    expect(normalizeCompanyName('Sample Inc.')).toBe('sample')
    // zinc の inc を落として "z" にしてはいけない
    expect(normalizeCompanyName('Zinc')).toBe('zinc')
    expect(normalizeCompanyName('Incentive Works')).toBe('incentiveworks')
  })

  it('空文字はそのまま空になる', () => {
    expect(normalizeCompanyName('')).toBe('')
    expect(normalizeCompanyName('   ')).toBe('')
  })

  it('別会社は別の正規化値になる', () => {
    expect(normalizeCompanyName('東都ホテル')).not.toBe(normalizeCompanyName('西都ホテル'))
  })
})

describe('施設名の正規化', () => {
  it('全角半角と記号を吸収する', () => {
    expect(normalizeFacilityName('本 館')).toBe(normalizeFacilityName('本館'))
    expect(normalizeFacilityName('ＭＭ店')).toBe(normalizeFacilityName('mm店'))
  })
  it('法人格は落とさない', () => {
    expect(normalizeFacilityName('株式会社ビル')).toBe('株式会社ビル')
  })
})

describe('電話番号の正規化(§3.4)', () => {
  it('ハイフン・空白・括弧を吸収する', () => {
    expect(normalizePhone('03-5555-1010')).toBe('0355551010')
    expect(normalizePhone('03 5555 1010')).toBe('0355551010')
    expect(normalizePhone('(03)5555-1010')).toBe('0355551010')
    expect(normalizePhone('０３－５５５５－１０１０')).toBe('0355551010')
  })

  it('国際表記を国内形式へ寄せる', () => {
    expect(normalizePhone('+81-3-5555-1010')).toBe('0355551010')
    expect(normalizePhone('+81 (0) 3 5555 1010')).toBe('0355551010')
    expect(normalizePhone('008135555 1010')).toBe('0355551010')
    expect(normalizePhone('81355551010')).toBe('0355551010')
  })

  it('内線表記より後ろを落とす', () => {
    expect(normalizePhone('03-5555-1010 内線123')).toBe('0355551010')
    expect(normalizePhone('03-5555-1010 ext.45')).toBe('0355551010')
    expect(normalizePhone('03-5555-1010 #45')).toBe('0355551010')
  })

  it('妥当性は10桁または11桁で判定する', () => {
    expect(isValidPhone('03-5555-1010')).toBe(true)
    expect(isValidPhone('090-1234-5678')).toBe(true)
    expect(isValidPhone('12345')).toBe(false)
    expect(isValidPhone('')).toBe(false)
  })
})

describe('Webサイトの正規化(§3.4)', () => {
  it('scheme・www・パス・末尾スラッシュ/ドットを吸収する', () => {
    const d = 'toto-hotel.example.jp'
    expect(normalizeDomain('https://www.toto-hotel.example.jp/')).toBe(d)
    expect(normalizeDomain('http://TOTO-HOTEL.example.jp')).toBe(d)
    expect(normalizeDomain('toto-hotel.example.jp.')).toBe(d)
    expect(normalizeDomain('https://www.toto-hotel.example.jp/company/about?a=1#x')).toBe(d)
    expect(normalizeDomain('https://toto-hotel.example.jp:8443/')).toBe(d)
  })

  it('単一ラベルや不正なホスト名は有効なドメインとして扱わない', () => {
    expect(normalizeDomain('localhost')).toBeNull()
    expect(normalizeDomain('http://intranet')).toBeNull()
    expect(normalizeDomain('例: なし')).toBeNull()
    expect(normalizeDomain('...')).toBeNull()
    expect(normalizeDomain('a..b.jp')).toBeNull()
    expect(normalizeDomain('-bad.example.jp')).toBeNull()
    expect(normalizeDomain('example.1')).toBeNull()
    expect(normalizeDomain('')).toBeNull()
    expect(isValidWebsite('なし')).toBe(false)
  })

  it('登録可能ドメインを推定する', () => {
    expect(registrableDomain('shop.example.co.jp')).toBe('example.co.jp')
    expect(registrableDomain('example.co.jp')).toBe('example.co.jp')
    expect(registrableDomain('a.b.example.com')).toBe('example.com')
  })
})

describe('類似度', () => {
  it('完全一致は1、無関係は低い', () => {
    expect(similarity('abcd', 'abcd')).toBe(1)
    expect(similarity('abcd', 'wxyz')).toBe(0)
    expect(similarity('', 'abcd')).toBe(0)
  })
  it('部分一致は0と1のあいだ', () => {
    const s = similarity('東都ホテル', 'なにわ観光ホテル')
    expect(s).toBeGreaterThan(0)
    expect(s).toBeLessThan(1)
  })
})
