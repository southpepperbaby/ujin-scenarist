import { useCallback, useEffect, useRef, useState } from 'react'

import { CATEGORY_TITLES, FALLBACK_CONTRACTORS, FALLBACK_INCIDENTS, FALLBACK_TICKETS } from '../mock/fallback'
import { useStore } from '../store'
import { api, type Contractor, type Incident, type Role, type Ticket } from '../api'
import { toastError } from './toast'

export type DispatchData = {
  incidents: Incident[]
  tickets: Ticket[]
  contractors: Contractor[]
  categories: Record<string, string>
  /** Первый ответ получен: до этого пустые списки значат «ещё грузим», а не «ничего нет». */
  loaded: boolean
  reload: () => void
}

/**
 * Данные автодиспетчера: инциденты, заявки и пул подрядчиков.
 * Обновляются по событиям шины `incident` и `ticket`, без опроса по таймеру.
 * Роль решает видимость на бэкенде: житель видит свою квартиру, УК общедомовое и только критичное
 * из квартир. Жителю нужны только заявки, лишние запросы за ним не тянем.
 * Каждый запрос живёт сам по себе: упавший справочник не оставляет экран без заявок.
 */
export function useDispatchData(demo: boolean, role: Role = 'uk'): DispatchData {
  const [incidents, setIncidents] = useState<Incident[]>(demo ? FALLBACK_INCIDENTS : [])
  const [tickets, setTickets] = useState<Ticket[]>(demo ? FALLBACK_TICKETS : [])
  const [contractors, setContractors] = useState<Contractor[]>(demo ? FALLBACK_CONTRACTORS : [])
  const [categories, setCategories] = useState<Record<string, string>>(CATEGORY_TITLES)
  const [loaded, setLoaded] = useState(demo)

  // Подписываемся на число (seq последнего события), а не на весь массив: лишние рендеры не нужны.
  const lastDispatchSeq = useStore(
    (state) => state.events.findLast((e) => e.kind === 'incident' || e.kind === 'ticket')?.seq ?? 0,
  )

  const requestSeq = useRef(0)

  const reload = useCallback(() => {
    if (demo) {
      setIncidents(FALLBACK_INCIDENTS)
      setTickets(FALLBACK_TICKETS)
      setContractors(FALLBACK_CONTRACTORS)
      setLoaded(true)
      return
    }
    const seq = ++requestSeq.current
    const full = role === 'uk'
    void Promise.allSettled([
      api.tickets(role),
      full ? api.incidents(role) : Promise.resolve(null),
      full ? api.contractors() : Promise.resolve(null),
      full ? api.dictionaries() : Promise.resolve(null),
    ] as const).then(([nextTickets, nextIncidents, nextContractors, dictionaries]) => {
      if (seq !== requestSeq.current) return // пришёл ответ на устаревший запрос
      if (nextTickets.status === 'fulfilled') setTickets(nextTickets.value)
      if (nextIncidents.status === 'fulfilled' && nextIncidents.value) setIncidents(nextIncidents.value)
      if (nextContractors.status === 'fulfilled' && nextContractors.value) setContractors(nextContractors.value)
      if (dictionaries.status === 'fulfilled' && dictionaries.value) setCategories(dictionaries.value.categories)
      const failed = [nextTickets, nextIncidents, nextContractors, dictionaries].find((r) => r.status === 'rejected')
      if (failed) toastError(`Данные диспетчера не обновились: ${(failed.reason as Error).message}`)
      setLoaded(true)
    })
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

  return { incidents, tickets, contractors, categories, loaded, reload }
}
