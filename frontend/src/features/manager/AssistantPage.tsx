import { useState } from 'react'

import { api, type Compiled, type RunRecord, type SimulateReport } from '../../api'
import { useStore } from '../../store'
import {
  ACTION_STATUS_COLOR,
  ACTION_STATUS_ICON,
  describeAction,
} from '../../shared/rule/describe-action'
import { RuleBlock } from '../../shared/rule/RuleBlock'
import { ruleLines } from '../../shared/rule/rule-lines'
import { Bubble } from '../../shared/ui/Bubble'
import { Button } from '../../shared/ui/Button'
import { Glass } from '../../shared/ui/Glass'
import { Icon } from '../../shared/ui/Icon'
import { TypingDots } from '../../shared/ui/TypingDots'

const PROMPTS = [
  { icon: 'activity' as const, text: 'Что сейчас в доме?' },
  { icon: 'play' as const, text: 'Что будет, если ночью протечка в 42-й?' },
  { icon: 'barrier' as const, text: 'Открой шлагбаум во дворе' },
  { icon: 'bolt' as const, text: 'Если лифт встал — сразу заявку в ЛифтМонтаж' },
]

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
          <span className="text-[13px] leading-snug text-ink-dim">
            {describeAction(action, devices)}
            {action.status !== 'ok' && action.detail && (
              <span className="text-ink-mute"> — {action.detail}</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  )
}

function LintSummary({ result }: { result: Compiled }) {
  const lint = result.lint
  if (!lint) return null
  return (
    <p className={`mt-3 text-[12px] ${lint.ok ? 'text-ok' : 'text-sev-crit'}`}>
      Линтер: {lint.ok ? 'конфликтов и циклов нет' : `ошибок ${lint.errors ?? 0}`}
      {(lint.warnings ?? 0) > 0 && `, предупреждений ${lint.warnings ?? 0}`}
    </p>
  )
}

/**
 * Ассистент УК: один вход для трёх намерений — вопрос о состоянии дома,
 * разовая команда и постоянное правило уровня дома. Намерение определяет Jev.
 */
