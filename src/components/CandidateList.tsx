import { useStore } from '../data/store'
import { formatDate } from '../domain/dates'
import { STATUS_LABEL, formatYen } from '../domain/format'
import { totalOrders } from '../domain/dealOps'
import type { DuplicateCandidate } from '../domain/types'
import { Badge, Meter } from './ui'

const PROTECTION_LABEL: Record<DuplicateCandidate['protectionState'], string> = {
  reserved: 'Reserved案件',
  active: '有効保護中',
  expired: '保護期限切れ',
  none: '保護なし',
}

const RECOMMEND_LABEL: Record<DuplicateCandidate['recommendation'], string> = {
  approve: '承認推奨',
  check: '要確認',
  block: '営業不可推奨',
}

/**
 * 重複候補の一覧。
 * compact(申請者向け)では、既存案件の代理店・担当者・連絡先・金額を出さない(§15.3)。
 */
export function CandidateList({
  candidates,
  compact = false,
}: {
  candidates: DuplicateCandidate[]
  compact?: boolean
}) {
  const { db, agencyById, userById } = useStore()

  if (candidates.length === 0) {
    return <p className="muted small">一致・類似する登録はありません。</p>
  }

  return (
    <div className="stack stack--sm">
      {candidates.map((c) => {
        const deal = c.kind === 'deal' ? db.deals.find((d) => d.id === c.refId) : null
        const rc = c.kind === 'reserved' ? db.reserved.find((r) => r.id === c.refId) : null
        const tone =
          c.recommendation === 'block' ? 'danger' : c.recommendation === 'check' ? 'warn' : 'ok'
        return (
          <div className="callout" key={`${c.kind}-${c.refId}`} data-testid="candidate">
            <div className="row" style={{ gap: 8 }}>
              <Badge tone={c.protectionState === 'reserved' ? 'danger' : c.protectionState === 'active' ? 'warn' : 'neutral'}>
                {PROTECTION_LABEL[c.protectionState]}
              </Badge>
              <Badge tone={tone}>{RECOMMEND_LABEL[c.recommendation]}</Badge>
              <span className="spacer" />
              <Meter value={c.score} />
            </div>

            {!compact && (
              <div className="dl" style={{ marginTop: 8 }}>
                <div className="dl__k">企業名 / 施設名</div>
                <div className="dl__v">
                  {(deal?.companyName ?? rc?.companyName) || '—'}
                  <span className="muted"> / {(deal?.facilityName || rc?.facilityName) || '施設名なし'}</span>
                </div>
                {deal && (
                  <>
                    <div className="dl__k">所属代理店 / 担当</div>
                    <div className="dl__v">
                      {agencyById(deal.agencyId)?.name ?? '—'} / {userById(deal.ownerUserId)?.name ?? '—'}
                    </div>
                    <div className="dl__k">ステータス</div>
                    <div className="dl__v">{STATUS_LABEL[deal.status]}</div>
                    <div className="dl__k">保護期限</div>
                    <div className="dl__v num">
                      {formatDate(deal.protectionExpiresAt)}
                      <span className="muted xsmall">
                        {' '}
                        (登録 {formatDate(deal.createdAt)})
                      </span>
                    </div>
                    <div className="dl__k">受注</div>
                    <div className="dl__v num">
                      {totalOrders(deal) > 0 ? formatYen(totalOrders(deal)) : '—'}
                    </div>
                  </>
                )}
                {rc && (
                  <>
                    <div className="dl__k">登録理由</div>
                    <div className="dl__v">{rc.reason}</div>
                    <div className="dl__k">登録日</div>
                    <div className="dl__v num">{formatDate(rc.registeredAt)}</div>
                  </>
                )}
              </div>
            )}

            <div className="row row--tight" style={{ marginTop: 8 }}>
              <span className="xsmall muted">一致:</span>
              {c.matched.length > 0 ? (
                c.matched.map((m) => (
                  <Badge tone="accent" key={m}>
                    {m}
                  </Badge>
                ))
              ) : (
                <span className="xsmall muted">なし</span>
              )}
            </div>
            <div className="row row--tight" style={{ marginTop: 4 }}>
              <span className="xsmall muted">不一致:</span>
              {c.unmatched.length > 0 ? (
                c.unmatched.map((m) => (
                  <span className="badge" key={m}>
                    {m}
                  </span>
                ))
              ) : (
                <span className="xsmall muted">なし</span>
              )}
            </div>
            <p className="xsmall muted" style={{ marginTop: 6 }}>
              {c.reason}
              {compact && ' / 詳しい内容は本部が確認します'}
            </p>
          </div>
        )
      })}
    </div>
  )
}
