import { useCallback, useEffect, useState } from 'react'

import {
  CATEGORY_TITLES,
  FALLBACK_CONTRACTORS,
  FALLBACK_INCIDENTS,
  FALLBACK_TICKETS,
} from '../mock/fallback'
import { useStore } from '../store'
import { api, type Contractor, type Incident, type Ticket } from '../api'

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
 */
export function useDispatchData(demo: boolean): DispatchData {
  const [incidents, setIncidents] = useState<Incident[]>(FALLBACK_INCIDENTS)
  const [tickets, setTickets] = useState<Ticket[]>(FALLBACK_TICKETS)
  const [contractors, setContractors] = useState<Contractor[]>(FALLBACK_CONTRACTORS)
  const [categories, setCategories] = useState<Record<string, string>>(CATEGORY_TITLES)

  const events = useStore((state) => state.events)
  const lastDispatchSeq = events.filter((e) => e.kind === 'incident' || e.kind === 'ticket').at(-1)?.seq ?? 0

  const reload = useCallback(() => {
    if (demo) return
    void Promise.all([api.incidents(), api.tickets(), api.contractors(), api.dictionaries()])
      .then(([nextIncidents, nextTickets, nextContractors, dictionaries]) => {
        setIncidents(nextIncidents)
        setTickets(nextTickets)
        setContractors(nextContractors)
        setCategories(dictionaries.categories)
      })
      .catch(() => undefined)
  }, [demo])

  useEffect(reload, [reload, lastDispatchSeq])

  return { incidents, tickets, contractors, categories, reload }
}
