import { useMemo, useRef, useState } from 'react'
import { useStore } from '../data/store'
import { formatDate } from '../domain/dates'
import { SALES_STATUS_LABEL } from '../domain/format'
import { newId } from '../domain/id'
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  PRODUCT_PLACEHOLDER_IMAGE,
  validateImageFile,
} from '../domain/products'
import type { Product, SalesStatus } from '../domain/types'
import { Badge, Callout, Card, EmptyState, Icon, Modal, PageHead } from '../components/ui'

const EMPTY: Product = {
  id: '',
  sku: '',
  brand: 'Luxive',
  category: '',
  name: '',
  scent: '',
  size: '',
  description: '',
  imageDataUrl: null,
  salesStatus: 'active',
  note: '',
  createdAt: '',
  updatedAt: '',
}

export function Products() {
  const { db, upsertProduct, deleteProductImage } = useStore()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'' | SalesStatus>('')
  const [editing, setEditing] = useState<Product | null>(null)

  const rows = useMemo(() => {
    let list = [...db.products]
    if (status) list = list.filter((p) => p.salesStatus === status)
    if (q.trim()) {
      const n = q.trim().toLowerCase()
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(n) ||
          p.sku.toLowerCase().includes(n) ||
          p.brand.toLowerCase().includes(n) ||
          p.category.toLowerCase().includes(n),
      )
    }
    return list.sort((a, b) => (a.salesStatus === b.salesStatus ? a.sku.localeCompare(b.sku) : a.salesStatus === 'active' ? -1 : 1))
  }, [db.products, q, status])

  const usageCount = (name: string) =>
    db.deals.filter(
      (d) =>
        d.lines.some((l) => l.productName === name) ||
        d.orders.some((o) => o.lines.some((l) => l.productName === name)),
    ).length

  return (
    <>
      <PageHead
        title="商品マスター"
        desc="代理店の入力単位は商品名です。販売中にした商品はコードを変えずに営業予定登録・案件詳細へ反映されます。"
        actions={
          <button
            className="btn btn--primary"
            onClick={() => setEditing({ ...EMPTY, id: newId('PR') })}
            data-testid="product-new"
          >
            <Icon name="plus" />
            商品を追加
          </button>
        }
      />

      <Callout tone="info" title="販売停止にしても過去の記録は消しません">
        停止中の商品は新しい入力の選択肢から外れますが、すでに登録済みの案件・提案・見積・受注・金額履歴には残り続けます。
      </Callout>

      <Card flush>
        <div className="toolbar">
          <div className="toolbar__item toolbar__item--grow">
            <label className="field">
              <span className="field__label">キーワード</span>
              <input
                className="input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="商品名・SKU・ブランド・分類"
                data-testid="product-q"
              />
            </label>
          </div>
          <div className="toolbar__item">
            <label className="field">
              <span className="field__label">販売状態</span>
              <select
                className="select"
                value={status}
                onChange={(e) => setStatus(e.target.value as '' | SalesStatus)}
                data-testid="product-status-filter"
              >
                <option value="">すべて</option>
                <option value="active">販売中</option>
                <option value="suspended">停止中</option>
              </select>
            </label>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState title="該当する商品がありません" />
        ) : (
          <div className="table-wrap">
            <table className="data stackable">
              <thead>
                <tr>
                  <th>画像</th>
                  <th>商品名</th>
                  <th>SKU / ブランド</th>
                  <th>分類</th>
                  <th>香り / サイズ</th>
                  <th>販売状態</th>
                  <th className="num">利用案件</th>
                  <th>更新日</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} data-testid={`product-row-${p.id}`}>
                    <td data-label="画像">
                      <img
                        className="product-thumb"
                        src={p.imageDataUrl ?? PRODUCT_PLACEHOLDER_IMAGE}
                        alt=""
                      />
                    </td>
                    <td data-label="商品名">
                      <div className="cell-strong">{p.name}</div>
                      <div className="cell-sub">{p.description}</div>
                    </td>
                    <td data-label="SKU">
                      <div className="mono">{p.sku}</div>
                      <div className="cell-sub">{p.brand}</div>
                    </td>
                    <td data-label="分類">{p.category}</td>
                    <td data-label="香り / サイズ">
                      <div className="cell-sub">{p.scent || '—'}</div>
                      <div className="cell-sub">{p.size || '—'}</div>
                    </td>
                    <td data-label="販売状態">
                      <Badge tone={p.salesStatus === 'active' ? 'ok' : 'neutral'}>
                        {SALES_STATUS_LABEL[p.salesStatus]}
                      </Badge>
                    </td>
                    <td className="num" data-label="利用案件">
                      {usageCount(p.name)}
                    </td>
                    <td className="num nowrap" data-label="更新日">
                      {formatDate(p.updatedAt)}
                    </td>
                    <td data-label="">
                      <div className="btn-row">
                        <button className="btn btn--sm" onClick={() => setEditing(p)} data-testid={`product-edit-${p.id}`}>
                          編集
                        </button>
                        <button
                          className="btn btn--sm"
                          onClick={() =>
                            upsertProduct({
                              ...p,
                              salesStatus: p.salesStatus === 'active' ? 'suspended' : 'active',
                            })
                          }
                          data-testid={`product-toggle-${p.id}`}
                        >
                          {p.salesStatus === 'active' ? '停止する' : '再開する'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <ProductEditor
          product={editing}
          onClose={() => setEditing(null)}
          onSave={(p) => {
            upsertProduct(p)
            setEditing(null)
          }}
          onDeleteImage={() => {
            if (editing.id) deleteProductImage(editing.id)
            setEditing({ ...editing, imageDataUrl: null })
          }}
        />
      )}
    </>
  )
}

