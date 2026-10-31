import { useEffect, useState } from 'react'

import { api } from '../api'
import { CATEGORY_TITLES } from '../mock/fallback'

// Справочник категорий один на всё приложение: запрашиваем один раз, до ответа показываем встроенный.
let cached: Promise<Record<string, string>> | null = null

export function useCategories(): Record<string, string> {
  const [categories, setCategories] = useState<Record<string, string>>(CATEGORY_TITLES)
  useEffect(() => {
    cached ??= api.dictionaries().then((d) => d.categories)
    cached.then(setCategories).catch(() => {
      cached = null // следующий экран попробует ещё раз
    })
  }, [])
  return categories
}
