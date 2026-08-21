import { useState } from 'react'
import { useStore } from '../data/store'
import { DEFAULT_SETTINGS } from '../domain/protection'
import type { Settings as SettingsType } from '../domain/types'
import { Callout, Card, Icon, PageHead } from '../components/ui'

const NUM_FIELDS: { key: keyof SettingsType; label: string; hint: string; group: 'protection' | 'duplicate' }[] = [
  { key: 'plannedDays', label: '営業予定登録', hint: '登録した日から数えます', group: 'protection' },
  { key: 'meetingDays', label: '商談', hint: '既存の期限の方が長いときは短くしません', group: 'protection' },
  { key: 'quotedDays', label: '見積提出', hint: '既存の期限の方が長いときは短くしません', group: 'protection' },
  { key: 'orderDays', label: '受注確定', hint: '受注日から数えます', group: 'protection' },
  { key: 'additionalOrderDays', label: '追加受注', hint: '追加受注の受注日から数え直します', group: 'protection' },
  { key: 'warningDays', label: '保護期限の警告', hint: 'この日数以内を「保護期限間近」とします', group: 'protection' },
  { key: 'duplicateThreshold', label: '重複と見なすスコア', hint: 'この値以上で重複審査へ回します', group: 'duplicate' },
  { key: 'weightCompanyName', label: '企業名のウェイト', hint: '法人格を除いた企業名の一致度', group: 'duplicate' },
  { key: 'weightPhone', label: '電話番号のウェイト', hint: '完全一致で満点', group: 'duplicate' },
  { key: 'weightWebDomain', label: 'Webドメインのウェイト', hint: '完全一致で満点', group: 'duplicate' },
  { key: 'weightFacilityName', label: '施設名のウェイト', hint: '施設名の一致度', group: 'duplicate' },
]

export function Settings() {
  const { settings, updateSettings, db } = useStore()
  const [form, setForm] = useState<SettingsType>(settings)
  const [applyToExisting, setApplyToExisting] = useState(false)
  const [saved, setSaved] = useState(false)

  const set = (key: keyof SettingsType, value: number | boolean) =>
    setForm((f) => ({ ...f, [key]: value }) as SettingsType)

  const dirty = JSON.stringify(form) !== JSON.stringify(settings)

  const save = () => {
    updateSettings(form, applyToExisting)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 3000)
  }

  const affected = db.deals.length

  return (
    <>
      <PageHead
        title="基本設定"
        desc="保護期間と重複判定の基準をここで決めます。単位はすべて日数です。"
        actions={
          <>
            <button className="btn" onClick={() => setForm({ ...DEFAULT_SETTINGS })}>
              <Icon name="refresh" />
              初期値に戻す
            </button>
            <button className="btn btn--primary" onClick={save} disabled={!dirty} data-testid="settings-save">
              <Icon name="check" />
              保存する
            </button>
          </>
        }
      />

      {saved && (
        <Callout tone="ok" title="保存しました">
          {applyToExisting
            ? `既存の${affected}件の案件も、新しい保護日数で計算し直しました。変更内容は各案件の変更履歴に残ります。`
            : '新規案件と、次回のステータス変更から新しい設定を使います。'}
        </Callout>
      )}

      <div className="grid grid--2" style={{ marginTop: saved ? 16 : 0 }}>
        <Card title="保護期間" desc="ステータスごとに、その日から何日間保護するか">
          <div className="form-grid">
            {NUM_FIELDS.filter((f) => f.group === 'protection').map((f) => (
              <label className="field" key={String(f.key)}>
                <span className="field__label">{f.label}</span>
                <div className="row row--tight">
                  <input
                    className="input input--amount"
                    type="text"
                    inputMode="numeric"
                    value={String(form[f.key])}
                    onChange={(e) => set(f.key, Number(e.target.value.replace(/[^0-9]/g, '')) || 0)}
                    style={{ maxWidth: 120 }}
                    data-testid={`settings-${String(f.key)}`}
                  />
                  <span className="small">日</span>
                </div>
                <span className="field__hint">{f.hint}</span>
              </label>
            ))}
          </div>
          <Callout tone="info" title="「12か月」ではなく「365日」で扱います">
            単位を日数に統一しているため、月の長さによる差が出ません。
          </Callout>
        </Card>

        <Card title="重複判定" desc="スコアの重み付けと、重複審査へ回す境目">
          <div className="form-grid">
            {NUM_FIELDS.filter((f) => f.group === 'duplicate').map((f) => (
              <label className="field" key={String(f.key)}>
                <span className="field__label">{f.label}</span>
                <div className="row row--tight">
                  <input
                    className="input input--amount"
                    type="text"
                    inputMode="numeric"
                    value={String(form[f.key])}
                    onChange={(e) => set(f.key, Number(e.target.value.replace(/[^0-9]/g, '')) || 0)}
                    style={{ maxWidth: 120 }}
                    data-testid={`settings-${String(f.key)}`}
                  />
                  <span className="small">{String(f.key).startsWith('weight') ? '点' : '%'}</span>
                </div>
                <span className="field__hint">{f.hint}</span>
              </label>
            ))}
            <label className="field span-2">
              <span className="field__label">連絡先の完全一致の扱い</span>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={form.forceContactExactSimilar}
                  onChange={(e) => set('forceContactExactSimilar', e.target.checked)}
                  data-testid="settings-contact-exact"
                />
                <span>電話番号かWebドメインが完全に一致したら、スコアに関係なく重複審査へ回す</span>
              </label>
            </label>
          </div>

          <Callout tone="warn" title="企業名の完全一致だけは設定で変えられません">
            法人格などを除いた企業名が既存の登録と完全に一致した場合は、ウェイトや閾値の値に関係なく必ず重複審査へ回します。
            たとえば「企業名ウェイト40 / 閾値50」でも、完全一致は自動承認になりません。
          </Callout>
        </Card>
      </div>

      <Card title="既存案件への反映">
        <div className="stack">
          <label className="radio">
            <input
              type="radio"
              name="apply"
              checked={!applyToExisting}
              onChange={() => setApplyToExisting(false)}
              data-testid="settings-apply-no"
            />
            <span>
              <strong>反映しない</strong> — 新規案件と、次回のステータス変更から新しい設定を使う
            </span>
          </label>
          <label className="radio">
            <input
              type="radio"
              name="apply"
              checked={applyToExisting}
              onChange={() => setApplyToExisting(true)}
              data-testid="settings-apply-yes"
            />
            <span>
              <strong>反映する</strong> — いまある{affected}件の案件も計算し直し、各案件の変更履歴に残す
            </span>
          </label>
        </div>
      </Card>
    </>
  )
}
