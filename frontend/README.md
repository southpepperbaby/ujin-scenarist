# HOMIE AI — фронтенд

React 19 + TypeScript + Vite + Tailwind 4. Одна кодовая база, три поверхности:

- `#/resident` — **житель**, мобильный экран: датчики, сценарии, разбор правила, события;
- `#/uk` — **управляющая компания**, диспетчерская: инциденты, заявки, устройства, песочница;
- `#/studio` — **студия**: конструктор устройств и блочный редактор правил (светлая тема).

Корневой маршрут `#/` — выбор роли.

## Запуск

```bash
npm ci
npm run dev        # http://localhost:5173, /api и /ws проксируются на localhost:8000
```

Бэкенд поднимается отдельно (`backend/`, FastAPI) или целиком через `docker compose up`.
Без бэкенда интерфейс не падает: включается демо-режим с запасным набором данных
(`src/mock/fallback.ts`), в шапке появляется пометка «демо-данные».

```bash
npm run build      # tsc -b && vite build
npm run lint       # oxlint
```

## Структура

```
src/
  api.ts                 клиент HTTP и WebSocket, типы бэкенда
  store.ts               zustand: устройства, правила, события, уведомления
  devices.tsx            конструктор устройств (студия)
  rules.tsx              редактор правил, линтер, прогон (студия)
  screens.tsx            сборка студии
  ui.tsx                 примитивы светлой темы (студия)

  app/                   роутинг по хэшу, выбор роли, загрузка данных
  shared/                тёмная дизайн-система: токены, иконки, форматирование, уровни
  features/resident/     мобильное приложение жителя
  features/manager/      кабинет УК
  mock/fallback.ts       данные демо-режима
```

## Тёмная тема

Токены объявлены в `src/index.css` через `@theme`: `base`, `surface`, `raised`, `field`,
`line`, `accent`, `ink*`, `ok`, `sev-info|minor|major|crit` и мягкие подложки `*-soft`.
Классы Tailwind собираются только из литералов — динамически склеенные имена не попадают
в сборку, поэтому карты стилей в `shared/severity.ts` и `shared/ticket-status.ts` записаны
полными строками.

Уровни инцидентов совпадают с политикой автодиспетчера из `docs/concept.md`:
0 — журнал, 1 — минор, 2 — мажор, 3 — критично.

## Что откуда берётся

| Экран | Источник |
|---|---|
| Датчики, плитки, песочница | `GET /api/devices`, `POST /api/devices/:id/command`, `inject`, WebSocket `/ws` |
| Сценарии жителя | `GET/PUT /api/rules`, `POST /api/simulate`, `GET /api/rules/:id/explain` |
| Создание правила словами | `POST /api/nl/compile` (LLM + линтер) |
| События жителя | `GET /api/notifications?target=resident` |
| Инциденты и вердикты Jev | `GET /api/incidents` |
| Заявки и подрядчики | `GET /api/tickets`, `POST /api/tickets/:id/transition`, `GET /api/contractors` |
