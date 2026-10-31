import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import { Icon } from './Icon'

type ModalProps = {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
  /** В форме есть несохранённое: Esc и клик мимо окна сначала спрашивают, а не выбрасывают ввод. */
  dirty?: boolean
}

/**
 * Окно поверх страницы на нативном <dialog>: фокус заперт внутри, фон inert, Esc закрывает,
 * фокус возвращается туда, откуда окно открыли. Заголовок, прокручиваемое тело и панель кнопок.
 */
export function Modal({ title, onClose, children, footer, wide = false, dirty = false }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [asking, setAsking] = useState(false)
  // Закрываем по клику на фон, только если и нажатие, и отпускание были на фоне:
  // выделение текста в поле, ушедшее за край окна, форму не теряет.
  const downOnBackdrop = useRef(false)

  // До отрисовки: окно не мелькает обычным блоком посреди страницы.
  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const opener = document.activeElement as HTMLElement | null
    dialog.showModal()
    const root = document.documentElement
    const overflow = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      dialog.close()
      root.style.overflow = overflow
      opener?.focus?.()
    }
  }, [])

  const requestClose = () => {
    if (dirty && !asking) {
      setAsking(true)
      return
    }
    onClose()
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        requestClose()
      }}
      onClose={() => {
        // Окно закрыл браузер, а не мы (мы закрываем только при размонтировании): синхронизируем состояние.
        if (ref.current?.isConnected) onClose()
      }}
      onMouseDown={(event) => {
        downOnBackdrop.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        if (downOnBackdrop.current && event.target === event.currentTarget) requestClose()
        downOnBackdrop.current = false
      }}
      className={`m-auto hidden max-h-[90dvh] w-[calc(100%-2rem)] flex-col overflow-hidden rounded-2xl border border-line-strong bg-surface p-0 open:flex text-ink shadow-2xl backdrop:bg-black/55 backdrop:backdrop-blur-sm ${
        wide ? 'max-w-3xl' : 'max-w-md'
      }`}
    >
      <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h2 id={titleId} className="text-lead font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={requestClose}
          aria-label="Закрыть"
          className="rounded-lg p-1 text-ink-mute transition hover:bg-raised hover:text-ink"
        >
          <Icon name="close" size={18} />
        </button>
      </header>
      {asking && (
        <div
          role="alert"
          className="flex items-center gap-3 border-b border-sev-minor/30 bg-sev-minor-soft px-5 py-2.5 text-body text-sev-minor"
        >
          <span className="flex-1">Изменения не сохранены. Закрыть всё равно?</span>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 font-semibold hover:bg-canvas/40">
            Закрыть
          </button>
          <button type="button" onClick={() => setAsking(false)} className="rounded-lg px-2 py-1 hover:bg-canvas/40">
            Остаться
          </button>
        </div>
      )}
      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer && <footer className="flex items-center gap-2 border-t border-line px-5 py-3.5">{footer}</footer>}
    </dialog>
  )
}
