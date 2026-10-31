import { useEffect, useState } from 'react'

import { Button } from './Button'

/** Мелкая «Убрать» у строки формы: условие, действие, сигнал, поведение. */
export function RemoveButton({ onClick, label = 'Убрать' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="rounded-lg px-2 py-1 text-meta text-ink-mute transition hover:bg-sev-crit-soft hover:text-sev-crit"
    >
      Убрать
    </button>
  )
}

/**
 * Удаление в два шага: первый клик взводит, второй удаляет. Через 4 секунды кнопка остывает сама.
 * Без браузерного confirm(): он блокирует страницу и плохо выглядит.
 */
export function ConfirmDeleteButton({
  onConfirm,
  label = 'Удалить',
  busy,
}: {
  onConfirm: () => void
  label?: string
  busy?: boolean
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(timer)
  }, [armed])

  if (armed) {
    return (
      <Button
        variant="danger"
        busy={busy}
        onClick={() => {
          setArmed(false)
          onConfirm()
        }}
      >
        Да, удалить
      </Button>
    )
  }
  return (
    <Button variant="ghost" className="text-sev-crit" onClick={() => setArmed(true)} label={label === 'Удалить' ? undefined : label}>
      Удалить
    </Button>
  )
}
