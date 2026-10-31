import { useStore } from '../../store'
import { ScenarioCard } from './ScenarioCard'
import { ScenarioChat } from './ScenarioChat'

export function ScenariosScreen() {
  const rules = useStore((state) => state.rules).filter((rule) => rule.owner === 'resident')

  return (
    <div className="space-y-6 px-5 pt-4 pb-8">
      <h1 className="text-2xl">Сценарии</h1>

      {rules.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="text-caption font-semibold tracking-widest text-ink-mute">МОИ ПРАВИЛА</h2>
          {rules.map((rule, index) => (
            <ScenarioCard key={rule.id} rule={rule} index={index} />
          ))}
        </section>
      )}

      <section className="space-y-2.5">
        <h2 className="text-caption font-semibold tracking-widest text-ink-mute">НОВОЕ ПРАВИЛО</h2>
        <ScenarioChat />
      </section>
    </div>
  )
}
