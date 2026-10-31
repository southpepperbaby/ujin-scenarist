import { useEffect, useRef, useState } from 'react'

import { api, type Policy } from '../../api'
import { Chip } from '../../shared/ui/Chip'
import { Toggle } from '../../shared/ui/Toggle'
import { guard } from '../../store'
import { Panel } from './Panel'

/** Настройка УК: некритичные общедомовые заявки уходят подрядчику без подтверждения консьержа. */
export function PolicyPanel({ categories }: { categories: Record<string, string> }) {
  const [policy, setPolicy] = useState<Policy | null>(null)
  // Номер последнего сохранения: ответ более раннего запроса не перезапишет свежий выбор.
  const saveSeq = useRef(0)

  useEffect(() => {
    void guard(api.policy()).then((value) => value && setPolicy(value))
  }, [])

  if (!policy) return null

  // Оптимистично: переключатель отвечает сразу; если сервер не принял — откатываемся к прежнему.
  const save = async (next: Policy) => {
    const previous = policy
    const seq = ++saveSeq.current
    setPolicy(next)
    const saved = await guard(api.setPolicy(next))
    if (seq !== saveSeq.current) return
    setPolicy(saved ?? previous)
  }

  const toggleCategory = (category: string) => {
    const has = policy.auto_categories.includes(category)
    void save({
      ...policy,
      auto_categories: has
        ? policy.auto_categories.filter((item) => item !== category)
        : [...policy.auto_categories, category],
    })
  }

  return (
    <Panel title="Автоотправка заявок">
      <div className="space-y-3 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Некритичные общедомовые заявки без подтверждения</p>
            <p className="mt-0.5 text-meta text-ink-mute">
              Критичные уходят сразу всегда. Если выключено, некритичные ждут кнопки «Отправить».
            </p>
          </div>
          <Toggle
            checked={policy.auto_send_building}
            onChange={(next) => void save({ ...policy, auto_send_building: next })}
            label="Автоотправка некритичных общедомовых заявок"
          />
        </div>
        {policy.auto_send_building && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(categories).map(([category, title]) => (
              <Chip
                key={category}
                active={policy.auto_categories.includes(category)}
                onClick={() => toggleCategory(category)}
              >
                {title}
              </Chip>
            ))}
          </div>
        )}
        <p className="text-meta text-ink-mute">Лимит автозаявок на одно устройство: {policy.daily_limit} в сутки.</p>
      </div>
    </Panel>
  )
}