export function AssistantPage() {
  const devices = useStore((state) => state.devices)
  const reload = useStore((state) => state.reloadRules)
  const [text, setText] = useState('')
  const [sent, setSent] = useState<string | null>(null)
  const [result, setResult] = useState<Compiled | null>(null)
  const [run, setRun] = useState<RunRecord | null>(null)
  const [report, setReport] = useState<SimulateReport | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setResult(null)
    setRun(null)
    setReport(null)
    setSaved(null)
    setError(null)
  }

  const ask = async (query: string) => {
    if (query.trim().length === 0) return
    setBusy(true)
    setSent(query)
    reset()
    try {
      setResult(await api.compile(query, 'uk'))
      setText('')
    } catch (cause) {
      setError(`Не получилось разобрать: ${(cause as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const act = async (kind: 'execute' | 'simulate' | 'save') => {
    const rule = result?.rule
    if (!rule) return
    setBusy(true)
    try {
      if (kind === 'execute') setRun(await api.executeNow(rule))
      if (kind === 'simulate') setReport(await api.simulate(rule))
      if (kind === 'save') {
        const saved = await api.createRule({ ...rule, owner: 'uk' })
        await reload()
        setSaved(saved.title)
      }
    } catch (cause) {
      setError(`Не удалось: ${(cause as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const intent = result?.intent.intent
  const lines = result?.rule ? ruleLines(result.rule, devices) : null

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col px-7 py-6">
      <div className="flex-1 space-y-3 pb-4">
        <Bubble>
          Спросите о доме, отдайте разовую команду или опишите правило уровня дома. Я определю, что
          это, соберу по схеме и проверю линтером до включения.
        </Bubble>

        {!sent && (
          <div className="grid gap-2 pt-1 sm:grid-cols-2">
            {PROMPTS.map((prompt, index) => (
              <button
                key={prompt.text}
                type="button"
                onClick={() => void ask(prompt.text)}
                style={{ '--i': index } as React.CSSProperties}
                className="rise press glass sheen flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-[13px] text-ink-dim transition hover:text-ink"
              >
                <Icon name={prompt.icon} size={18} className="shrink-0 text-accent" />
                {prompt.text}
              </button>
            ))}
          </div>
        )}

        {sent && <Bubble mine>{sent}</Bubble>}

        {busy && (
          <div className="glass inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-ink-dim">
            <TypingDots />
          </div>
        )}

        {result && (
          <>
            {intent && (
              <p className="rise text-[11px] font-semibold tracking-widest text-ink-mute">
                {INTENT_TITLE[intent] ?? intent}
                {result.intent.confidence !== undefined &&
                  ` · уверенность ${Math.round(result.intent.confidence * 100)}%`}
              </p>
            )}

            {result.answer && <Bubble>{result.answer}</Bubble>}

            {lines && result.rule && (
              <>
                <Bubble>{`Вот что я понял: «${result.rule.title}»`}</Bubble>
                <RuleBlock kind="when" lines={lines.when} />
                <RuleBlock kind="if" lines={lines.conditions} />
                <RuleBlock kind="then" lines={lines.actions} />
                <Glass className="rise p-4">
                  <LintSummary result={result} />
                  <div className="mt-3 flex flex-wrap gap-2.5">
                    {intent === 'command' ? (
                      <Button variant="primary" icon="play" onClick={() => void act('execute')}>
                        Выполнить сейчас
                      </Button>
                    ) : (
                      <>
                        <Button variant="secondary" icon="play" onClick={() => void act('simulate')}>
                          Прогнать на эмуляторах
                        </Button>
                        <Button variant="primary" icon="check" onClick={() => void act('save')}>
                          Сохранить правило дома
                        </Button>
                      </>
                    )}
                    <Button variant="ghost" onClick={() => { setSent(null); reset() }}>
                      Начать заново
                    </Button>
                  </div>
                </Glass>
              </>
            )}

            {run && (
              <Glass className="rise p-4">
                <p className="text-[11px] font-semibold tracking-widest text-ink-mute">ВЫПОЛНЕНО</p>
                <Steps actions={run.actions} />
              </Glass>
            )}

            {report && (
              <Glass className="rise p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold tracking-widest text-ink-mute">ПРОГОН</p>
                  <span className={`text-[12px] ${report.passed ? 'text-ok' : 'text-sev-crit'}`}>
                    {report.passed ? 'без ошибок' : 'есть ошибки'}
                  </span>
                </div>
                <p className="mt-2 text-[13px] text-ink-dim">{report.verdict}</p>
                <Steps actions={report.runs.flatMap((item) => item.actions ?? [])} />
              </Glass>
            )}
          </>
        )}

        {saved && (
          <p className="rise rounded-xl border border-ok/30 bg-ok-soft px-3 py-2 text-[13px] text-ok">
            Правило «{saved}» сохранено как правило дома. При конфликте с правилом жителя приоритет у него.
          </p>
        )}

        {error && (
          <p className="rounded-xl border border-sev-crit/30 bg-sev-crit-soft px-3 py-2 text-[13px] text-sev-crit">
            {error}
          </p>
        )}
      </div>

      <div className="sticky bottom-0 flex items-end gap-2 bg-base/80 pt-2 pb-1 backdrop-blur">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void ask(text)
            }
          }}
          rows={2}
          placeholder="Например: если лифт встал с людьми — заявку в ЛифтМонтаж немедленно"
          className="scroll-slim glass flex-1 resize-none rounded-2xl px-4 py-3 text-[14px] text-ink outline-none placeholder:text-ink-mute focus:border-accent/50"
        />
        <button
          type="button"
          onClick={() => void ask(text)}
          className="press flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-ink transition hover:brightness-110"
          aria-label="Спросить ассистента"
        >
          <Icon name="arrowRight" size={20} />
        </button>
      </div>
    </div>
  )
}
