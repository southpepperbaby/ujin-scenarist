type StatusPillProps = {
  label: string
  className: string
}

export function StatusPill({ label, className }: StatusPillProps) {
  return (
    <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-caption font-medium ${className}`}>
      {label}
    </span>
  )
}
