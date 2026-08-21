/**
 * 入力値の正規化(§3.4)
 * 表示は入力値のまま、比較は正規化値で行う。
 */

/** 日本語の法人格・団体格。長いものから順に落とす(部分一致の取りこぼし防止)。 */
const LEGAL_FORMS_JA = [
  '特定非営利活動法人',
  '一般社団法人',
  '公益社団法人',
  '一般財団法人',
  '公益財団法人',
  '社会福祉法人',
  '社会医療法人',
  '医療法人社団',
  '医療法人財団',
  '独立行政法人',
  '国立大学法人',
  '公立大学法人',
  '宗教法人',
  '学校法人',
  '医療法人',
  '社団法人',
  '財団法人',
  '株式会社',
  '有限会社',
  '合同会社',
  '合名会社',
  '合資会社',
  '相互会社',
  '協同組合',
  '企業組合',
  'npo法人',
  '(株)',
  '(有)',
  '(名)',
  '(資)',
  '(福)',
  '(医)',
  '(同)',
]

/** ラテン文字の法人格。誤削除を防ぐため語境界を要求する。 */
const LEGAL_FORMS_EN = [
  'co.,ltd.',
  'co., ltd.',
  'co.ltd.',
  'co.,ltd',
  'corporation',
  'incorporated',
  'company',
  'holdings',
  'limited',
  'corp.',
  'corp',
  'inc.',
  'inc',
  'ltd.',
  'ltd',
  'k.k.',
  'llc',
  'gmbh',
  's.a.',
]

