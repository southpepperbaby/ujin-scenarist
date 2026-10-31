import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

const KEY = 'homie.theme'
const listeners = new Set<() => void>()

function initial(): Theme {
  const saved = localStorage.getItem(KEY)
  // Светлая — по умолчанию, даже при тёмной теме системы: тёмную человек включает сам, выбор запоминается.
  return saved === 'dark' ? 'dark' : 'light'
}

let theme: Theme = initial()
document.documentElement.dataset.theme = theme

export function setTheme(next: Theme): void {
  theme = next
  localStorage.setItem(KEY, next)
  document.documentElement.dataset.theme = next
  listeners.forEach((listener) => listener())
}

export function toggleTheme(): void {
  setTheme(theme === 'dark' ? 'light' : 'dark')
}

/** Тема на <html data-theme>: токены в index.css подменяются целиком, выбор помнится между визитами. */
export function useTheme(): Theme {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => theme,
  )
}
