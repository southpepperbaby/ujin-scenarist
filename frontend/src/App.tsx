import { useEffect, useState } from 'react'
import { ConciergeScreen, ResidentScreen, Studio } from './screens'
import { useStore } from './store'
import { cx } from './ui'

const TABS = [
  { key: 'studio', title: 'Студия сценариев', hint: 'интегратор' },
  { key: 'resident', title: 'Житель', hint: 'телефон' },
  { key: 'concierge', title: 'Консьерж и УК', hint: 'BMS' },
] as const

type Tab = (typeof TABS)[number]['key']

export default function App() {
  const load = useStore((s) => s.load)
  const connect = useStore((s) => s.connect)
  const error = useStore((s) => s.error)
  const [tab, setTab] = useState<Tab>(() => (location.hash.slice(1) as Tab) || 'studio')

  useEffect(() => {
    load()
    return connect()
  }, [load, connect])

  useEffect(() => {
    location.hash = tab
  }, [tab])

  useEffect(() => {
    const onHash = () => setTab((location.hash.slice(1) as Tab) || 'studio')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="flex items-center gap-6 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-sm font-bold text-white">С</span>
            <span className="font-semibold">Сценарист</span>
            <span className="text-xs text-slate-400">на Ujin OS</span>
          </div>
          <nav className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cx('rounded-lg px-3 py-1.5 text-sm transition', tab === t.key ? 'bg-white font-medium shadow-sm' : 'text-slate-500 hover:text-slate-800')}
              >
                {t.title} <span className="text-xs text-slate-400">· {t.hint}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>
      {tab === 'studio' && <Studio />}
      {tab === 'resident' && <ResidentScreen />}
      {tab === 'concierge' && <ConciergeScreen />}
      {error && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-rose-600 px-4 py-2 text-sm text-white shadow-lg">{error}</div>
      )}
    </div>
  )
}
