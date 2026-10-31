import { goBack } from '../../app/routing'
import { Icon } from '../../shared/ui/Icon'

type ScreenHeaderProps = {
  title: string
  back: string
}

export function ScreenHeader({ title, back }: ScreenHeaderProps) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-canvas/90 px-4 py-3 backdrop-blur">
      <button
        type="button"
        onClick={() => goBack(back)}
        className="flex size-9 items-center justify-center rounded-xl bg-raised text-ink-dim transition hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
        aria-label="Назад"
      >
        <Icon name="chevronLeft" size={18} />
      </button>
      <h1 className="truncate text-title">{title}</h1>
    </header>
  )
}
