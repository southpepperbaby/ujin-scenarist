import { useState } from 'react'

import { api, type Condition, type Rule, type SignalCondition, type Trigger } from '../../api'
import { setRuleEnabled } from '../../shared/rule/enable-rule'
import { toastOk } from '../../shared/toast'
import { Button } from '../../shared/ui/Button'
import { ErrorNote, Field, TextInput } from '../../shared/ui/Fields'
import { Modal } from '../../shared/ui/Modal'
import { Toggle } from '../../shared/ui/Toggle'
import { guard, useStore } from '../../store'
import { ActionEditor } from './ActionEditor'
import { defaultSet, newSignalCondition, removeAt, ruleDevices, updateAt, validateRule } from './rule-defaults'
import { AddButton, Block, Row, Tag } from './rule-editor-parts'
import { SignalPicker } from './SignalPicker'

const isTime = (c: Condition): c is Extract<Condition, { type: 'time' }> => c.type === 'time'

type RuleEditorModalProps = {
  /** Правило для правки или заготовка нового. */
  rule: Rule
  isNew: boolean
  onClose: () => void
}

/** Блочный редактор правила дома: «Когда → Если → То». */
export function RuleEditorModal({ rule, isNew, onClose }: RuleEditorModalProps) {
  const devices = ruleDevices(useStore((state) => state.devices))
  const [r, setR] = useState<Rule>(rule)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  // Правило уже создано на сервере: повторное «Сохранить» обновляет, а не шлёт второй create с тем же id.
  const [created, setCreated] = useState(!isNew)
  const patch = (p: Partial<Rule>) => {
    setDirty(true)
    setR((x) => ({ ...x, ...p }))
  }

  const save = async () => {
    if (busy) return
    const problem = validateRule(r)
    if (problem) return setError(problem)
    setBusy(true)
    setError('')
    // Включение идёт через прогон (setRuleEnabled): сохраняем выключенным черновиком, включаем отдельным шагом.
    // Изменённое правило прошлый прогон уже не подтверждает, даже если было включено.
    const changed = dirty || isNew
    const wantsOn = r.enabled && (changed || !rule.enabled)
    const next: Rule = {
      ...r,
      title: r.title.trim(),
      enabled: wantsOn ? false : r.enabled,
      status: changed ? 'draft' : r.status,
    }
    try {
      await (created ? api.updateRule(next) : api.createRule(next))
      setCreated(true)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
      return
    }
    toastOk(`Правило «${next.title}» сохранено`)
    onClose()
    if (wantsOn) await setRuleEnabled(next, true)
    else await guard(useStore.getState().reloadRules())
  }

  const conditions = r.conditions
  const setConditions = (list: Condition[]) => patch({ conditions: list })

  return (
    <Modal
      title={isNew ? 'Новое правило' : 'Изменить правило'}
      onClose={onClose}
      wide
      dirty={dirty}
      footer={
        <>
          <Button variant="primary" onClick={() => void save()} busy={busy}>
            Сохранить
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <span className="flex-1" />
          <span className="flex items-center gap-2 text-body text-ink-dim" title="Непрогнанное правило перед включением пройдёт эмулятор">
            Включено
            <Toggle checked={r.enabled} onChange={(enabled) => patch({ enabled })} label="Правило включено" />
          </span>
        </>
      }
    >
      <fieldset disabled={busy} className={`space-y-4 ${busy ? 'opacity-60' : ''}`}>
        <TextInput
          className="w-full text-lead font-semibold"
          value={r.title}
          autoFocus
          aria-label="Название правила"
          placeholder="Название правила"
          onChange={(event) => patch({ title: event.target.value })}
        />
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Приоритет" hint="Больше значит важнее">
            <TextInput
              type="number"
              className="w-20"
              value={r.priority}
              onChange={(event) => patch({ priority: Number(event.target.value) })}
            />
          </Field>
        </div>

        <Block label="Когда" hint="событие устройства" bar="bg-accent">
          <SignalPicker
            value={r.trigger}
            devices={devices}
            withOp
            label="Когда"
            onChange={(v) => patch({ trigger: { ...r.trigger, ...v } as Trigger })}
          />
        </Block>

        <Block label="Если" hint="все условия выполняются в момент события" bar="bg-sev-info">
          {conditions.length === 0 && <p className="text-meta text-ink-mute">Без условий</p>}
          {conditions.map((condition, index) => {
            const label = `Условие ${index + 1}`
            return (
              <Row
                key={index}
                removeLabel={`Убрать ${label.toLowerCase()}`}
                onRemove={() => setConditions(removeAt(conditions, index))}
              >
                {isTime(condition) ? (
                  <div className="flex flex-wrap items-center gap-2 text-body text-ink-dim">
                    <Tag>время</Tag>с
                    <TextInput
                      type="time"
                      aria-label={`${label}: с`}
                      value={condition.start}
                      onChange={(event) => setConditions(updateAt(conditions, index, { ...condition, start: event.target.value }))}
                    />
                    до
                    <TextInput
                      type="time"
                      aria-label={`${label}: до`}
                      value={condition.end}
                      onChange={(event) => setConditions(updateAt(conditions, index, { ...condition, end: event.target.value }))}
                    />
                  </div>
                ) : (
                  <SignalPicker
                    value={condition}
                    devices={devices}
                    withOp
                    label={label}
                    onChange={(v) => setConditions(updateAt(conditions, index, { ...condition, ...v } as SignalCondition))}
                  />
                )}
              </Row>
            )
          })}
          <div className="flex gap-1">
            <AddButton onClick={() => setConditions([...conditions, newSignalCondition(devices)])}>+ условие по датчику</AddButton>
            <AddButton onClick={() => setConditions([...conditions, { type: 'time', start: '22:00', end: '07:00' }])}>
              + время суток
            </AddButton>
          </div>
        </Block>

        <Block label="То" hint="действия по порядку" bar="bg-ok">
          {r.actions.map((action, index) => (
            <Row
              key={index}
              removeLabel={`Убрать действие ${index + 1}`}
              onRemove={r.actions.length > 1 ? () => patch({ actions: removeAt(r.actions, index) }) : undefined}
            >
              <ActionEditor
                action={action}
                devices={devices}
                label={`Действие ${index + 1}`}
                onChange={(next) => patch({ actions: updateAt(r.actions, index, next) })}
              />
            </Row>
          ))}
          <div className="flex flex-wrap gap-1">
            <AddButton onClick={() => patch({ actions: [...r.actions, defaultSet(devices)] })}>+ команда устройству</AddButton>
            <AddButton
              onClick={() =>
                patch({ actions: [...r.actions, { type: 'notify', target: 'concierge', level: 'warning', message: '' }] })
              }
            >
              + уведомление
            </AddButton>
            <AddButton onClick={() => patch({ actions: [...r.actions, { type: 'dispatch', category: null, note: '' }] })}>
              + заявка подрядчику
            </AddButton>
          </div>
        </Block>

        {error && <ErrorNote>{error}</ErrorNote>}
      </fieldset>
    </Modal>
  )
}
