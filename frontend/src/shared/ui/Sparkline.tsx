type SparklineProps = {
  values: number[]
  /** Цвет линии и заливки — currentColor, задаётся классом text-*. */
  className?: string
  label: string
}

const W = 120
const H = 32

/**
 * Мини-график тренда в KPI: линия с мягкой заливкой, последняя точка выделена.
 * Чистый SVG без библиотеки — для десятка точек ничего больше не нужно.
 */
export function Sparkline({ values, className = '', label }: SparklineProps) {
  if (values.length < 2) return null
  const max = Math.max(...values, 1)
  const step = W / (values.length - 1)
  const points = values.map((value, index) => [index * step, H - 2 - (value / max) * (H - 6)] as const)
  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${W},${H} L0,${H} Z`
  const [lastX, lastY] = points[points.length - 1] ?? [0, H]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={`h-8 w-full ${className}`} role="img" aria-label={label}>
      <path d={area} fill="currentColor" opacity={0.12} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lastX} cy={lastY} r={2.4} fill="currentColor" />
    </svg>
  )
}
