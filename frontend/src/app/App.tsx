import { lazy, Suspense } from 'react'
import { Toaster } from 'sonner'

import { ResidentApp } from '../features/resident/ResidentApp'
import { ErrorBoundary } from './ErrorBoundary'
import { RoleLanding } from './RoleLanding'
import { inSection, useHashRoute } from './routing'
import { useBootstrap } from './use-bootstrap'

// Кабинет УК тяжелее и жителю на телефоне не нужен: грузим его отдельным чанком.
const ManagerApp = lazy(() => import('../features/manager/ManagerApp').then((m) => ({ default: m.ManagerApp })))

function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-body text-ink-mute" role="status">
      Загружаем кабинет…
    </div>
  )
}

export default function App() {
  const path = useHashRoute()
  const { demo } = useBootstrap()

  let screen
  if (inSection(path, '/resident')) screen = <ResidentApp path={path} demo={demo} />
  else if (inSection(path, '/uk')) screen = <ManagerApp path={path} demo={demo} />
  else screen = <RoleLanding />

  const section = path.split('/')[1] ?? ''

  return (
    <>
      <ErrorBoundary resetKey={path}>
        <Suspense fallback={<Loading />}>{screen}</Suspense>
      </ErrorBoundary>
      <Toaster
        position={section === 'resident' ? 'top-center' : 'bottom-right'}
        richColors
        closeButton
        toastOptions={{ className: 'font-sans' }}
      />
    </>
  )
}
