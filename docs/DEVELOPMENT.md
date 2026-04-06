# Разработка и окружение

## Требования

| Компонент | Назначение |
|-----------|------------|
| **Node.js** | Рекомендуется **20.x** (как в CI). Нужен для `apps/obs-overlay` и `apps/desktop-host`. |
| **npm** | Установка зависимостей и скрипты. |
| **Rust** | `cargo`, `rustup` — сборка Tauri и gateway. Установка: [rustup.rs](https://rustup.rs). |
| **Платформенные зависимости Tauri** | См. [официальные Prerequisites Tauri v2](https://v2.tauri.app/start/prerequisites/) (WebView, Linux: WebKitGTK и т.д.). |

### Ошибка `failed to run cargo metadata` / `cargo: command not found`

1. Убедитесь, что `cargo` в PATH: в новом терминале выполните `source ~/.cargo/env` или перелогиньтесь.
2. В проекте скрипт `apps/desktop-host/scripts/tauri-run.sh` подтягивает `~/.cargo/bin` для команд `tauri:dev` и `tauri:build`.

---

## Первичная установка

Из **корня** репозитория:

```bash
npm install
npm --prefix apps/obs-overlay ci
npm --prefix apps/desktop-host ci
```

`ci` использует lock-файлы; для быстрой разработки допустимо `npm install` внутри каждого приложения.

---

## Команды из корня (`package.json`)

| Скрипт | Действие |
|--------|----------|
| `npm run dev` | То же, что `dev:desktop` — Tauri в режиме разработки. |
| `npm run dev:desktop` | Сборка оверлея (если нужно), dev Vite desktop UI, Tauri. |
| `npm run dev:obs-overlay` | Только Vite оверлея (отладка UI без Tauri). |
| `npm run build:obs-overlay` | Прод-сборка `apps/obs-overlay` → `dist/`. |
| `npm run build:desktop` | Оверлей + UI + установщик Tauri (`tauri:build`). |
| `npm run build` | Оверлей + только фронт desktop-host (без нативного бинарника). |

## Команды `apps/desktop-host`

| Скрипт | Действие |
|--------|----------|
| `npm run dev` | Vite UI на порту **5174** (без Tauri). |
| `npm run build:overlay` | Сборка `../obs-overlay`. |
| `npm run build:all` | Оверлей + `tsc` + сборка Vite desktop `dist/`. |
| `npm run tauri:dev` | `build:overlay` + Tauri dev (скрипт с `PATH` для `cargo`). |
| `npm run tauri:build` | `build:all` + `tauri build` (установщик). |

## Команды `apps/obs-overlay`

| Скрипт | Действие |
|--------|----------|
| `npm run dev` | Dev-сервер Vite. |
| `npm run build` | Выход в `apps/obs-overlay/dist/`. |

---

## Переменные окружения

### Корень репозитория — `.env.example`

`apps/desktop-host` при сборке может читать env из **корня** (`vite.config.ts`: `envDir` указывает на корень для desktop UI). См. [.env.example](../.env.example).

Переменные вроде `VITE_BASE_LOGO_URL` влияют на то, как оверлей **в превью** в десктопе резолвит картинки; прод-оверлей в gateway использует свой `envDir` в `apps/obs-overlay`.

### Оверлей — `apps/obs-overlay/.env.example`, `.env.production`

| Переменная | Смысл |
|------------|--------|
| `VITE_API_BASE_URL` | Пусто → запросы к **тому же origin**, что и страница (`/api/state`). Иначе полный базовый URL (см. логику в `realtimeClient.ts`). |
| `VITE_API_STATE_URL` | Явный URL для GET состояния (приоритет над построением из `VITE_API_BASE_URL`). |
| `VITE_BASE_LOGO_URL` | База для логотипов, если в `GameState` приходят только имена файлов. |
| `VITE_DISABLE_WS` | `true` — отключить WebSocket (отладка). |

Для сценария «страница с `127.0.0.1:8787`, gateway отдаёт `/api/state`» в прод-сборке оверлея обычно всё пусто (same-origin) — см. [`.env.production`](../apps/obs-overlay/.env.production).

---

## Типичный сценарий: OBS + Desktop Host

1. Установить зависимости (см. выше).
2. `npm run dev` из корня — откроется окно Tauri.
3. Ввести URL **внешнего** API (тот, что описан в [EXTERNAL_API.md](EXTERNAL_API.md)).
4. **Проверить данные** — запрос идёт из WebView; при кросс-доменном URL возможны **ошибки CORS** в превью, хотя опрос из Rust после «Запуск сервера» может работать.
5. **Запуск сервера** — поднимается локальный HTTP + WebSocket и фоновый опрос внешнего URL.
6. В OBS: **Browser Source** → URL из зелёного блока (часто `http://127.0.0.1:8787/`).

### Режим «Тест»

Кнопка **Тест** поднимает тот же gateway на порту **8787** **без** опроса внешнего API: табло показывает **дефолтное** состояние. Удобно проверить раздачу оверлея и WebSocket без бэкенда.

---

## Только оверлей (без Tauri)

```bash
npm --prefix apps/obs-overlay ci
npm --prefix apps/obs-overlay run dev
```

Для корректных `/api/state` и `/ws` в dev часто настраивают прокси в `vite.config.ts` оверлея или открывают страницу через уже запущенный gateway.

---

## Сборка оверлея перед `cargo`

Tauri при `build` ожидает папку `apps/obs-overlay/dist` (ресурс **`obs-overlay-dist`** в бандле). Команда `npm run tauri:build` / `beforeBuildCommand` вызывает `build:all` и собирает оверлей автоматически.

Ручная проверка:

```bash
npm --prefix apps/obs-overlay run build
cd apps/desktop-host/src-tauri && cargo check
```

---

## Tailwind / стили не применяются

1. Перезапустить dev-сервер.
2. Жёсткое обновление: **Cmd+Shift+R** / **Ctrl+Shift+R**.
3. Убедиться, что PostCSS и Tailwind подключены в `vite.config.ts` соответствующего приложения.

---

## Полезные пути в репозитории

| Путь | Назначение |
|------|------------|
| `packages/shared/types/gameState.ts` | Контракт `GameState`. |
| `apps/desktop-host/src/App.tsx` | UI хоста, кнопки, invoke Tauri. |
| `apps/desktop-host/src-tauri/src/gateway.rs` | Gateway: статика, `/api/state`, `/ws`, опрос внешнего API. |
| `apps/desktop-host/src-tauri/tauri.conf.json` | Tauri: `frontendDist`, `resources`, bundle. |
| `apps/obs-overlay/src/shared/realtimeClient.ts` | Fetch + WebSocket в оверлее. |

Больше связей — в [ARCHITECTURE.md](ARCHITECTURE.md).
