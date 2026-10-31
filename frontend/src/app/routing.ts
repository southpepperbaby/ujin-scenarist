import { useEffect, useState } from 'react'

/** Путь из хэша без query и хвостового слэша: `#/resident/?x=1` → `/resident`. */
function readPath(): string {
  const raw = window.location.hash.replace(/^#/, '').split('?')[0] ?? ''
  if (!raw.startsWith('/')) return '/'
  const trimmed = raw.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

/** Хэш-роутер без зависимостей: приложение открывается по прямой ссылке и работает со статики. */
export function useHashRoute(): string {
  const [path, setPath] = useState(readPath)

  useEffect(() => {
    const onChange = () => setPath(readPath())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return path
}

/** Путь лежит внутри раздела: `/uk/tickets` внутри `/uk`, а `/ukx` — нет. */
export function inSection(path: string, section: string): boolean {
  return path === section || path.startsWith(`${section}/`)
}

/** Хвост пути после раздела, раскодированный: `/resident/scenarios/a%20b` → `a b`. */
export function tail(path: string, section: string): string | null {
  if (!path.startsWith(`${section}/`)) return null
  const rest = path.slice(section.length + 1)
  try {
    return decodeURIComponent(rest)
  } catch {
    return rest
  }
}

export function href(to: string): string {
  return `#${to}`
}

export function navigate(to: string): void {
  window.location.hash = to
}

/** Ссылка на правило с безопасным id. */
export function scenarioPath(id: string): string {
  return `/resident/scenarios/${encodeURIComponent(id)}`
}

// Сколько переходов сделано внутри приложения: только тогда history.back() не уведёт с сайта.
let inAppSteps = 0
window.addEventListener('hashchange', () => {
  inAppSteps += 1
})

/** «Назад» по истории, если пришли изнутри приложения; по прямой ссылке — на указанный экран. */
export function goBack(fallback: string): void {
  if (inAppSteps > 0) {
    inAppSteps -= 2 // back сам вызовет hashchange и вернёт счётчик на шаг назад
    window.history.back()
    return
  }
  navigate(fallback)
}
