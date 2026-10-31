import { useEffect, useState } from 'react'

function readPath(): string {
  const raw = window.location.hash.replace(/^#/, '')
  return raw.startsWith('/') ? raw : '/'
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

export function navigate(to: string): void {
  window.location.hash = to
}
