import { useEffect, useRef, type ReactNode } from 'react'

import { href } from '../../app/routing'
import { Aurora } from '../../shared/ui/Aurora'
import { Icon } from '../../shared/ui/Icon'

type PhoneShellProps = {
  path: string
  children: ReactNode
  tabBar: ReactNode
}

/** Декоративный статус-бар макета: скринридеру он ни к чему. */
function StatusBar() {
  return (
    <div
      className="relative z-10 hidden items-center justify-between px-6 pt-3 pb-1 text-body font-semibold sm:flex"
      aria-hidden="true"
    >
      <span>9:41</span>
      <div className="flex items-center gap-1.5 text-ink-dim">
        <Icon name="activity" size={14} />
        <Icon name="battery" size={16} />
      </div>
    </div>
  )
}

/** Телефонная рамка: на большом экране — макет устройства, на телефоне — весь вьюпорт. */
export function PhoneShell({ path, children, tabBar }: PhoneShellProps) {
  const scroller = useRef<HTMLElement>(null)

  // Новый экран открывается сверху, а фокус встаёт на его начало: так ведут себя нативные приложения.
  useEffect(() => {
    const node = scroller.current
    if (!node) return
    node.scrollTo({ top: 0 })
    node.focus({ preventScroll: true })
  }, [path])

  return (
    <div className="relative flex min-h-dvh justify-center overflow-hidden bg-canvas sm:py-8">
      <Aurora intensity="bold" />
      <div className="relative flex h-dvh w-full max-w-[420px] flex-col overflow-hidden bg-canvas/60 sm:h-[min(880px,calc(100dvh-4rem))] sm:rounded-[2.5rem] sm:border sm:border-line-strong sm:shadow-2xl">
        <StatusBar />
        <main
          ref={scroller}
          tabIndex={-1}
          className="scroll-slim relative z-10 flex-1 overflow-y-auto outline-none"
        >
          {children}
        </main>
        <div className="relative z-10 pb-[env(safe-area-inset-bottom)]">{tabBar}</div>
      </div>
      <a
        href={href('/')}
        className="glass press fixed top-5 left-5 hidden items-center gap-2 rounded-xl px-3 py-2 text-sm text-ink-dim transition hover:text-ink lg:flex"
      >
        <Icon name="chevronLeft" size={16} />
        Сменить роль
      </a>
    </div>
  )
}
