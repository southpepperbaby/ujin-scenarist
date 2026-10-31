import { useState } from 'react'

import { navigate } from '../../app/routing'
import { api, type Compiled } from '../../api'
import { useStore } from '../../store'
import { ConfirmCard } from '../../shared/rule/ConfirmCard'
import { Icon } from '../../shared/ui/Icon'
import { TypingDots } from '../../shared/ui/TypingDots'

const EXAMPLES = [
  'Если ночью на кухне протечка, перекрой воду и включи свет в коридоре',
  'Если в спальне холоднее 18 градусов, напиши мне',
  'Если сработал пожарный датчик, включи свет в коридоре и напиши мне',
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

/**
 * Главный вход в сценарии: разговор, а не форма. Правило собирает LLM, проверяет линтер,
 * житель видит пересказ из JSON и отвечает «да, подтвердить» или «нет, дополнить промпт».
 */
export function ScenarioChat() {
  const reload = useStore((state) => state.reloadRules)
  const [text, setText] = useState('')
  const [asked, setAsked] = useState<string[]>([])
  const [previous, setPrevious] = useState<string | undefined>()
  const [result, setResult] = useState<Compiled | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onCompile = async () => {
    const query = text.trim()
    if (query.length === 0) return
    setBusy(true)
    setAsked((items) => [...items, query])
    setText('')
    setError(null)
    setDone(null)
    setResult(null)
    try {
      const out = await api.compile(query, 'resident', previous)
      setResult(out)
      setPrevious(out.text ?? (previous ? `${previous}\nУточнение: ${query}` : query))
    } catch (cause) {
      setError(`Не получилось разобрать: ${(cause as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const onConfirm = async () => {
    if (!result?.rule) return
    setBusy(true)
    try {
      const res = await api.confirm(result.rule, 'resident')
      await reload()
      setResult(null)
      setPrevious(undefined)
      setAsked([])
      if (res.kind === 'rule' && res.rule) navigate(`/resident/scenarios/${res.rule.id}`)
      else setDone('Готово, выполнено.')
    } catch (cause) {
      setError(`Не удалось: ${(cause as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const onRefine = () => {
    // Прошлая просьба остаётся: житель дописывает только то, что понято не так.
    setResult(null)
    setError(null)
  }

  const reset = () => {
    setResult(null)
    setPrevious(undefined)
    setAsked([])
    setError(null)
    setDone(null)
  }

  return (
    <section className="space-y-3">
      <Bubble>Опишите правило словами. Я соберу его и перескажу, что именно будет работать, а вы подтвердите.</Bubble>

      {asked.length === 0 && (
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

      {asked.map((item, index) => (
        <Bubble key={`${index}-${item}`} mine>
          {item}
        </Bubble>
      ))}

      {busy && (
        <div className="glass inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-ink-dim">
          <TypingDots />
        </div>
      )}

      {result?.answer && <Bubble>{result.answer}</Bubble>}
      {result?.error && <Bubble>{`Не получилось собрать правило: ${result.error}. Уточните просьбу.`}</Bubble>}
      {result?.rule && <ConfirmCard result={result} busy={busy} onConfirm={() => void onConfirm()} onRefine={onRefine} />}

      {previous && !result && !busy && (
        <p className="text-[12px] text-ink-mute">
          Напишите, что уточнить, или{' '}
          <button type="button" onClick={reset} className="underline hover:text-ink">
            начните заново
          </button>
          .
        </p>
      )}

      {done && <p className="rounded-xl border border-ok/30 bg-ok-soft px-3 py-2 text-[13px] text-ok">{done}</p>}

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
          placeholder={previous ? 'Что уточнить? Например: только ночью' : 'Например: если ночью протечка, перекрой воду'}
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
