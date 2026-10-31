import { Command } from 'cmdk'
import { useEffect, type ReactNode } from 'react'

import type { Device, Incident } from '../../api'
import { navigate } from '../../app/routing'
import { runAction, type AppAction } from '../../shared/actions'
import { formatClock } from '../../shared/format'
import { levelStyle } from '../../shared/severity'
import { toggleTheme, useTheme } from '../../shared/use-theme'
import { Icon, type IconName } from '../../shared/ui/Icon'
import { NAV_ITEMS } from './nav'

type CommandPaletteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  devices: Device[]
  incidents: Incident[]
}

const ACTIONS: { action: AppAction; to: string; label: string; icon: IconName; keywords: string[] }[] = [
  { action: 'new-ticket', to: '/uk/tickets', label: 'Создать заявку подрядчику', icon: 'wrench', keywords: ['заявка', 'ремонт'] },
  { action: 'new-rule', to: '/uk/rules', label: 'Новое правило дома', icon: 'sliders', keywords: ['сценарий', 'правило'] },
  { action: 'new-device', to: '/uk/devices', label: 'Добавить устройство', icon: 'building', keywords: ['датчик', 'устройство'] },
]

function Row({ icon, children, hint }: { icon: IconName; children: ReactNode; hint?: ReactNode }) {
  return (
    <>
      <Icon name={icon} size={17} className="shrink-0 text-ink-mute" />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="shrink-0 text-meta text-ink-mute">{hint}</span>}
    </>
  )
}

const ITEM =
  'flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink data-[selected=true]:bg-raised data-[selected=true]:text-ink'
const GROUP =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-caption [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-ink-mute'

/** Палитра ⌘K: перейти куда угодно, запустить действие, найти инцидент или устройство с клавиатуры. */
export function CommandPalette({ open, onOpenChange, devices, incidents }: CommandPaletteProps) {
  const theme = useTheme()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  const go = (to: string) => {
    onOpenChange(false)
    navigate(to)
  }

  const recent = [...incidents].reverse().slice(0, 8)
  const building = devices.filter((device) => device.scope === 'building').slice(0, 30)

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Командная палитра"
      loop
      overlayClassName="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm"
      contentClassName="surface fixed top-[14vh] left-1/2 z-50 w-[min(640px,calc(100%-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl shadow-2xl"
    >
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Icon name="search" size={18} className="text-ink-mute" />
        <Command.Input
          placeholder="Куда перейти или что сделать?"
          className="h-13 flex-1 bg-transparent text-lead text-ink outline-none placeholder:text-ink-mute"
        />
        <span className="kbd">Esc</span>
      </div>
      <Command.List className="scroll-slim max-h-[min(420px,60vh)] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-8 text-center text-body text-ink-mute">Ничего не нашлось.</Command.Empty>

        <Command.Group heading="ДЕЙСТВИЯ" className={GROUP}>
          {ACTIONS.map((item) => (
            <Command.Item
              key={item.action}
              keywords={item.keywords}
              className={ITEM}
              onSelect={() => {
                go(item.to)
                runAction(item.action)
              }}
            >
              <Row icon={item.icon}>{item.label}</Row>
            </Command.Item>
          ))}
          <Command.Item
            keywords={['тема', 'тёмная', 'светлая', 'ночь']}
            className={ITEM}
            onSelect={() => {
              toggleTheme()
              onOpenChange(false)
            }}
          >
            <Row icon={theme === 'dark' ? 'sun' : 'moon'}>{theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}</Row>
          </Command.Item>
        </Command.Group>

        <Command.Group heading="РАЗДЕЛЫ" className={GROUP}>
          {NAV_ITEMS.map((item) => (
            <Command.Item key={item.to} className={ITEM} onSelect={() => go(item.to)}>
              <Row icon={item.icon}>{item.label}</Row>
            </Command.Item>
          ))}
          <Command.Item className={ITEM} keywords={['выход', 'роль']} onSelect={() => go('/')}>
            <Row icon="logout">Сменить роль</Row>
          </Command.Item>
        </Command.Group>

        {recent.length > 0 && (
          <Command.Group heading="ПОСЛЕДНИЕ ИНЦИДЕНТЫ" className={GROUP}>
            {recent.map((incident) => {
              const style = levelStyle(incident.verdict?.level ?? 0)
              return (
                <Command.Item
                  key={incident.id}
                  value={`${incident.id} ${incident.title} ${incident.device_title} ${incident.room}`}
                  className={ITEM}
                  onSelect={() => go('/uk/incidents')}
                >
                  <Row icon={style.icon} hint={formatClock(incident.ts)}>
                    <span className={style.text}>{style.short}</span> {incident.title} · {incident.room}
                  </Row>
                </Command.Item>
              )
            })}
          </Command.Group>
        )}

        {building.length > 0 && (
          <Command.Group heading="УСТРОЙСТВА ДОМА" className={GROUP}>
            {building.map((device) => (
              <Command.Item
                key={device.id}
                value={`${device.id} ${device.title} ${device.room} ${device.family}`}
                className={ITEM}
                onSelect={() => go('/uk/sandbox')}
              >
                <Row icon="gauge" hint={device.online ? device.room : 'нет связи'}>
                  {device.title}
                </Row>
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
      <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-meta text-ink-mute">
        <span className="flex items-center gap-1.5">
          <span className="kbd">↑</span>
          <span className="kbd">↓</span> выбрать
        </span>
        <span className="flex items-center gap-1.5">
          <span className="kbd">Enter</span> открыть
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="kbd">Ctrl</span>
          <span className="kbd">K</span> открыть палитру
        </span>
      </div>
    </Command.Dialog>
  )
}
