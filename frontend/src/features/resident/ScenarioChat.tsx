import { useState } from 'react'

import type { Confirmed } from '../../api'

import { navigate } from '../../app/routing'
import { CheckResult } from '../../shared/rule/CheckResult'
import { ConfirmCard } from '../../shared/rule/ConfirmCard'
import { useRuleChat } from '../../shared/rule/use-rule-chat'
import { Bubble } from '../../shared/ui/Bubble'
import { Icon } from '../../shared/ui/Icon'
import { TypingDots } from '../../shared/ui/TypingDots'

/**
 * Главный вход в сценарии: разговор, а не форма. Правило собирает LLM, проверяет линтер,
 * житель видит пересказ из JSON и отвечает «да, подтвердить» или «нет, дополнить промпт».
 */
export function ScenarioChat() {
  const { text, setText, asked, previous, result, error, busy, send, confirm, refine, reset } = useRuleChat('resident')
  const [done, setDone] = useState<string | null>(null)
  const [checked, setChecked] = useState<Confirmed | null>(null)

  const onCompile = async () => {
    setDone(null)
    setChecked(null)
    await send()
  }

  // «Да» у правила сразу запускает прогон на копии дома: итог показываем тут же, в чате.
  const onConfirm = async () => {
    const res = await confirm()
    if (!res) return
    if (res.kind === 'rule') setChecked(res)
    else {
      reset()
      setDone('Готово, выполнено.')
    }
  }

  return (
    <div className="space-y-3">
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
      {result?.rule && <ConfirmCard result={result} busy={busy} onConfirm={() => void onConfirm()} onRefine={refine} />}

      {previous && !result && !busy && (
        <p className="text-[12px] text-ink-mute">
          Напишите, что уточнить, или{' '}
          <button type="button" onClick={() => { reset(); setDone(null); setChecked(null) }} className="underline hover:text-ink">
            начните заново
          </button>
          .
        </p>
      )}

      {checked && (
        <CheckResult
          res={checked}
          action={
            checked.rule && (
              <button
                type="button"
                onClick={() => navigate(`/resident/scenarios/${checked.rule?.id}`)}
                className="text-[13px] text-accent underline"
              >
                Открыть правило
              </button>
            )
          }
        />
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
          placeholder={previous ? 'Что уточнить? Например: только ночью' : 'Опишите правило словами, я соберу и проверю'}
          className="scroll-slim glass flex-1 resize-none rounded-2xl px-3.5 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink-mute focus:border-accent/50"
        />
        <button
          type="button"
          onClick={() => void onCompile()}
          disabled={busy}
          className="press flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-ink transition hover:brightness-110"
          aria-label="Разобрать правило"
        >
          <Icon name="arrowRight" size={20} />
        </button>
      </div>
    </div>
  )
}
