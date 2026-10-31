import { useState } from 'react'

import { api, type Confirmed, type RunRecord, type SimulateReport } from '../../api'
import { useStore } from '../../store'
import {
  ACTION_STATUS_COLOR,
  ACTION_STATUS_ICON,
  describeAction,
} from '../../shared/rule/describe-action'
import { CheckResult } from '../../shared/rule/CheckResult'
import { Pipeline } from '../../shared/rule/Pipeline'
import { ConfirmCard } from '../../shared/rule/ConfirmCard'
import { useRuleChat } from '../../shared/rule/use-rule-chat'
import { Bubble } from '../../shared/ui/Bubble'
import { Button } from '../../shared/ui/Button'
import { Glass } from '../../shared/ui/Glass'
import { Icon } from '../../shared/ui/Icon'
import { TypingDots } from '../../shared/ui/TypingDots'

const INTENT_TITLE: Record<string, string> = {
  question: 'Вопрос о доме',
  command: 'Разовая команда',
  rule: 'Постоянное правило дома',
}

function Steps({ actions }: { actions: RunRecord['actions'] }) {
  const devices = useStore((state) => state.devices)
  if (actions.length === 0) return null
  return (
    <ol className="mt-3 space-y-2">
      {actions.map((action, index) => (
        <li key={`${action.type}-${index}`} className="flex gap-2.5">
          <Icon
            name={ACTION_STATUS_ICON[action.status] ?? 'alert'}
            size={15}
            className={`mt-0.5 shrink-0 ${ACTION_STATUS_COLOR[action.status] ?? 'text-ink-mute'}`}
          />
          <span className="text-body leading-snug text-ink-dim">
            {describeAction(action, devices)}
            {action.status !== 'ok' && action.detail && (
              <span className="text-ink-mute">: {action.detail}</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  )
}

/**
 * Ассистент УК: один вход для трёх намерений: вопрос о состоянии дома, разовая команда и
 * постоянное правило уровня дома. Команда и правило проходят ту же карточку, что у жителя:
 * пересказ из JSON, «да, подтвердить» или «нет, дополнить промпт». УК дополнительно может прогнать
 * правило на эмуляторах до подтверждения.
 */
export function AssistantPage() {
  const { text, setText, asked, previous, result, error, busy, send, confirm, refine, reset, withBusy } =
    useRuleChat('uk')
  const [run, setRun] = useState<RunRecord | null>(null)
  const [report, setReport] = useState<SimulateReport | null>(null)
  const [saved, setSaved] = useState<Confirmed | null>(null)

  const clearOutcome = () => {
    setRun(null)
    setReport(null)
    setSaved(null)
  }

  // Пустой Enter или Enter во время ответа ничего не отправляет — и не стирает показанный итог.
  const ask = async (query: string) => {
    if (!query.trim() || busy) return
    clearOutcome()
    await send(query)
  }

  const onConfirm = async () => {
    const res = await confirm()
    if (!res) return
    if (res.kind === 'command') setRun(res.run ?? null)
    else setSaved(res)
  }

  const simulate = async () => {
    const rule = result?.rule
    if (!rule) return
    const out = await withBusy(() => api.simulate(rule), 'Прогон не удался')
    if (out) setReport(out)
  }

  const onRefine = () => {
    refine()
    setReport(null)
  }

  const intent = result?.intent.intent

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col px-7 py-6">
      <div className="flex-1 space-y-3 pb-4">
        {asked.map((item, index) => (
          <Bubble key={`${index}-${item}`} mine>
            {item}
          </Bubble>
        ))}

        <Pipeline busy={busy} result={result} checked={saved} />

        {busy && (
          <div className="glass inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-ink-dim" role="status">
            <TypingDots />
          </div>
        )}

        {result && (
          <>
            {intent && (
              <p className="rise text-caption font-semibold tracking-widest text-ink-mute">
                {INTENT_TITLE[intent] ?? intent}
              </p>
            )}

            {result.answer && <Bubble>{result.answer}</Bubble>}

            {result.error && <Bubble>{`Не получилось собрать: ${result.error}. Уточните просьбу.`}</Bubble>}

            {result.rule && (
              <ConfirmCard
                result={result}
                busy={busy}
                onConfirm={() => void onConfirm()}
                onRefine={onRefine}
                extra={
                  intent === 'rule' && (
                    <Button variant="secondary" icon="play" disabled={busy} onClick={() => void simulate()}>
                      Прогнать
                    </Button>
                  )
                }
              />
            )}

            {run && (
              <Glass tone="solid" className="rise p-4">
                <p className="text-caption font-semibold tracking-widest text-ink-mute">ВЫПОЛНЕНО</p>
                <Steps actions={run.actions} />
              </Glass>
            )}

            {report && (
              <Glass tone="solid" className="rise p-4">
                <div className="flex items-center justify-between">
                  <p className="text-caption font-semibold tracking-widest text-ink-mute">ПРОГОН</p>
                  <span className={`text-meta ${report.passed ? 'text-ok' : 'text-sev-crit'}`}>
                    {report.passed ? 'без ошибок' : 'есть ошибки'}
                  </span>
                </div>
                <p className="mt-2 text-body text-ink-dim">{report.verdict}</p>
                <Steps actions={report.runs.flatMap((item) => item.actions ?? [])} />
              </Glass>
            )}
          </>
        )}

        {saved && <CheckResult res={saved} />}

        {previous && !result && !busy && (
          <p className="text-meta text-ink-mute">
            Напишите, что уточнить, или{' '}
            <button type="button" onClick={() => { reset(); clearOutcome() }} className="underline hover:text-ink">
              начните заново
            </button>
            .
          </p>
        )}

        {error && (
          <p role="alert" className="rounded-xl border border-sev-crit/30 bg-sev-crit-soft px-3 py-2 text-body text-sev-crit">
            {error}
          </p>
        )}
      </div>

      <div className="sticky bottom-0 flex items-end gap-2 bg-canvas/80 pt-2 pb-1 backdrop-blur">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              void ask(text)
            }
          }}
          rows={2}
          aria-label="Вопрос, команда или правило для ассистента"
          placeholder={previous ? 'Что уточнить? Например: только ночью' : 'Спросите о доме, дайте команду или опишите правило'}
          className="scroll-slim glass flex-1 resize-none rounded-2xl px-4 py-3 text-sm text-ink outline-none placeholder:text-ink-mute focus:border-accent/60 focus:ring-2 focus:ring-accent/25"
        />
        <button
          type="button"
          onClick={() => void ask(text)}
          disabled={busy || text.trim() === ''}
          className="press flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Спросить ассистента"
        >
          <Icon name="arrowRight" size={20} />
        </button>
      </div>
    </div>
  )
}
