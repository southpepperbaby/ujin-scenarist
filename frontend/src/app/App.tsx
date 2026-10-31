import { ManagerApp } from '../features/manager/ManagerApp'
import { ResidentApp } from '../features/resident/ResidentApp'
import { useStore } from '../store'
import { RoleLanding } from './RoleLanding'
import { useHashRoute } from './routing'
import { useBootstrap } from './use-bootstrap'

export default function App() {
  const path = useHashRoute()
  const { demo } = useBootstrap()
  const error = useStore((state) => state.error)

  let screen
  if (path.startsWith('/resident')) screen = <ResidentApp path={path} demo={demo} />
  else if (path.startsWith('/uk')) screen = <ManagerApp path={path} demo={demo} />
  else screen = <RoleLanding />

  return (
    <>
      {screen}
      {error && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-sev-crit px-4 py-2 text-sm text-white shadow-lg">
          {error}
        </div>
      )}
    </>
  )
}
