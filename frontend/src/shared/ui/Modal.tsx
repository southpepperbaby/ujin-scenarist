import { useEffect, type ReactNode } from 'react'

import { Icon } from './Icon'

type ModalProps = {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}

/** Окно поверх страницы: заголовок, прокручиваемое тело и панель кнопок внизу. */
export function Modal({ title, onClose, children, footer, wide = false }: ModalProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-2xl ${
          wide ? 'max-w-3xl' : 'max-w-md'
        }`}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="rounded-lg p-1 text-ink-mute transition hover:bg-raised hover:text-ink"
          >
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex items-center gap-2 border-t border-line px-5 py-3.5">{footer}</footer>}
      </div>
    </div>
  )
}
