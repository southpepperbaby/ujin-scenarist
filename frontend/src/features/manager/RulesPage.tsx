import { useCallback, useState } from 'react'

import { api, type Device, type Rule } from '../../api'
import { useAction } from '../../shared/actions'
import { setRuleEnabled } from '../../shared/rule/enable-rule'
import { ruleLines } from '../../shared/rule/rule-lines'
import { ruleStatus } from '../../shared/ticket-status'
import { toastOk } from '../../shared/toast'
import { Button } from '../../shared/ui/Button'
import { ConfirmDeleteButton } from '../../shared/ui/DeleteButtons'
import { EmptyState } from '../../shared/ui/EmptyState'
import { SkeletonList } from '../../shared/ui/Skeleton'
import { StatusPill } from '../../shared/ui/StatusPill'
import { Toggle } from '../../shared/ui/Toggle'
import { guard, useStore } from '../../store'
import { GherkinCheck } from './GherkinCheck'
import { newRule } from './rule-defaults'
import { RuleEditorModal } from './RuleEditorModal'

type Editing = { rule: Rule; isNew: boolean } | null

function RuleCard({ rule, devices, onEdit }: { rule: Rule; devices: Device[]; onEdit: () => void }) {
  const [busy, setBusy] = useState(false)
  const { when, conditions, actions } = ruleLines(rule, devices)
  const status = ruleStatus(rule.status)

  const toggle = async (next: boolean) => {
    if (busy) return
    setBusy(true)
    await setRuleEnabled(rule, next)
    setBusy(false)
  }

  const remove = async () => {
    setBusy(true)
    const done = await guard(api.deleteRule(rule.id).then(() => true))
    if (done) toastOk(`Правило «${rule.title}» удалено`)
    await guard(useStore.getState().reloadRules())
    setBusy(false)
  }

  return (
    <article className={`surface rounded-2xl p-4 transition ${rule.enabled ? '' : 'opacity-75'}`}>
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{rule.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-meta text-ink-mute">
            <StatusPill label={status.label} className={status.className} />
            приоритет {rule.priority}
          </p>
        </div>
        <Toggle
          checked={rule.enabled}
          disabled={busy}
          onChange={(next) => void toggle(next)}
          label={`Правило «${rule.title}»`}
        />
      </header>
      <dl className="mt-3 space-y-0.5 text-body text-ink-dim">
        <div>
          <dt className="inline font-medium text-ink">Когда </dt>
          <dd className="inline">{when.join(' · ')}</dd>
        </div>
        {conditions.length > 0 && (
          <div>
            <dt className="inline font-medium text-ink">Если </dt>
            <dd className="inline">{conditions.join(' · ')}</dd>
          </div>
        )}
        <div>
          <dt className="inline font-medium text-ink">То </dt>
          <dd className="inline">{actions.join(' · ')}</dd>
        </div>
      </dl>
      <footer className="mt-3 flex flex-wrap items-center gap-1">
        <Button variant="secondary" onClick={onEdit} label={`Изменить «${rule.title}»`}>
          Изменить
        </Button>
        <GherkinCheck rule={rule} />
        <ConfirmDeleteButton onConfirm={() => void remove()} busy={busy} label={`Удалить «${rule.title}»`} />
      </footer>
    </article>
  )
}

export function RulesPage({ devices }: { devices: Device[] }) {
  const all = useStore((state) => state.rules)
  const loaded = useStore((state) => state.loaded)
  const [editing, setEditing] = useState<Editing>(null)

  // Правила жителя остаются в его приложении: УК управляет только своими.
  const sorted = all.filter((rule) => rule.owner === 'uk').sort((a, b) => b.priority - a.priority)
  const create = useCallback(() => setEditing({ rule: newRule(useStore.getState().devices), isNew: true }), [])
  useAction('new-rule', create)

  return (
    <div className="space-y-4 px-7 py-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" icon="plus" onClick={create}>
          Новое правило
        </Button>
        <span className="text-meta text-ink-mute">Правила УК важнее правил жителей. Правила жителей видят только сами жители.</span>
      </div>

      {!loaded && <SkeletonList count={4} className="h-40" />}

      {loaded && sorted.length === 0 && (
        <EmptyState
          icon="sliders"
          title="Правил дома пока нет"
          hint="Например: «если в подвале протечка — перекрыть стояк и вызвать сантехника». Соберите в редакторе или словами в ассистенте."
          action={
            <Button variant="primary" icon="plus" onClick={create}>
              Создать первое правило
            </Button>
          }
          className="surface rounded-2xl"
        />
      )}

      <div className="grid gap-3 xl:grid-cols-2">
        {sorted.map((rule) => (
          <RuleCard key={rule.id} rule={rule} devices={devices} onEdit={() => setEditing({ rule, isNew: false })} />
        ))}
      </div>

      {editing && (
        <RuleEditorModal key={editing.rule.id} rule={editing.rule} isNew={editing.isNew} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
