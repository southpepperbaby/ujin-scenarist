import { useState } from 'react'

import { api, type Compiled, type Confirmed, type Role } from '../../api'
import { useStore } from '../../store'

/**
 * Общий поток чата правил для жителя и УК: просьба → правило по схеме → карточка пересказа →
 * «да, подтвердить» или «нет, дополнить промпт». Уточнение склеивается с прошлой просьбой на бэкенде.
 * Экран добавляет своё поверх: житель переходит к правилу, УК показывает итог и прогон.
 */
export function useRuleChat(role: Role) {
  const reloadRules = useStore((state) => state.reloadRules)
  const [text, setText] = useState('')
  const [asked, setAsked] = useState<string[]>([])
  const [previous, setPrevious] = useState<string | undefined>()
  const [result, setResult] = useState<Compiled | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /** Обёртка для любого запроса экрана: одна занятость и одна строка ошибки на весь чат. */
  const withBusy = async <T,>(work: () => Promise<T>, failure: string): Promise<T | null> => {
    if (busy) return null
    setBusy(true)
    setError(null)
    try {
      return await work()
    } catch (cause) {
      setError(`${failure}: ${(cause as Error).message}`)
      return null
    } finally {
      setBusy(false)
    }
  }

  const send = async (raw: string = text) => {
    const query = raw.trim()
    if (query.length === 0 || busy) return
    setAsked((items) => (previous ? [...items, query] : [query]))
    setText('')
    setResult(null)
    const out = await withBusy(() => api.compile(query, role, previous), 'Не получилось разобрать')
    if (!out) return
    setResult(out)
    // На вопрос о доме уточнять нечего; правило и ошибку сборки можно дополнить следующей репликой.
    setPrevious(out.answer ? undefined : (out.text ?? (previous ? `${previous}\nУточнение: ${query}` : query)))
  }

  const confirm = async (): Promise<Confirmed | null> => {
    const rule = result?.rule
    if (!rule) return null
    const res = await withBusy(() => api.confirm({ ...rule, owner: role }, role), 'Не удалось')
    if (!res) return null
    setResult(null)
    setPrevious(undefined)
    if (res.kind === 'rule') await reloadRules()
    return res
  }

  /** «Нет, дополнить промпт»: прошлая просьба остаётся, человек дописывает только уточнение. */
  const refine = () => {
    setResult(null)
    setError(null)
  }

  const reset = () => {
    setResult(null)
    setPrevious(undefined)
    setAsked([])
    setError(null)
  }

  return { text, setText, asked, previous, result, error, busy, send, confirm, refine, reset, withBusy }
}
