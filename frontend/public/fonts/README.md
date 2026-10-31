# Шрифт Segala

Файлы семейства сюда, в формате woff2, с этими именами:

- `Segala-Regular.woff2` — 400
- `Segala-Medium.woff2` — 500
- `Segala-SemiBold.woff2` — 600, рабочее начертание заголовков
- `Segala-Bold.woff2` — 700

`@font-face` объявлены в `src/index.css` и сейчас берут только локально установленный Segala.
Положив файлы, допишите в `src` каждого начертания `url('/fonts/Segala-*.woff2') format('woff2')`.
Без шрифта интерфейс работает на Inter Variable из `@fontsource-variable/inter`.

Шрифт коммерческий, в репозиторий не коммитим: держим локально или раздаём
через приватный CDN и подменяем `src` в `@font-face`.
