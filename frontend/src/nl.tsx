import { useState } from 'react'
import { api, type Compiled, type Role } from './api'
import { guard, useStore } from './store'
import { Badge, Button, Card, cx } from './ui'

/**
 * Правило одной фразой. Одинаково для жителя и УК:
 * 1) человек пишет просьбу, 2) LLM собирает правило, 3) система пересказывает собранное правило
 * своими словами (пересказ строится из JSON, а не из ответа модели), 4) «да, подтвердить» или
 * «нет, дополнить промпт». Без подтверждения ничего не сохраняется и не выполняется.
 */
export function RuleFromText({ role, compact }: { role: Role; compact?: boolean }) {
  const reload = useStore((s) => s.reloadRules)
  const [text, setText] = useState('')
  const [previous, setPrevious] = useState<string | undefined>()
  const [draft, setDraft] = useState<Compiled | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const compile = async () => {
    if (!text.trim()) return
    setBusy(true)
    setDone(null)
    const out = await guard(api.compile(text.trim(), role, previous))
    setBusy(false)
    if (!out) return
    setDraft(out)
    setPrevious(out.text ?? text.trim())
    setText('')
  }

  const confirm = async () => {
    if (!draft?.rule) return
    setBusy(true)
    const res = await guard(api.confirm(draft.rule, role))
    setBusy(false)
    if (!res) return
    if (res.kind === 'command') setDone('Выполнено.')
    else setDone(res.lint?.ok ? 'Правило добавлено и включено.' : 'Правило сохранено черновиком: ' + firstError(res.lint?.issues))
    setDraft(null)
    setPrevious(undefined)
    reload()
  }

  const refine = () => {
    // Карточка уходит, прошлая просьба остаётся: человек дописывает только уточнение.
    setDraft(null)
    setDone(null)
  }

  const errors = draft?.lint?.issues.filter((i) => i.level !== 'info') ?? []
  return (
    <Card className={cx('space-y-3', compact ? 'p-3' : 'p-4')}>
      {!draft && (
        <>
          {previous && (
            <div className="rounded-lg bg-slate-50 p-2 text-xs text-slate-500">
              Ваша просьба: «{previous}». Допишите, что уточнить.
            </div>
          )}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                compile()
              }
            }}
            rows={compact ? 2 : 3}
            placeholder={previous ? 'Например: только ночью' : 'Опишите, что должно происходить. Например: если протечка, перекрой воду и напиши мне'}
            className="w-full resize-none rounded-lg bg-white p-2 text-sm ring-1 ring-inset ring-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" disabled={busy || !text.trim()} onClick={compile}>
              {busy ? 'Собираю…' : previous ? 'Пересобрать' : 'Собрать правило'}
            </Button>
            {previous && (
              <Button variant="ghost" size="sm" onClick={() => setPrevious(undefined)}>
                Начать заново
              </Button>
            )}
          </div>
          {done && <div className="text-sm text-emerald-700">{done}</div>}
        </>
      )}

      {draft && (draft.error || draft.answer) && (
        <>
          <div className="text-sm">{draft.answer ?? `Не получилось: ${draft.error}`}</div>
          <Button size="sm" onClick={refine}>
            {draft.answer ? 'Понятно' : 'Нет, дополнить промпт'}
          </Button>
        </>
      )}

      {draft?.rule && (
        <>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {draft.rule.trigger.device_id === '__now__' ? 'Будет выполнено' : 'Будет добавлено правило'}
          </div>
          <div className="text-sm leading-relaxed">{draft.explanation}</div>
          {errors.length > 0 && (
            <div className="space-y-1">
              {errors.map((i) => (
                <div key={i.code + i.message} className="flex gap-2 text-xs">
                  <Badge tone={i.level === 'error' ? 'red' : 'amber'}>{i.level === 'error' ? 'ошибка' : 'внимание'}</Badge>
                  <span className="text-slate-600">{i.message}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" disabled={busy} onClick={confirm}>
              Да, подтвердить
            </Button>
            <Button size="sm" disabled={busy} onClick={refine}>
              Нет, дополнить промпт
            </Button>
          </div>
        </>
      )}
    </Card>
  )
}

function firstError(issues?: { level: string; message: string }[]) {
  return issues?.find((i) => i.level === 'error')?.message ?? 'есть замечания линтера'
}
