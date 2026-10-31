import type { IconName } from '../../shared/ui/Icon'

export type NavItem = { to: string; label: string; icon: IconName; title: string; subtitle: string }

/** Разделы кабинета: одна таблица для сайдбара, шапки и палитры ⌘K. */
export const NAV_ITEMS: NavItem[] = [
  {
    to: '/uk',
    label: 'Дашборд',
    icon: 'grid',
    title: 'Дашборд',
    subtitle: 'ЖК «Северный», корп. 1 · общедомовое оборудование и квартиры',
  },
  {
    to: '/uk/assistant',
    label: 'Ассистент',
    icon: 'spark',
    title: 'Ассистент',
    subtitle: 'Вопрос о доме, разовая команда или правило уровня дома в одном окне',
  },
  {
    to: '/uk/incidents',
    label: 'Инциденты',
    icon: 'alert',
    title: 'Инциденты',
    subtitle: 'Что случилось в доме, насколько это серьёзно и что уже сделано',
  },
  {
    to: '/uk/tickets',
    label: 'Заявки',
    icon: 'wrench',
    title: 'Заявки',
    subtitle: 'Очередь подрядчиков, сроки по договору и источник заявки',
  },
  {
    to: '/uk/devices',
    label: 'Устройства',
    icon: 'building',
    title: 'Устройства',
    subtitle: 'Общедомовое оборудование: добавить, изменить, создать свой тип',
  },
  {
    to: '/uk/rules',
    label: 'Правила',
    icon: 'sliders',
    title: 'Правила',
    subtitle: 'Сценарии «когда, если, то»: включить, изменить, создать новый',
  },
  {
    to: '/uk/sandbox',
    label: 'Песочница',
    icon: 'play',
    title: 'Песочница',
    subtitle: 'Эмуляторы Ujin: ручные воздействия и живая шина событий',
  },
]

export function navFor(path: string): NavItem {
  return NAV_ITEMS.find((item) => item.to === path) ?? NAV_ITEMS[0]!
}
