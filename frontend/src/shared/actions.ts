import { useEffect } from 'react'

/** Команды, которые можно вызвать из палитры ⌘K, а исполняет открытая страница. */
export type AppAction = 'new-ticket' | 'new-rule' | 'new-device'

const EVENT = 'homie:action'
// Палитра часто сначала переключает страницу: команда ждёт, пока нужная страница смонтируется.
let pending: AppAction | null = null

export function runAction(action: AppAction): void {
  pending = action
  window.dispatchEvent(new CustomEvent<AppAction>(EVENT, { detail: action }))
}

export function useAction(action: AppAction, handler: () => void): void {
  useEffect(() => {
    if (pending === action) {
      pending = null
      handler()
    }
    const listener = (event: Event) => {
      if ((event as CustomEvent<AppAction>).detail !== action) return
      pending = null
      handler()
    }
    window.addEventListener(EVENT, listener)
    return () => window.removeEventListener(EVENT, listener)
  }, [action, handler])
}