/** 空白・句読点・記号(比較時に落とす) */
const PUNCT_RE =
  /[\s　.,、。・･\-‐‑‒–—―ー_/\\|~〜＝=+*&#!?"'`^%$@:;[\]{}()（）「」『』【】〔〕<>《》]/g

const ALNUM_RE = /[a-z0-9]/

/** NFKC正規化 + trim + 小文字化。全角/半角・大文字/小文字・㈱→(株) を吸収する。 */
export function foldWidthAndCase(value: string): string {
  return (value ?? '').normalize('NFKC').trim().toLowerCase()
}

function stripJaForms(input: string): string {
  let s = input
  for (const form of LEGAL_FORMS_JA) {
    if (s.length <= form.length) continue
    if (s.startsWith(form)) s = s.slice(form.length)
    if (s.length > form.length && s.endsWith(form)) s = s.slice(0, -form.length)
  }
  return s.trim()
}

function stripEnForms(input: string): string {
  let s = input
  for (const form of LEGAL_FORMS_EN) {
    if (s.length <= form.length) continue
    // 接頭: 直後が英数字なら語の一部とみなして削除しない
    if (s.startsWith(form)) {
      const next = s.charAt(form.length)
      if (!ALNUM_RE.test(next)) s = s.slice(form.length).trim()
    }
    // 接尾: 直前が英数字なら語の一部とみなして削除しない(例: zinc の inc)
    if (s.length > form.length && s.endsWith(form)) {
      const prev = s.charAt(s.length - form.length - 1)
      if (!ALNUM_RE.test(prev)) s = s.slice(0, -form.length).trim()
    }
  }
  return s.trim()
}

/**
 * 企業名の正規化(§3.4)
 * 法人格・全角半角・大文字小文字・空白・句読点・記号の差異を吸収する。
 */
export function normalizeCompanyName(raw: string): string {
  let s = foldWidthAndCase(raw)
  if (!s) return ''
  // 法人格は前後どちらにも付きうる。2巡して取りこぼしを防ぐ。
  // ここでは「(株)」のように記号を含む表記を先に処理する。
  for (let pass = 0; pass < 2; pass++) {
    s = stripJaForms(s)
    s = stripEnForms(s)
  }
  s = s.replace(PUNCT_RE, '')
  // 「Luxive株式会社。」のように記号が挟まって取りこぼした法人格を、
  // 記号を落としたあとにもう一度除去する。
  for (let pass = 0; pass < 2; pass++) {
    const before = s
    s = stripJaForms(s)
    if (s === before) break
  }
  return s
}

/** 施設名の正規化。法人格の除去は行わず、表記差のみ吸収する。 */
export function normalizeFacilityName(raw: string): string {
  const s = foldWidthAndCase(raw)
  if (!s) return ''
  return s.replace(PUNCT_RE, '')
}

/**
 * 電話番号の正規化(§3.4)
 * ハイフン・空白・括弧・+81・+81 (0)・0081・内線表記を吸収し、国内形式の数字列にする。
 */
export function normalizePhone(raw: string): string {
  let s = foldWidthAndCase(raw)
  if (!s) return ''
  // 内線表記より後ろを落とす
  const cut = s.split(/内線|代表番号|ext\.?|extension|#/)[0]
  s = cut === undefined ? s : cut
  // 国際プレフィックスを一時マーカーへ
  s = s.replace(/^\+?0{2}81/, '+81').replace(/^\+81/, 'jp')
  s = s.replace(/[^0-9a-z]/g, '')
  if (s.startsWith('jp')) {
    s = s.slice(2).replace(/^0+/, '')
    s = '0' + s
  }
  s = s.replace(/[^0-9]/g, '')
  // 「81xxxxxxxxx」形式で入った国際表記も国内形式へ寄せる
  if (s.length >= 11 && s.startsWith('81')) s = '0' + s.slice(2)
  return s
}

/** 電話番号として妥当か(国内: 10桁または11桁) */
export function isValidPhone(raw: string): boolean {
  const n = normalizePhone(raw)
  return n.length === 10 || n.length === 11
}

const DOMAIN_LABEL_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

/**
 * Webサイトの正規化(§3.4)
 * scheme・www.・大文字小文字・パス・末尾スラッシュ/ドットを吸収してホスト名を返す。
 * 単一ラベルや不正なホスト名はnullを返す(有効なドメインとして扱わない)。
 */
export function normalizeDomain(raw: string): string | null {
  let s = foldWidthAndCase(raw)
  if (!s) return null
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  s = s.replace(/^[^@/]*@/, '') // user:pass@
  s = (s.split(/[/?#]/)[0] ?? '').trim()
  s = (s.split(':')[0] ?? '').trim() // port
  s = s.replace(/\.+$/, '')
  s = s.replace(/^www\./, '')
  if (!s || s.length > 253) return null
  const labels = s.split('.')
  if (labels.length < 2) return null // 単一ラベルは有効なドメインとして扱わない
  for (const label of labels) {
    if (!label || label.length > 63 || !DOMAIN_LABEL_RE.test(label)) return null
  }
  const tld = labels[labels.length - 1] ?? ''
  if (!/^[a-z]{2,}$/.test(tld)) return null
  return s
}

export function isValidWebsite(raw: string): boolean {
  return normalizeDomain(raw) !== null
}

const TWO_LEVEL_TLDS = new Set([
  'co.jp', 'or.jp', 'ne.jp', 'ac.jp', 'go.jp', 'ed.jp', 'gr.jp', 'lg.jp',
  'co.uk', 'org.uk', 'ac.uk', 'com.au', 'co.kr', 'com.cn', 'com.tw', 'com.br',
])

/** 登録可能ドメイン(おおよそ)。sub.example.co.jp -> example.co.jp */
export function registrableDomain(domain: string): string {
  const labels = domain.split('.')
  if (labels.length <= 2) return domain
  const last2 = labels.slice(-2).join('.')
  if (TWO_LEVEL_TLDS.has(last2)) return labels.slice(-3).join('.')
  return last2
}

/** 2つの文字列の類似度(0..1)。bigram Dice係数。1文字以下は完全一致のみ。 */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0
  const grams = (s: string) => {
    const m = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2)
      m.set(g, (m.get(g) ?? 0) + 1)
    }
    return m
  }
  const ga = grams(a)
  const gb = grams(b)
  let hit = 0
  for (const [g, n] of ga) hit += Math.min(n, gb.get(g) ?? 0)
  return (2 * hit) / (a.length - 1 + (b.length - 1))
}
