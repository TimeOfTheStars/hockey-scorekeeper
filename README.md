# Hockey Scoreboard

Монорепозиторий для **табло хоккейного матча в OBS**: настольное приложение (**Tauri**) поднимает локальный **gateway** (HTTP + WebSocket), опрашивает **ваш внешний API** и раздаёт готовый **веб-оверлей**.

## Возможности

- Ввод URL внешнего источника данных, проверка ответа и предпросмотр табло в окне приложения.
- Локальный сервер на `127.0.0.1` (порт по умолчанию **8787**): раздача оверлея, `GET /api/state`, `WebSocket /ws`.
- Фоновый опрос внешнего API с **shallow merge** в модель **`GameState`** (~800 мс, таймаут запроса 5 с).
- Режим **«Тест»**: gateway без внешнего API (дефолтное состояние) — проверка OBS и канала обновлений.
- Сборка установщиков для Windows / macOS / Linux и публикация через **GitHub Actions**.

## Документация

Полное описание — в каталоге **[`docs/`](docs/README.md)**:

| Раздел | Содержание |
|--------|------------|
| [docs/README.md](docs/README.md) | Оглавление и обзор |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Установка, npm-команды, env, OBS, troubleshooting |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Схема потоков данных и файлов |
| [docs/EXTERNAL_API.md](docs/EXTERNAL_API.md) | Контракт HTTP API для стороннего сервера |
| [docs/BUILD_AND_CI.md](docs/BUILD_AND_CI.md) | Локальная сборка и CI / релизы |

## Требования

- **Node.js** (рекомендуется 20.x)
- **Rust** ([rustup](https://rustup.rs)) — для `apps/desktop-host`
- Зависимости платформы для **Tauri v2**: см. [официальную инструкцию](https://v2.tauri.app/start/prerequisites/)

Если при `npm run dev` появляется ошибка вроде **`cargo metadata`**: выполните `source ~/.cargo/env` или откройте новый терминал; в проекте `apps/desktop-host/scripts/tauri-run.sh` подхватывает `cargo` для Tauri-скриптов.

## Быстрый старт (разработка + OBS)

1. Клонировать репозиторий и установить зависимости:

   ```bash
   npm install
   npm --prefix apps/obs-overlay ci
   npm --prefix apps/desktop-host ci
   ```

2. Запустить десктоп-приложение:

   ```bash
   npm run dev
   ```

3. В окне приложения: указать URL внешнего API → **Проверить данные** → **Запуск сервера** (или **Тест** без API).
4. В **OBS** добавить **Browser Source** и вставить URL из зелёного блока (часто `http://127.0.0.1:8787/`).

Подробности: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Структура репозитория

| Путь | Назначение |
|------|------------|
| [`apps/obs-overlay`](apps/obs-overlay) | OBS-оверлей: Vite + React, `dist/` вкладывается в Tauri |
| [`apps/desktop-host`](apps/desktop-host) | UI хоста + Tauri + Rust gateway (`src-tauri/`) |
| [`packages/shared/types`](packages/shared/types) | Общий тип **`GameState`** |
| [`docs/`](docs) | Документация |
| [`.github/workflows/`](.github/workflows) | CI и релизы |

Кратко по приложениям: [apps/desktop-host/README.md](apps/desktop-host/README.md), [apps/obs-overlay/README.md](apps/obs-overlay/README.md).

## Команды из корня

| Команда | Описание |
|---------|----------|
| `npm run dev` | Режим разработки Tauri (десктоп-хост) |
| `npm run dev:obs-overlay` | Только dev-сервер оверлея |
| `npm run build:obs-overlay` | Прод-сборка оверлея |
| `npm run build:desktop` | Оверлей + установщик Tauri |
| `npm run build` | Оверлей + сборка фронта desktop без установщика |

## Сборка релиза локально

```bash
npm run build:desktop
```

Артефакты: `apps/desktop-host/src-tauri/target/release/bundle/`. Подробнее: [docs/BUILD_AND_CI.md](docs/BUILD_AND_CI.md).

## Переменные окружения

Примеры: корневой [`.env.example`](.env.example), [`apps/obs-overlay/.env.example`](apps/obs-overlay/.env.example). Разбор — в [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#переменные-окружения).
