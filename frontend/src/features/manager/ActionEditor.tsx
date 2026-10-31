import type { Action, Device } from '../../api'
import { SelectInput, TextInput } from '../../shared/ui/Fields'
import { useCategories } from '../../shared/use-categories'
import { Tag } from './rule-editor-parts'
import { SignalPicker } from './SignalPicker'

type ActionEditorProps = {
  action: Action
  devices: Device[]
  /** Номер действия в подписях для скринридера: «Действие 2: текст уведомления». */
  label: string
  onChange: (a: Action) => void
}

/** Одно действие правила: команда устройству, уведомление или заявка подрядчику, с задержкой. */
export function ActionEditor({ action, devices, label, onChange }: ActionEditorProps) {
  const categories = useCategories()
  const delay = (
    <label className="flex items-center gap-1 text-meta text-ink-mute">
      через
      <TextInput
        type="number"
        min={0}
        className="w-14"
        value={action.delay_s ?? 0}
        aria-label={`${label}: задержка, секунд`}
        onChange={(event) => onChange({ ...action, delay_s: Math.max(0, Number(event.target.value) || 0) })}
      />
      с
    </label>
  )

  if (action.type === 'set_signal') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Tag>команда</Tag>
        <SignalPicker
          value={action}
          devices={devices}
          writableOnly
          label={label}
          onChange={(v) => onChange({ ...action, ...v } as Action)}
        />
        {delay}
      </div>
    )
  }

  if (action.type === 'notify') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Tag>уведомить</Tag>
        <SelectInput
          aria-label={`${label}: кому`}
          value={action.target}
          onChange={(event) => onChange({ ...action, target: event.target.value as 'resident' | 'concierge' })}
        >
          <option value="resident">жителя</option>
          <option value="concierge">консьержа</option>
        </SelectInput>
        <SelectInput
          aria-label={`${label}: уровень`}
          value={action.level}
          onChange={(event) => onChange({ ...action, level: event.target.value as 'info' | 'warning' | 'critical' })}
        >
          <option value="info">инфо</option>
          <option value="warning">важно</option>
          <option value="critical">критично</option>
        </SelectInput>
        <TextInput
          className="min-w-48 flex-1"
          value={action.message}
          aria-label={`${label}: текст уведомления`}
          placeholder="Текст уведомления"
          onChange={(event) => onChange({ ...action, message: event.target.value })}
        />
        {delay}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tag>заявка</Tag>
      <SelectInput
        aria-label={`${label}: категория`}
        value={action.category ?? ''}
        onChange={(event) => onChange({ ...action, category: event.target.value || null })}
      >
        <option value="">категорию определит ИИ</option>
        {Object.entries(categories).map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </SelectInput>
      <TextInput
        className="min-w-48 flex-1"
        value={action.note ?? ''}
        aria-label={`${label}: комментарий подрядчику`}
        placeholder="Комментарий подрядчику"
        onChange={(event) => onChange({ ...action, note: event.target.value })}
      />
      {delay}
    </div>
  )
}
