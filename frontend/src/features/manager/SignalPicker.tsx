import { useState } from 'react'

import type { Device, Op } from '../../api'
import { OP_TITLE } from '../../shared/rule/rule-lines'
import { SelectInput, TextInput } from '../../shared/ui/Fields'
import { deviceById } from '../../store'
import { firstValue, usableSignals } from './rule-defaults'

const OPS = Object.keys(OP_TITLE) as Op[]

export type PickerValue = { device_id: string; signal: string; op?: Op; value: unknown }

/**
 * Поле значения, в котором можно набрать дробь: строка живёт локально, наружу уходит число,
 * как только набранное им является. «22.» остаётся на экране, пока не допишут «22.5».
 */
function ValueInput({ value, placeholder, label, onChange }: { value: unknown; placeholder: string; label: string; onChange: (v: unknown) => void }) {
  const outside = value === undefined || value === null ? '' : String(value)
  const [text, setText] = useState(outside)
  // Значение сменили снаружи (другой сигнал): показываем его, а не устаревший набор.
  const [seen, setSeen] = useState(outside)
  if (outside !== seen) {
    setSeen(outside)
    setText(outside)
  }
  return (
    <TextInput
      className="w-24"
      value={text}
      inputMode="decimal"
      aria-label={label}
      placeholder={placeholder}
      onChange={(event) => {
        const raw = event.target.value
        setText(raw)
        const normalized = raw.replace(',', '.').trim()
        const n = Number(normalized)
        const next = normalized === '' || !Number.isFinite(n) ? raw : n
        setSeen(next === '' || next === undefined ? '' : String(next))
        onChange(next)
      }}
    />
  )
}

/** Устройство · сигнал · оператор · значение. Удалённое устройство или чужое значение видно явно. */
export function SignalPicker({
  value,
  onChange,
  devices,
  withOp,
  writableOnly,
  label,
}: {
  value: PickerValue
  onChange: (v: Partial<PickerValue>) => void
  devices: Device[]
  withOp?: boolean
  writableOnly?: boolean
  /** Чем это поле является в правиле: «Когда», «Условие 2», «Действие 1». */
  label: string
}) {
  const device = deviceById(devices, value.device_id)
  const signals = usableSignals(device, writableOnly)
  const sig = signals.find((s) => s.name === value.signal)
  const layout = sig?.layout ? Object.entries(sig.layout) : null
  const valueKnown = !layout || layout.some(([key]) => key === String(value.value))

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <SelectInput
        aria-label={`${label}: устройство`}
        value={value.device_id}
        onChange={(event) => {
          const first = usableSignals(deviceById(devices, event.target.value), writableOnly)[0]
          onChange({ device_id: event.target.value, signal: first?.name ?? '', value: firstValue(first) })
        }}
      >
        {!device && <option value={value.device_id}>{value.device_id ? `(удалено) ${value.device_id}` : 'Выберите устройство'}</option>}
        {devices.map((d) => (
          <option key={d.id} value={d.id}>
            {d.title} · {d.room}
          </option>
        ))}
      </SelectInput>
      <SelectInput
        aria-label={`${label}: сигнал`}
        value={value.signal}
        onChange={(event) =>
          onChange({ signal: event.target.value, value: firstValue(signals.find((s) => s.name === event.target.value)) })
        }
      >
        {!sig && <option value={value.signal}>{value.signal ? `(нет сигнала) ${value.signal}` : 'Выберите сигнал'}</option>}
        {signals.map((s) => (
          <option key={s.name} value={s.name}>
            {s.title}
          </option>
        ))}
      </SelectInput>
      {withOp && (
        <SelectInput aria-label={`${label}: сравнение`} value={value.op} onChange={(event) => onChange({ op: event.target.value as Op })}>
          {OPS.map((op) => (
            <option key={op} value={op}>
              {OP_TITLE[op]}
            </option>
          ))}
        </SelectInput>
      )}
      {value.op !== 'changed' &&
        (layout ? (
          <SelectInput
            aria-label={`${label}: значение`}
            value={String(value.value)}
            onChange={(event) => onChange({ value: Number(event.target.value) })}
          >
            {!valueKnown && <option value={String(value.value)}>{`(нет в списке) ${String(value.value)}`}</option>}
            {layout.map(([v, text]) => (
              <option key={v} value={v}>
                {text}
              </option>
            ))}
          </SelectInput>
        ) : (
          <ValueInput
            value={value.value}
            label={`${label}: значение`}
            placeholder={sig?.measure ?? 'значение'}
            onChange={(next) => onChange({ value: next })}
          />
        ))}
      {sig?.measure && !sig.layout && <span className="text-meta text-ink-mute">{sig.measure}</span>}
    </div>
  )
}
