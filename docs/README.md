# Документация Hockey Scoreboard

Монорепозиторий: **OBS-оверлей** (Vite + React), **настольный хост** (Tauri 2 + Rust gateway), общие типы **`GameState`**.

## Оглавление

| Документ | Описание |
|----------|----------|
| **[Разработка и окружение](DEVELOPMENT.md)** | Установка зависимостей, команды npm, переменные окружения, OBS, режим «Тест», типовые проблемы |
| **[Архитектура](ARCHITECTURE.md)** | Потоки данных, каталоги, синхронизация Rust и TypeScript, локальный gateway |
| **[Внешний API источника данных](EXTERNAL_API.md)** | Контракт HTTP API для стороннего сервера (GET, JSON, поля `GameState`, примеры) |
| **[Сборка и CI](BUILD_AND_CI.md)** | Локальные установщики Tauri, GitHub Actions, релизы |

## Назначение системы

1. Внешний сервис отдаёт **снимок табло** по HTTP (см. [EXTERNAL_API.md](EXTERNAL_API.md)).
2. Пользователь вводит URL в **Desktop Host**, проверяет ответ и запускает **локальный gateway** на `127.0.0.1` (порт по умолчанию **8787**).
3. **OBS Browser Source** открывает URL вида `http://127.0.0.1:8787/` — загружается собранный оверлей; состояние приходит через **`/api/state`** и **`WebSocket /ws`**, без прямого доступа OBS к внешнему API.

## Быстрый старт (ссылка)

См. корневой [README.md](../README.md).

## Версии и согласованность

- Версия десктопа: `apps/desktop-host/package.json`, `apps/desktop-host/src-tauri/tauri.conf.json`, `apps/desktop-host/src-tauri/Cargo.toml`.
- Логика полей табло должна совпадать: `packages/shared/types/gameState.ts`, `apps/desktop-host/src/shared/parseExternalState.ts`, функции `default_state_value` / `merge_external_payload` в `apps/desktop-host/src-tauri/src/gateway.rs`.

При изменении контракта обновляйте **все три места** и [EXTERNAL_API.md](EXTERNAL_API.md).
