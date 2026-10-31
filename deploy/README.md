# Деплой

Сервер: VPS команды, пользователь `varya`, Docker rootless. Root-доступа у этого пользователя нет,
он не видит секреты и сервисы на сервере, его процессы и контейнеры ограничены 3 ГБ памяти и 2 ядрами.

| Что | Где |
|---|---|
| Репозиторий на сервере | `~/ujin-scenarist` |
| Секреты | `~/ujin-scenarist/.env`, `~/ujin-scenarist/secrets/ujin.json` (вне git) |
| Стек | `docker compose up -d --build`, сайт на `127.0.0.1:8800` |
| Публичный адрес стека | https://dev.scenarist.85-137-253-204.sslip.io |
| Автодеплой | push в `main` → GitHub Actions `.github/workflows/deploy.yml` |

Docker rootless работает через сокет пользователя, переменные уже прописаны в `~/.bashrc`:

    export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock

Ограничения rootless: публиковать можно только порты от 1024, контейнеры не получают root на хосте.
Порт 80 и HTTPS держит Caddy сервера, он проксирует публичный адрес на `127.0.0.1:8800`.
