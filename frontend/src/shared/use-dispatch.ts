import { useCallback, useEffect, useRef, useState } from 'react'

import {
  CATEGORY_TITLES,
  FALLBACK_CONTRACTORS,
  FALLBACK_INCIDENTS,
  FALLBACK_TICKETS,
} from '../mock/fallback'
import { useStore } from '../store'
import { api, type Contractor, type Incident, type Role, type Ticket } from '../api'

export type DispatchData = {
  incidents: Incident[]
  tickets: Ticket[]
  contractors: Contractor[]
  categories: Record<string, string>
  reload: () => void
}

/**
 * Данные автодиспетчера: инциденты, заявки и пул подрядчиков.
 * Обновляются по событиям шины `incident` и `ticket`, без опроса по таймеру.
 * Роль решает видимость на бэкенде: житель видит свою квартиру, УК общедомовое и только критичное
 * из квартир. Демо-набор подставляется только когда API недоступен, иначе до загрузки списки пустые.
 */
export function useDispatchData(demo: boolean, role: Role = 'uk'): DispatchData {
  const [incidents, setIncidents] = useState<Incident[]>(demo ? FALLBACK_INCIDENTS : [])
  const [tickets, setTickets] = useState<Ticket[]>(demo ? FALLBACK_TICKETS : [])
  const [contractors, setContractors] = useState<Contractor[]>(demo ? FALLBACK_CONTRACTORS : [])
  const [categories, setCategories] = useState<Record<string, string>>(CATEGORY_TITLES)

  // Подписываемся на число (seq последнего события), а не на весь массив: лишние рендеры не нужны.
  const lastDispatchSeq = useStore(
    (state) => state.events.filter((e) => e.kind === 'incident' || e.kind === 'ticket').at(-1)?.seq ?? 0,
  )

  const requestSeq = useRef(0)

  const reload = useCallback(() => {
    if (demo) {
      // API недоступен: показываем демо-набор (флаг demo выставляется уже после первого рендера).
      setIncidents(FALLBACK_INCIDENTS)
      setTickets(FALLBACK_TICKETS)
      setContractors(FALLBACK_CONTRACTORS)
      return
    }
    const seq = ++requestSeq.current
    void Promise.all([api.incidents(role), api.tickets(role), api.contractors(), api.dictionaries()])
      .then(([nextIncidents, nextTickets, nextContractors, dictionaries]) => {
        if (seq !== requestSeq.current) return // пришёл ответ на устаревший запрос
        setIncidents(nextIncidents)
        setTickets(nextTickets)
        setContractors(nextContractors)
        setCategories(dictionaries.categories)
      })
      .catch(() => undefined)
  }, [demo, role])

  // Первый вызов сразу, дальше всплески событий схлопываем в один запрос.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      reload()
      return
    }
    const timer = setTimeout(reload, 150)
    return () => clearTimeout(timer)
  }, [reload, lastDispatchSeq])

  return { incidents, tickets, contractors, categories, reload }
}
