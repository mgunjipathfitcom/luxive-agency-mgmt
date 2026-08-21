/**
 * 商品マスター連携(§7)
 * 代理店ユーザー向けの選択・入力単位は「商品名」。SKU・香り・サイズは入力させない(§7.1)。
 */
import type { DealProductLine, Product } from './types'

/** 販売中の商品名(一意化・表示順)(§7.2) */
export function activeProductNames(products: Product[]): string[] {
  const names = products.filter((p) => p.salesStatus === 'active').map((p) => p.name)
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, 'ja'))
}

/** 商品名から代表の商品レコードを引く(表示補助) */
export function findProductByName(products: Product[], name: string): Product | null {
  return products.find((p) => p.name === name) ?? null
}

/**
 * 案件詳細の商品行をマージする(§7.4)
 * 「案件に保存済みの商品行」と「現在販売中の商品名」を統合し、
 * 新商品は既存案件へ追加、停止商品は過去案件内で維持する。
 */
export function mergeLines(saved: DealProductLine[], activeNames: string[]): DealProductLine[] {
  const map = new Map<string, DealProductLine>()
  for (const line of saved) map.set(line.productName, { ...line })
  for (const name of activeNames) {
    if (!map.has(name)) {
      map.set(name, { productName: name, proposed: false, quoteAmount: null, orderAmount: null })
    }
  }
  const savedOrder = saved.map((l) => l.productName)
  return [...map.values()].sort((a, b) => {
    const ia = savedOrder.indexOf(a.productName)
    const ib = savedOrder.indexOf(b.productName)
    if (ia >= 0 && ib >= 0) return ia - ib
    if (ia >= 0) return -1
    if (ib >= 0) return 1
    return a.productName.localeCompare(b.productName, 'ja')
  })
}

/** 保存対象の行だけ残す(提案対象・金額のいずれかが入っている行) */
export function meaningfulLines(lines: DealProductLine[]): DealProductLine[] {
  return lines.filter((l) => l.proposed || l.quoteAmount !== null || l.orderAmount !== null)
}

export function sumQuote(lines: DealProductLine[]): number {
  return lines.reduce((s, l) => s + (l.quoteAmount ?? 0), 0)
}

export function sumOrder(lines: DealProductLine[]): number {
  return lines.reduce((s, l) => s + (l.orderAmount ?? 0), 0)
}

export const PRODUCT_PLACEHOLDER_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">` +
      `<rect width="160" height="160" fill="#f0ece6"/>` +
      `<path d="M52 104l22-28 16 20 12-14 18 22z" fill="#cfc4b4"/>` +
      `<circle cx="60" cy="58" r="10" fill="#cfc4b4"/>` +
      `<text x="80" y="140" font-family="sans-serif" font-size="12" fill="#9c8f7c" text-anchor="middle">NO IMAGE</text>` +
      `</svg>`,
  )

export const MAX_IMAGE_BYTES = 1024 * 1024 * 2 // 2MB
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function validateImageFile(file: { type: string; size: number }): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return 'JPG・PNG・WebPのみ登録できます'
  if (file.size > MAX_IMAGE_BYTES) return '画像は2MBまでです'
  return null
}
