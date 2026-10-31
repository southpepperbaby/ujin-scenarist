import { useStore } from '../../store'
import { ScenarioCard } from './ScenarioCard'
import { ScenarioChat } from './ScenarioChat'

export function ScenariosScreen() {
  const rules = useStore((state) => state.rules).filter((rule) => rule.owner === 'resident')

  return (
    <div className="space-y-6 px-5 pt-4 pb-8">
      <header>
        <h1 className="text-2xl">Сценарии</h1>
        <p className="mt-1 text-[13px] text-ink-mute">
          Скажите, что должно происходить. Правило соберётся само и прогонится на эмуляторах.
        </p>
      </header>

      <ScenarioChat />

      {rules.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="text-[11px] font-semibold tracking-widest text-ink-mute">МОИ ПРАВИЛА</h2>
          {rules.map((rule, index) => (
            <ScenarioCard key={rule.id} rule={rule} index={index} />
          ))}
        </section>
      )}
    </div>
  )
}
