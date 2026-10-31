import type { DeviceTypeSpec, SignalGroup, SignalSpec, SignalValueType } from '../../api'

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

export function buildSpec(family: string, title: string, rows: SignalRow[]): DeviceTypeSpec {
  const used = new Set<string>(['fw'])
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
    return spec
  })
  return { family, title: title.trim(), signals }
}
