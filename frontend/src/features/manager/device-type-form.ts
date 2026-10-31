import type { Behavior, DeviceTypeSpec, SignalGroup, SignalSpec, SignalValueType } from '../../api'

/** Строка формы: все поля текстовые, в декларацию для бэкенда они собираются при сохранении. */
export type SignalRow = {
  uid: number
  name: string
  title: string
  group: SignalGroup
  type: SignalValueType
  measure: string
  min: string
  max: string
  /** Значения списка через запятую: «закрыто, открыто» или «1=закрыто, 2=открыто». */
  values: string
  def: string
  alarm: string
}

export const GROUPS: { key: SignalGroup; title: string; hint: string }[] = [
  { key: 'property', title: 'Измерения', hint: 'что датчик меряет и сообщает' },
  { key: 'event', title: 'События', hint: 'состояния вроде «открыто» или «протечка»' },
  { key: 'command', title: 'Команды', hint: 'чем управляют правила и жители' },
  { key: 'setting', title: 'Настройки', hint: 'пороги, периоды, режимы' },
]

export const TYPE_TITLES: Record<SignalValueType, string> = {
  number: 'Число',
  switch: 'Вкл / выкл',
  list: 'Список',
  text: 'Текст',
}

export function typesForGroup(group: SignalGroup): SignalValueType[] {
  if (group === 'event') return ['list', 'switch']
  if (group === 'command') return ['switch', 'number', 'list']
  if (group === 'setting') return ['number', 'switch', 'list', 'text']
  return ['number', 'list', 'switch', 'text']
}

let counter = 0
export const nextUid = () => ++counter

const RU: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

