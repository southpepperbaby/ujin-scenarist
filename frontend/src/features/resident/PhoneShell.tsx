import type { ReactNode } from 'react'

import { navigate } from '../../app/routing'
import { Aurora } from '../../shared/ui/Aurora'
import { Icon } from '../../shared/ui/Icon'

type PhoneShellProps = {
  children: ReactNode
  tabBar: ReactNode
}

function StatusBar() {
  return (
    <div className="relative z-10 flex items-center justify-between px-6 pt-3 pb-1 text-[13px] font-semibold">
      <span>9:41</span>
      <div className="flex items-center gap-1.5 text-ink-dim">
        <Icon name="activity" size={14} />
        <Icon name="battery" size={16} />
      </div>
    </div>
  )
}

/** Телефонная рамка: на большом экране — макет устройства, на телефоне — весь вьюпорт. */
export function PhoneShell({ children, tabBar }: PhoneShellProps) {
  return (
    <div className="relative flex min-h-screen justify-center overflow-hidden bg-canvas sm:py-8">
      <Aurora intensity="bold" />
      <div className="relative flex w-full max-w-[420px] flex-col overflow-hidden bg-canvas/60 sm:h-[880px] sm:rounded-[2.5rem] sm:border sm:border-line-strong sm:shadow-2xl">
        <Aurora />
        <StatusBar />
        <div className="scroll-slim relative z-10 flex-1 overflow-y-auto">{children}</div>
        <div className="relative z-10">{tabBar}</div>
      </div>
      <button
        type="button"
        onClick={() => navigate('/')}
        className="glass press fixed top-5 left-5 hidden items-center gap-2 rounded-xl px-3 py-2 text-sm text-ink-dim transition hover:text-ink lg:flex"
      >
        <Icon name="chevronLeft" size={16} />
        Сменить роль
      </button>
    </div>
  )
}
