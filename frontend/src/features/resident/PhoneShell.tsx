import type { ReactNode } from 'react'

import { Icon } from '../../shared/ui/Icon'
import { navigate } from '../../app/routing'

type PhoneShellProps = {
  children: ReactNode
  tabBar: ReactNode
}

function StatusBar() {
  return (
    <div className="flex items-center justify-between px-6 pt-3 pb-1 text-[13px] font-semibold text-ink">
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
    <div className="flex min-h-screen justify-center bg-base sm:py-8">
      <div className="flex w-full max-w-[420px] flex-col overflow-hidden bg-base sm:h-[880px] sm:rounded-[2.5rem] sm:border sm:border-line-strong sm:shadow-2xl">
        <StatusBar />
        <div className="scroll-slim flex-1 overflow-y-auto">{children}</div>
        {tabBar}
      </div>
      <button
        type="button"
        onClick={() => navigate('/')}
        className="fixed top-5 left-5 hidden items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink-dim transition hover:text-ink lg:flex"
      >
        <Icon name="chevronLeft" size={16} />
        Сменить роль
      </button>
    </div>
  )
}