function ProductEditor({
  product,
  onClose,
  onSave,
  onDeleteImage,
}: {
  product: Product
  onClose: () => void
  onSave: (p: Product) => void
  onDeleteImage: () => void
}) {
  const [form, setForm] = useState<Product>(product)
  const [imageError, setImageError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const fileRef = useRef<HTMLInputElement>(null)

  const pick = (file: File | undefined) => {
    if (!file) return
    const err = validateImageFile(file)
    if (err) {
      setImageError(err)
      return
    }
    setImageError(null)
    const reader = new FileReader()
    reader.onload = () => setForm((f) => ({ ...f, imageDataUrl: String(reader.result) }))
    reader.readAsDataURL(file)
  }

  const save = () => {
    const errs: Record<string, string> = {}
    if (!form.name.trim()) errs.name = '商品名を入力してください'
    if (!form.sku.trim()) errs.sku = 'SKUを入力してください'
    if (!form.category.trim()) errs.category = '商品分類を入力してください'
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    onSave(form)
  }

  return (
    <Modal
      title={product.createdAt ? '商品を編集する' : '商品を追加する'}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            やめる
          </button>
          <button className="btn btn--primary" onClick={save} data-testid="product-save">
            保存する
          </button>
        </>
      }
    >
      <div className="row" style={{ alignItems: 'flex-start', gap: 16, marginBottom: 14 }}>
        <img
          className="product-thumb product-thumb--lg"
          src={form.imageDataUrl ?? PRODUCT_PLACEHOLDER_IMAGE}
          alt=""
          data-testid="product-preview"
        />
        <div className="stack stack--sm">
          <input
            ref={fileRef}
            type="file"
            accept={ALLOWED_IMAGE_TYPES.join(',')}
            style={{ display: 'none' }}
            onChange={(e) => pick(e.target.files?.[0])}
            data-testid="product-image-input"
          />
          <div className="btn-row">
            <button className="btn btn--sm" onClick={() => fileRef.current?.click()}>
              <Icon name="download" />
              画像を{form.imageDataUrl ? '変更' : '登録'}
            </button>
            {form.imageDataUrl && (
              <button className="btn btn--sm" onClick={onDeleteImage}>
                画像を削除
              </button>
            )}
          </div>
          <p className="xsmall muted">
            JPG・PNG・WebP / {Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MBまで。
            画像がない商品には共通の代替画像を出します。
          </p>
          {imageError && <p className="field__error">{imageError}</p>}
        </div>
      </div>

      <div className="form-grid">
        <label className="field">
          <span className="field__label">
            商品名<span className="req">必須</span>
          </span>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            aria-invalid={!!errors.name}
            data-testid="product-name"
          />
          {errors.name && <span className="field__error">{errors.name}</span>}
        </label>
        <label className="field">
          <span className="field__label">
            SKU / 内部ID<span className="req">必須</span>
          </span>
          <input
            className="input"
            value={form.sku}
            onChange={(e) => setForm({ ...form, sku: e.target.value })}
            aria-invalid={!!errors.sku}
            data-testid="product-sku"
          />
          {errors.sku && <span className="field__error">{errors.sku}</span>}
        </label>
        <label className="field">
          <span className="field__label">ブランド</span>
          <input className="input" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">
            商品分類<span className="req">必須</span>
          </span>
          <input
            className="input"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            aria-invalid={!!errors.category}
          />
          {errors.category && <span className="field__error">{errors.category}</span>}
        </label>
        <label className="field">
          <span className="field__label">香り</span>
          <input className="input" value={form.scent} onChange={(e) => setForm({ ...form, scent: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">サイズ</span>
          <input className="input" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} />
        </label>
        <label className="field span-2">
          <span className="field__label">商品説明</span>
          <textarea
            className="textarea"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <label className="field">
          <span className="field__label">販売状態</span>
          <select
            className="select"
            value={form.salesStatus}
            onChange={(e) => setForm({ ...form, salesStatus: e.target.value as SalesStatus })}
            data-testid="product-status"
          >
            <option value="active">販売中</option>
            <option value="suspended">停止中</option>
          </select>
          <span className="field__hint">停止中にすると新規入力の選択肢から外れます。</span>
        </label>
        <label className="field">
          <span className="field__label">備考</span>
          <input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </label>
      </div>
      <p className="xsmall muted">
        代理店の画面ではSKU・香り・サイズは入力させません。選択と表示の単位は商品名だけです。
      </p>
    </Modal>
  )
}
