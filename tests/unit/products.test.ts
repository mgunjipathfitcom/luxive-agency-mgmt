import { describe, expect, it } from 'vitest'
import {
  activeProductNames,
  meaningfulLines,
  mergeLines,
  sumOrder,
  sumQuote,
  validateImageFile,
} from '../../src/domain/products'
import { formatYen, parseAmount } from '../../src/domain/format'
import type { Product } from '../../src/domain/types'

function product(name: string, salesStatus: Product['salesStatus']): Product {
  return {
    id: name,
    sku: name,
    brand: 'Luxive',
    category: 'テスト',
    name,
    scent: '',
    size: '',
    description: '',
    imageDataUrl: null,
    salesStatus,
    note: '',
    createdAt: '',
    updatedAt: '',
  }
}

describe('§7.2 販売中商品の取得', () => {
  const products = [
    product('ルミエール ディフューザー', 'active'),
    product('セレスト アロマオイル', 'active'),
    product('クラシック ポプリ', 'suspended'),
    product('ルミエール ディフューザー', 'active'), // 同名の重複
  ]

  it('販売中だけを商品名で一意化して返す', () => {
    const names = activeProductNames(products)
    expect(names).toContain('ルミエール ディフューザー')
    expect(names).toContain('セレスト アロマオイル')
    expect(names).not.toContain('クラシック ポプリ')
    expect(names.filter((n) => n === 'ルミエール ディフューザー')).toHaveLength(1)
  })

  it('販売中商品を追加するとそのまま増える(§7.3)', () => {
    const next = [...products, product('新商品スプレー', 'active')]
    expect(activeProductNames(next)).toContain('新商品スプレー')
  })
})

describe('§7.4 過去商品とのマージ', () => {
  const saved = [
    { productName: 'クラシック ポプリ', proposed: true, quoteAmount: 60000, orderAmount: 60000 },
    { productName: 'ルミエール ディフューザー', proposed: true, quoteAmount: 240000, orderAmount: null },
  ]
  const active = ['ルミエール ディフューザー', 'セレスト アロマオイル']

  it('停止商品でも保存済みの行は残す', () => {
    const merged = mergeLines(saved, active)
    const popuri = merged.find((l) => l.productName === 'クラシック ポプリ')
    expect(popuri).toBeDefined()
    expect(popuri?.quoteAmount).toBe(60000)
  })

  it('販売中の新商品は空の行として足される', () => {
    const merged = mergeLines(saved, active)
    const celeste = merged.find((l) => l.productName === 'セレスト アロマオイル')
    expect(celeste).toEqual({
      productName: 'セレスト アロマオイル',
      proposed: false,
      quoteAmount: null,
      orderAmount: null,
    })
  })

  it('保存済みの行が先、その後に新しい商品が並ぶ', () => {
    const merged = mergeLines(saved, active)
    expect(merged.map((l) => l.productName)).toEqual([
      'クラシック ポプリ',
      'ルミエール ディフューザー',
      'セレスト アロマオイル',
    ])
  })

  it('保存対象は提案対象か金額の入った行だけ', () => {
    const merged = mergeLines(saved, active)
    expect(meaningfulLines(merged).map((l) => l.productName)).toEqual([
      'クラシック ポプリ',
      'ルミエール ディフューザー',
    ])
  })

  it('合計は空欄を0として足す', () => {
    const merged = mergeLines(saved, active)
    expect(sumQuote(merged)).toBe(300000)
    expect(sumOrder(merged)).toBe(60000)
  })
})

describe('§12.2 金額入力', () => {
  it('空欄はnull、0は0として扱う', () => {
    expect(parseAmount('')).toEqual({ value: null, error: null })
    expect(parseAmount('   ')).toEqual({ value: null, error: null })
    expect(parseAmount('0')).toEqual({ value: 0, error: null })
  })

  it('負数を禁止する', () => {
    expect(parseAmount('-100').error).toBeTruthy()
  })

  it('数字以外を拒否する', () => {
    expect(parseAmount('abc').error).toBeTruthy()
    expect(parseAmount('１２３４').error).toBeTruthy()
    expect(parseAmount('1000円').error).toBeTruthy()
  })

  it('3桁区切りのカンマ入りは受け付ける', () => {
    expect(parseAmount('1,200,000')).toEqual({ value: 1200000, error: null })
  })

  it('保存済み表示は3桁区切り、空欄はダッシュ', () => {
    expect(formatYen(1200000)).toBe('1,200,000円')
    expect(formatYen(0)).toBe('0円')
    expect(formatYen(null)).toBe('—')
  })
})

describe('§7.5 商品画像', () => {
  it('JPG・PNG・WebPだけ許可する', () => {
    expect(validateImageFile({ type: 'image/jpeg', size: 1000 })).toBeNull()
    expect(validateImageFile({ type: 'image/png', size: 1000 })).toBeNull()
    expect(validateImageFile({ type: 'image/webp', size: 1000 })).toBeNull()
    expect(validateImageFile({ type: 'image/gif', size: 1000 })).toBeTruthy()
    expect(validateImageFile({ type: 'application/pdf', size: 1000 })).toBeTruthy()
  })

  it('容量を超えたら拒否する', () => {
    expect(validateImageFile({ type: 'image/png', size: 3 * 1024 * 1024 })).toBeTruthy()
  })
})
