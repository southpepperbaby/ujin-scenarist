import { useEffect, useState } from 'react'

import {
  FALLBACK_DEVICES,
  FALLBACK_NOTIFICATIONS,
  FALLBACK_RULES,
} from '../mock/fallback'
import { useStore } from '../store'

/**
 * Поднимает живые данные из бэкенда и держит WebSocket.
 * Если бэкенд недоступен целиком, приложение не падает: показываем демо-набор и говорим об этом.
 * Отдельный упавший запрос демо не включает: store.load оставляет его срез прежним и показывает ошибку.
 */
export function useBootstrap(): { demo: boolean } {
  const [demo, setDemo] = useState(false)

  useEffect(() => {
    let disconnect: (() => void) | null = null
    let cancelled = false

    useStore
      .getState()
      .load()
      .then(() => {
        if (cancelled) return
        setDemo(false)
        disconnect = useStore.getState().connect()
      })
      .catch(() => {
        if (cancelled) return
        setDemo(true)
        useStore.setState({
          devices: FALLBACK_DEVICES,
          rules: FALLBACK_RULES,
          notifications: FALLBACK_NOTIFICATIONS,
          events: [],
        })
      })

    return () => {
      cancelled = true
      disconnect?.()
    }
  }, [])

  return { demo }
}
