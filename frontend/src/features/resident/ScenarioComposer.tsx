import { useState } from 'react'

import { navigate } from '../../app/routing'
import { api, type CompiledRule } from '../../api'
import { useStore } from '../../store'
import { Button } from '../../shared/ui/Button'
import { Icon } from '../../shared/ui/Icon'
import { RuleBlock } from './RuleBlock'
import { ScreenHeader } from './ScreenHeader'
import { ruleLines } from './rule-lines'

const EXAMPLES = [
  'Если ночью на кухне протечка — перекрой воду и включи свет в коридоре',
  'Когда открываю окно в спальне, выключай отопление',
  'Если пошёл дым — открой шлагбаум и сообщи УК',
]

function Bubble({ children, mine = false }: { children: string; mine?: boolean }) {
  return (
    <div
      className={`max-w-[88%] rounded-2xl px-4 py-3 text-[14px] leading-snug whitespace-pre-line ${
        mine ? 'ml-auto bg-accent text-accent-ink' : 'bg-surface text-ink'
      }`}
    >
      {children}
    </div>
  )
}

function LinterReport({ result }: { result: CompiledRule }) {
  const lint = result.lint
  if (!lint) return null
  const tone = lint.ok ? 'border-ok/30 bg-ok-soft/50 text-ok' : 'border-sev-crit/30 bg-sev-crit-soft text-sev-crit'
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <p className="flex items-center gap-2 text-[11px] font-semibold tracking-widest">
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
    </div>
  )
}

export function ScenarioComposer() {
  const reload = useStore((state) => state.reloadRules)
  const devices = useStore((state) => state.devices)
  const [text, setText] = useState('')
  const [result, setResult] = useState<CompiledRule | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onCompile = async () => {
    if (text.trim().length === 0) return
    setBusy(true)
    setError(null)
    try {
      setResult(await api.compile(text, 'resident'))
    } catch (cause) {
      setError(`Не удалось разобрать просьбу: ${(cause as Error).message}`)
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
    <div className="flex min-h-full flex-col pb-6">
      <ScreenHeader title="Новое правило" back="/resident/scenarios" />

      <div className="flex-1 space-y-3 px-5 pt-4">
        <Bubble>
          Опишите правило обычными словами. Я соберу его по схеме, проверю линтером и покажу, что понял.
        </Bubble>

        {!result && !busy && (
          <div className="space-y-2 pt-1">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setText(example)}
                className="w-full rounded-xl border border-line bg-raised/60 px-3.5 py-2.5 text-left text-[13px] text-ink-dim transition hover:text-ink"
              >
                {example}
              </button>
            ))}
          </div>
        )}

        {busy && <Bubble>Думаю…</Bubble>}

        {result && (
          <>
            <Bubble mine>{text}</Bubble>
            {result.answer && <Bubble>{result.answer}</Bubble>}
            {lines && result.rule && (
              <>
                <Bubble>{`Вот что я понял: «${result.rule.title}»`}</Bubble>
                <RuleBlock kind="when" lines={lines.when} />
                <RuleBlock kind="if" lines={lines.conditions} />
                <RuleBlock kind="then" lines={lines.actions} />
                <LinterReport result={result} />
                <div className="flex gap-2.5 pt-1">
                  <Button variant="primary" icon="check" className="flex-1" onClick={() => void onSave()}>
                    Сохранить правило
                  </Button>
                  <Button variant="ghost" onClick={() => setResult(null)}>
                    Переписать
                  </Button>
                </div>
              </>
            )}
          </>
        )}

        {error && (
          <p className="rounded-xl border border-sev-crit/30 bg-sev-crit-soft px-3 py-2 text-[13px] text-sev-crit">
            {error}
          </p>
        )}
      </div>

      {!result && (
        <div className="sticky bottom-0 flex items-end gap-2 border-t border-line bg-base/95 px-4 py-3 backdrop-blur">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={2}
            placeholder="Например: если ночью протечка — перекрой воду"
            className="scroll-slim flex-1 resize-none rounded-xl border border-line bg-field px-3.5 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink-mute focus:border-accent/60"
          />
          <button
            type="button"
            onClick={() => void onCompile()}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-ink transition hover:brightness-110"
            aria-label="Разобрать правило"
          >
            <Icon name="arrowRight" size={20} />
          </button>
        </div>
      )}
    </div>
  )
}
