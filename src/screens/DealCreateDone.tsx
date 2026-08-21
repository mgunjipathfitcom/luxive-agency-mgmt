import { useStore } from '../data/store'
import { canViewDeal } from '../domain/permissions'
import { formatDate } from '../domain/dates'
import { JUDGEMENT_LABEL } from '../domain/format'
import { remainingDays } from '../domain/protection'
import { navigate, useHashRoute } from '../router/useHashRoute'
import { Callout, Card, Icon, JudgementBadge, PageHead } from '../components/ui'

export function DealCreateDone() {
  const loc = useHashRoute()
  const { dealById, settings, currentUser } = useStore()
  const dealId = loc.query.get('deal')
  const found = dealById(dealId)
  // §2.4 案件IDを直接入れても、閲覧権限のない案件は見せない
  const deal = found && currentUser && canViewDeal(currentUser, found) ? found : null

  if (!deal) {
    return (
      <>
        <PageHead title="登録完了" />
        <Callout tone="warn" title="表示する案件が見つかりません">
          もう一度、営業予定登録からやり直してください。
        </Callout>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn btn--primary" onClick={() => navigate('deal-new')}>
            営業予定登録へ
          </button>
        </div>
      </>
    )
  }

  const pending = deal.reviewState === 'pending'

  return (
    <>
      <PageHead title="営業予定の登録が完了しました" />

      <Callout tone={pending ? 'warn' : 'ok'} title={pending ? '本部の重複審査に入りました' : '重複なし:自動承認されました'}>
        {pending
          ? '案件は作成しましたが、既存の登録と一致する可能性があるため本部が確認します。結果は登録したご本人にだけ通知します。'
          : `保護期間が設定されました。保護期限は${formatDate(deal.protectionExpiresAt)}(残り${remainingDays(deal.protectionExpiresAt)}日)です。`}
      </Callout>

      <div className="grid grid--detail" style={{ marginTop: 16 }}>
        <Card title="登録した内容">
          <div className="dl">
            <div className="dl__k">企業名</div>
            <div className="dl__v strong" data-testid="done-company">
              {deal.companyName}
            </div>
            <div className="dl__k">施設名</div>
            <div className="dl__v">{deal.facilityName || '—'}</div>
            <div className="dl__k">電話番号</div>
            <div className="dl__v num">{deal.phone}</div>
            <div className="dl__k">Webサイト</div>
            <div className="dl__v">{deal.website}</div>
            <div className="dl__k">担当者</div>
            <div className="dl__v">{deal.contactPersonName || '—'}</div>
            <div className="dl__k">提案商品</div>
            <div className="dl__v">
              {deal.lines.length > 0 ? (
                <div className="pill-list">
                  {deal.lines.map((l) => (
                    <span className="badge" key={l.productName}>
                      {l.productName}
                    </span>
                  ))}
                </div>
              ) : (
                '—'
              )}
            </div>
          </div>
        </Card>

        <Card title="判定と保護期間">
          <div className="stack">
            <div className="row">
              <JudgementBadge judgement={deal.judgement} />
            </div>
            <div className="dl">
              <div className="dl__k">判定結果</div>
              <div className="dl__v" data-testid="done-judgement">
                {JUDGEMENT_LABEL[deal.judgement]}
              </div>
              <div className="dl__k">保護期間</div>
              <div className="dl__v num">{settings.plannedDays}日(営業予定登録)</div>
              <div className="dl__k">保護開始日</div>
              <div className="dl__v num">{formatDate(deal.protectionStartAt)}</div>
              <div className="dl__k">保護期限</div>
              <div className="dl__v num strong" data-testid="done-expires">
                {formatDate(deal.protectionExpiresAt)}
              </div>
              <div className="dl__k">残り日数</div>
              <div className="dl__v num">{remainingDays(deal.protectionExpiresAt)}日</div>
            </div>
          </div>
        </Card>
      </div>

      <div className="btn-row" style={{ marginTop: 16 }}>
        <button className="btn btn--primary" onClick={() => navigate(`deal/${deal.id}`)} data-testid="done-detail">
          <Icon name="doc" />
          案件詳細を確認する
        </button>
        <button className="btn" onClick={() => navigate('deal-new')} data-testid="done-again">
          <Icon name="plus" />
          続けて別の営業予定を登録する
        </button>
        <button className="btn" onClick={() => navigate('my-deals')} data-testid="done-list">
          <Icon name="folder" />
          担当案件一覧へ戻る
        </button>
      </div>
    </>
  )
}
