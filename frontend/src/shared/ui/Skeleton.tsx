/** Заглушка формы контента, пока идёт первая загрузка: раскладка не прыгает, пустота не врёт. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-raised/80 ${className}`} aria-hidden="true" />
}

export function SkeletonList({ count = 3, className = 'h-16' }: { count?: number; className?: string }) {
  return (
    <div className="space-y-2.5" role="status">
      <span className="sr-only">Загружаем…</span>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className={className} />
      ))}
    </div>
  )
}
