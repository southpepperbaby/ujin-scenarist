import { useEffect, useRef, useState } from 'react'

const DURATION_MS = 700

type CounterProps = {
  value: number
  suffix?: string
}

/** Число, которое доезжает до нового значения, а не прыгает. */
export function Counter({ value, suffix = '' }: CounterProps) {
  const [shown, setShown] = useState(value)
  const fromRef = useRef(value)

  useEffect(() => {
    const from = fromRef.current
    if (from === value) return
    let frame = 0
    const started = performance.now()

    const tick = (now: number) => {
      const progress = Math.min((now - started) / DURATION_MS, 1)
      const eased = 1 - (1 - progress) ** 3
      setShown(Math.round(from + (value - from) * eased))
      if (progress < 1) frame = requestAnimationFrame(tick)
      else fromRef.current = value
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])

  return (
    <span className="tabular-nums">
      {shown}
      {suffix}
    </span>
  )
}
