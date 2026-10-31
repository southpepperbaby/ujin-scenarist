import { useEffect, useState } from 'react'

import { FALLBACK_DEVICES, FALLBACK_NOTIFICATIONS, FALLBACK_RULES } from '../mock/fallback'
import { useStore } from '../store'

const RETRY_MIN_MS = 3000
const RETRY_MAX_MS = 30_000

/**
 * Поднимает живые данные из бэкенда и держит WebSocket.
 * Если бэкенд недоступен целиком, приложение не падает: показываем демо-набор, говорим об этом
 * и продолжаем стучаться с растущей паузой. Как только бэкенд ответил, выходим из демо сами.
 * Отдельный упавший запрос демо не включает: store.load оставляет его срез прежним и показывает ошибку.
 */
export function useBootstrap(): { demo: boolean } {
  const [demo, setDemo] = useState(false)

  useEffect(() => {
    let disconnect: (() => void) | null = null
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let delay = RETRY_MIN_MS

    const attempt = () => {
      useStore
        .getState()
        .load()
        .then(() => {
          if (cancelled) return
          setDemo(false)
          useStore.setState({ demo: false })
          disconnect = useStore.getState().connect()
        })
        .catch(() => {
          if (cancelled) return
          if (!useStore.getState().demo) {
            setDemo(true)
            // Демо-набор подставляем один раз: повторные попытки не сбрасывают то, что человек уже переключил.
            useStore.setState({
              devices: FALLBACK_DEVICES,
              rules: FALLBACK_RULES,
              notifications: FALLBACK_NOTIFICATIONS,
              events: [],
              loaded: true,
              demo: true,
            })
          }
          timer = setTimeout(attempt, delay)
          delay = Math.min(delay * 2, RETRY_MAX_MS)
        })
    }
    attempt()

    return () => {
      cancelled = true
      clearTimeout(timer)
      disconnect?.()
    }
  }, [])

  return { demo }
}