/** «Давление в трубе» -> «davlenie_v_trube». */
export function translit(text: string): string {
  return text
    .toLowerCase()
    .split('')
    .map((ch) => RU[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function uniqueCode(base: string, taken: Set<string>, limit: number, fallback: string): string {
  let code = base
  if (!/^[a-z]/.test(code)) code = code ? `${fallback}_${code}` : fallback
  code = code.slice(0, limit).replace(/_+$/, '')
  let candidate = code
  let n = 2
  while (taken.has(candidate) || candidate.length < (limit === 31 ? 2 : 1)) {
    const suffix = `_${n++}`
    candidate = code.slice(0, limit - suffix.length) + suffix
  }
  return candidate
}

export const familyCode = (title: string, taken: Set<string>) => uniqueCode(translit(title), taken, 31, 'type')

export function emptyRow(group: SignalGroup): SignalRow {
  const base = { uid: nextUid(), name: '', title: '', group, measure: '', min: '', max: '', def: '', alarm: '' }
  if (group === 'event') return { ...base, type: 'list', values: 'норма, сработало' }
  if (group === 'command') return { ...base, type: 'switch', values: 'выкл, вкл', def: '0' }
  return { ...base, type: 'number', values: '' }
}

function parseValues(text: string): [string, string][] {
  return text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part, index): [string, string] => {
      const eq = part.indexOf('=')
      if (eq > 0 && /^-?\d+$/.test(part.slice(0, eq).trim())) return [part.slice(0, eq).trim(), part.slice(eq + 1).trim()]
      return [String(index), part]
    })
}

/** Ключи и подписи значений списка из строки формы. У переключателя всегда два значения. */
export function rowLayout(row: SignalRow): [string, string][] {
  if (row.type === 'switch') {
    const items = parseValues(row.values)
    return [
      ['0', items[0]?.[1] || 'выкл'],
      ['1', items[1]?.[1] || 'вкл'],
    ]
  }
  return row.type === 'list' ? parseValues(row.values) : []
}

export function rowFromSpec(spec: SignalSpec): SignalRow {
  const entries = Object.entries(spec.layout ?? {}).sort((a, b) => Number(a[0]) - Number(b[0]))
  const sequential = entries.every(([key], index) => key === String(index))
  return {
    uid: nextUid(),
    name: spec.name,
    title: spec.title,
    group: spec.group,
    type: spec.type,
    measure: spec.measure ?? '',
    min: spec.min == null ? '' : String(spec.min),
    max: spec.max == null ? '' : String(spec.max),
    values: entries.map(([key, label]) => (sequential ? label : `${key}=${label}`)).join(', '),
    def: spec.default == null ? '' : String(spec.default),
    alarm: spec.alarm_value == null ? '' : String(spec.alarm_value),
  }
}

/** Проверка формы человеческими словами, до отправки на сервер. */
export function validate(title: string, rows: SignalRow[]): string {
  if (!title.trim()) return 'Укажите название типа'
  if (rows.length === 0) return 'Добавьте хотя бы один сигнал'
  for (const row of rows) {
    const label = row.title.trim() ? `«${row.title.trim()}»` : 'Сигнал без названия'
    if (!row.title.trim()) return `${label}: впишите название`
    if (row.type === 'list' && rowLayout(row).length < 2) return `${label}: перечислите значения через запятую`
    if (row.type === 'number') {
      for (const value of [row.min, row.max, row.def, row.alarm]) {
        if (value.trim() !== '' && Number.isNaN(Number(value))) return `${label}: ожидается число`
      }
    }
  }
  return ''
}

/**
 * Правило поведения в форме. Сигналы указываются по uid строки: имена сигналов генерируются только
 * при сохранении, а человек выбирает сигнал по названию.
 */
export type BehaviorRow = {
  uid: number
  type: Behavior['type']
  /** drift: измерение; effect: команда; threshold: измерение-источник. */
  source: number
  /** effect, threshold: что выставить. */
  target: number
  sourceValue: string
  targetValue: string
  elseValue: string
  step: string
  noise: string
  delay: string
  op: 'gt' | 'gte' | 'lt' | 'lte'
}

export const BEHAVIOR_KINDS: { key: Behavior['type']; title: string; hint: string }[] = [
  { key: 'drift', title: 'Меняется само', hint: 'батарея садится, температура колеблется' },
  { key: 'effect', title: 'Команда ведёт к результату', hint: '«Открыть» → створка открыта через 3 тика' },
  { key: 'threshold', title: 'Порог рождает событие', hint: 'давление выше 8 → авария' },
]

export function emptyBehavior(type: Behavior['type'], rows: SignalRow[]): BehaviorRow {
  const pick = (groups: SignalGroup[], numeric = false) =>
    rows.find((row) => groups.includes(row.group) && (!numeric || row.type === 'number'))?.uid ?? 0
  const base = { uid: nextUid(), type, sourceValue: '', targetValue: '', elseValue: '', step: '', noise: '', delay: '', op: 'gt' as const }
  if (type === 'drift') return { ...base, source: pick(['property'], true), target: 0, step: '-0.5' }
  if (type === 'effect') return { ...base, source: pick(['command', 'setting']), target: pick(['event', 'property']), delay: '2' }
  return { ...base, source: pick(['property'], true), target: pick(['event']) || pick(['property']) }
}

/** Значение для бэкенда: ключ списка числом, число числом, пусто как null. */
function toValue(raw: string, row: SignalRow | undefined): number | string | null {
  if (raw.trim() === '') return null
  if (row && (row.type === 'number' || rowLayout(row).length)) return Number(raw)
  return raw
}

export function behaviorFromSpec(b: Behavior, rows: SignalRow[]): BehaviorRow {
  const uid = (name: string) => rows.find((row) => row.name === name)?.uid ?? 0
  const str = (v: unknown) => (v == null ? '' : String(v))
  const base = emptyBehavior(b.type, rows)
  if (b.type === 'drift') return { ...base, source: uid(b.signal), step: str(b.step), noise: b.noise ? str(b.noise) : '' }
  if (b.type === 'effect')
    return { ...base, source: uid(b.command), target: uid(b.target), sourceValue: str(b.value), targetValue: str(b.target_value), delay: str(b.delay) }
  return { ...base, source: uid(b.source), target: uid(b.target), op: b.op, sourceValue: str(b.limit), targetValue: str(b.value), elseValue: str(b.else_value) }
}

export function validateBehaviors(behaviors: BehaviorRow[], rows: SignalRow[]): string {
  const exists = (uid: number) => rows.some((row) => row.uid === uid)
  for (const [index, b] of behaviors.entries()) {
    const label = `Поведение ${index + 1}`
    if (!exists(b.source) || (b.type !== 'drift' && !exists(b.target))) return `${label}: выберите сигналы`
    if (b.type === 'drift' && Number.isNaN(Number(b.step || 0))) return `${label}: шаг должен быть числом`
    if (b.type === 'threshold' && (b.sourceValue.trim() === '' || Number.isNaN(Number(b.sourceValue))))
      return `${label}: порог должен быть числом`
    if (b.type === 'threshold' && b.targetValue.trim() === '') return `${label}: выберите, что выставить`
  }
  return ''
}

export function buildSpec(family: string, title: string, rows: SignalRow[], behaviors: BehaviorRow[] = []): DeviceTypeSpec {
  const used = new Set<string>(['fw'])
  const names = new Map<number, string>()
  const signals = rows.map((row, index): SignalSpec => {
    const fixed = row.name && !used.has(row.name) ? row.name : ''
    const name = fixed || uniqueCode(translit(row.title), used, 32, `s${index + 1}`)
    used.add(name)
    const spec: SignalSpec = { name, title: row.title.trim(), group: row.group, type: row.type }
    const layout = rowLayout(row)
    if (layout.length) {
      spec.layout = Object.fromEntries(layout)
      const keys = layout.map(([key]) => key)
      spec.default = Number(keys.includes(row.def) ? row.def : keys[0])
      if (keys.includes(row.alarm)) spec.alarm_value = Number(row.alarm)
    } else if (row.type === 'number') {
      if (row.measure.trim()) spec.measure = row.measure.trim()
      if (row.min.trim() !== '') spec.min = Number(row.min)
      if (row.max.trim() !== '') spec.max = Number(row.max)
      spec.default = row.def.trim() === '' ? 0 : Number(row.def)
      if (row.alarm.trim() !== '') spec.alarm_value = Number(row.alarm)
    } else {
      spec.default = row.def
    }
    names.set(row.uid, name)
    return spec
  })
  const row = (uid: number) => rows.find((item) => item.uid === uid)
  const name = (uid: number) => names.get(uid) ?? ''
  const built = behaviors.map((b): Behavior => {
    if (b.type === 'drift') return { type: 'drift', signal: name(b.source), step: Number(b.step || 0), noise: Number(b.noise || 0) }
    if (b.type === 'effect')
      return {
        type: 'effect',
        command: name(b.source),
        value: toValue(b.sourceValue, row(b.source)),
        target: name(b.target),
        target_value: toValue(b.targetValue, row(b.target)),
        delay: Number(b.delay || 0),
      }
    return {
      type: 'threshold',
      source: name(b.source),
      op: b.op,
      limit: Number(b.sourceValue),
      target: name(b.target),
      value: toValue(b.targetValue, row(b.target)) ?? 0,
      else_value: toValue(b.elseValue, row(b.target)),
    }
  })
  return { family, title: title.trim(), signals, behaviors: built }
}
