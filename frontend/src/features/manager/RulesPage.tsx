import { useState } from 'react'

import { api, type Device, type Rule } from '../../api'
import { ruleLines } from '../../shared/rule/rule-lines'
import { Button } from '../../shared/ui/Button'
import { Toggle } from '../../shared/ui/Toggle'
import { guard, useStore } from '../../store'
import { GherkinCheck } from './GherkinCheck'
import { RuleEditorModal, newRule } from './RuleEditorModal'

type Editing = { rule: Rule; isNew: boolean } | null

export function RulesPage({ devices }: { devices: Device[] }) {
  const rules = useStore((state) => state.rules)
  const [editing, setEditing] = useState<Editing>(null)
  const [confirm, setConfirm] = useState('')

  const sorted = [...rules].sort((a, b) => Number(b.owner === 'uk') - Number(a.owner === 'uk') || b.priority - a.priority)

  const toggle = async (rule: Rule, enabled: boolean) => {
    const out = await guard(api.updateRule({ ...rule, enabled, status: enabled ? 'active' : rule.status }))
    if (out) await useStore.getState().reloadRules()
  }

  const remove = async (rule: Rule) => {
    setConfirm('')
    await guard(api.deleteRule(rule.id))
    await useStore.getState().reloadRules()
  }

  return (
    <div className="space-y-4 px-7 py-6">
      <div className="flex items-center gap-3">
        <Button variant="primary" icon="plus" onClick={() => setEditing({ rule: newRule(devices), isNew: true })}>
          Новое правило
        </Button>
        <span className="text-[12px] text-ink-mute">Правила УК важнее правил жителей: приоритет задаёт порядок</span>
      </div>

      {sorted.length === 0 && <p className="text-sm text-ink-mute">Правил пока нет. Создайте первое.</p>}

      <div className="grid gap-3 xl:grid-cols-2">
        {sorted.map((rule) => {
          const { when, conditions, actions } = ruleLines(rule, devices)
          return (
            <article
              key={rule.id}
              className={`rounded-2xl border border-line bg-surface p-4 ${rule.enabled ? '' : 'opacity-70'}`}
            >
              <header className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium">{rule.title}</p>
                  <p className="text-[12px] text-ink-mute">
                    {rule.owner === 'uk' ? `УК · приоритет ${rule.priority}` : 'правило жителя'} ·{' '}
                    {rule.scope === 'building' ? 'дом' : 'квартира'}
                  </p>
                </div>
                <Toggle checked={rule.enabled} onChange={(next) => void toggle(rule, next)} label="Включить правило" />
              </header>
              <p className="mt-3 text-[13px] text-ink-dim">
                <span className="font-medium text-ink">Когда</span> {when.join(' · ')}
              </p>
              {conditions.length > 0 && (
                <p className="text-[13px] text-ink-dim">
                  <span className="font-medium text-ink">Если</span> {conditions.join(' · ')}
                </p>
              )}
              <p className="text-[13px] text-ink-dim">
                <span className="font-medium text-ink">То</span> {actions.join(' · ')}
              </p>
              <footer className="mt-3 flex flex-wrap items-center gap-1">
                <Button variant="secondary" onClick={() => setEditing({ rule, isNew: false })}>
                  Изменить
                </Button>
                <GherkinCheck rule={rule} />
                {confirm === rule.id ? (
                  <Button variant="danger" onClick={() => void remove(rule)}>
                    Да, удалить
                  </Button>
                ) : (
                  <Button variant="ghost" className="text-sev-crit" onClick={() => setConfirm(rule.id)}>
                    Удалить
                  </Button>
                )}
              </footer>
            </article>
          )
        })}
      </div>

      {editing && (
        <RuleEditorModal
          key={editing.rule.id}
          rule={editing.rule}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
