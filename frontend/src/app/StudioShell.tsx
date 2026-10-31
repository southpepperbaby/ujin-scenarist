import type { ReactNode } from 'react'

import { Icon } from '../shared/ui/Icon'
import { navigate } from './routing'

/**
 * Студия (конструктор устройств и редактор правил) пока в светлой теме:
 * это инструмент интегратора, он живёт на отдельном экране и не смешивается с двумя ролями.
 */
export function StudioShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900">
      <header className="sticky top-0 z-40 flex items-center gap-4 border-b border-slate-200 bg-white/90 px-5 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => navigate('/uk')}
          className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:text-slate-900"
        >
          <Icon name="chevronLeft" size={16} />
          В кабинет УК
        </button>
        <div>
          <p className="text-sm font-semibold">Студия правил</p>
          <p className="text-xs text-slate-500">конструктор устройств, редактор сценариев, прогон</p>
        </div>
      </header>
      {children}
    </div>
  )
}
