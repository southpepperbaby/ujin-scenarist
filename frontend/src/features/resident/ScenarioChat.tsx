import { useState } from 'react'

import { navigate } from '../../app/routing'
import { api, type CompiledRule } from '../../api'
import { useStore } from '../../store'
import { Button } from '../../shared/ui/Button'
import { Glass } from '../../shared/ui/Glass'
import { Icon } from '../../shared/ui/Icon'
import { TypingDots } from '../../shared/ui/TypingDots'
import { RuleBlock } from '../../shared/rule/RuleBlock'
import { ruleLines } from '../../shared/rule/rule-lines'

const EXAMPLES = [
  'Если ночью на кухне протечка — перекрой воду и включи свет в коридоре',
  'Когда открываю окно в спальне, выключай отопление',
  'Если пошёл дым — открой шлагбаум и сообщи УК',
]

function Bubble({ children, mine = false }: { children: React.ReactNode; mine?: boolean }) {
  return (
    <div
      className={`rise max-w-[88%] rounded-2xl px-4 py-3 text-[14px] leading-snug whitespace-pre-line ${
        mine ? 'ml-auto bg-accent text-accent-ink' : 'glass text-ink'
      }`}
    >
      {children}
    </div>
  )
}

function LinterReport({ result }: { result: CompiledRule }) {
  const lint = result.lint
  if (!lint) return null
  const tone = lint.ok ? 'text-ok' : 'text-sev-crit'
  return (
    <Glass className="rise p-4">
      <p className={`flex items-center gap-2 text-[11px] font-semibold tracking-widest ${tone}`}>
        <Icon name="shield" size={14} />
        ЛИНТЕР
      </p>
      <p className="mt-2 text-[13px] text-ink-dim">
        {lint.ok
          ? `Ошибок нет, предупреждений ${lint.warnings}.`
          : `Ошибок ${lint.errors}, предупреждений ${lint.warnings}.`}
      </p>
      <ul className="mt-2 space-y-1">
        {lint.issues.map((issue) => (
          <li key={`${issue.code}-${issue.message}`} className="text-[12px] text-ink-dim">
            · {issue.message}
          </li>
        ))}
      </ul>
    </Glass>
  )
}

/** Главный вход в сценарии: разговор, а не форма. Правило собирает LLM, проверяет линтер. */
export function ScenarioChat() {
  const reload = useStore((state) => state.reloadRules)
  const devices = useStore((state) => state.devices)
  const [text, setText] = useState('')
  const [sent, setSent] = useState<string | null>(null)
  const [result, setResult] = useState<CompiledRule | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onCompile = async () => {
    const query = text.trim()
    if (query.length === 0) return
    setBusy(true)
    setSent(query)
    setError(null)
    setResult(null)
    try {
      setResult(await api.compile(query, 'resident'))
      setText('')
    } catch (cause) {
      setError(`Не получилось разобрать: ${(cause as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const onSave = async () => {
    if (!result?.rule) return
    setBusy(true)
    try {
      const saved = await api.createRule(result.rule)
      await reload()
      navigate(`/resident/scenarios/${saved.id}`)
    } catch (cause) {
      setError(`Не удалось сохранить правило: ${(cause as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const lines = result?.rule ? ruleLines(result.rule, devices) : null

  return (
    <section className="space-y-3">
      <Bubble>Опишите правило словами — соберу его по схеме, проверю линтером и покажу, что понял.</Bubble>

      {!sent && (
        <div className="space-y-2">
          {EXAMPLES.map((example, index) => (
            <button
              key={example}
              type="button"
              onClick={() => setText(example)}
              style={{ '--i': index } as React.CSSProperties}
              className="rise press w-full rounded-xl border border-line bg-raised/50 px-3.5 py-2.5 text-left text-[13px] text-ink-dim transition hover:border-accent/40 hover:text-ink"
            >
              {example}
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

      {result?.answer && <Bubble>{result.answer}</Bubble>}

      {lines && result?.rule && (
        <>
          <Bubble>{`Вот что я понял: «${result.rule.title}»`}</Bubble>
          <RuleBlock kind="when" lines={lines.when} />
          <RuleBlock kind="if" lines={lines.conditions} />
          <RuleBlock kind="then" lines={lines.actions} />
          <LinterReport result={result} />
          <div className="flex gap-2.5">
            <Button variant="primary" icon="check" className="flex-1" onClick={() => void onSave()}>
              Сохранить правило
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setResult(null)
                setSent(null)
              }}
            >
              Ещё раз
            </Button>
          </div>
        </>
      )}

      {error && (
        <p className="rounded-xl border border-sev-crit/30 bg-sev-crit-soft px-3 py-2 text-[13px] text-sev-crit">
          {error}
        </p>
      )}

      <div className="flex items-end gap-2 pt-1">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void onCompile()
            }
          }}
          rows={2}
          placeholder="Например: если ночью протечка — перекрой воду"
          className="scroll-slim glass flex-1 resize-none rounded-2xl px-3.5 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink-mute focus:border-accent/50"
        />
        <button
          type="button"
          onClick={() => void onCompile()}
          className="press flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-ink transition hover:brightness-110"
          aria-label="Разобрать правило"
        >
          <Icon name="arrowRight" size={20} />
        </button>
      </div>
    </section>
  )
}
