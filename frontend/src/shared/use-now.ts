import { useEffect, useState } from 'react'

/** Текущее время, обновляемое раз в interval: «осталось N мин» по SLA тикает само. */
export function useNow(interval = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(timer)
  }, [interval])
  return now
}
