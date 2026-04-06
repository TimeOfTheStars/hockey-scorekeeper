# Архитектура

## Общая схема

```text
┌─────────────────────┐     GET ~800 ms      ┌──────────────────────┐
│ Внешний HTTP API    │ ◄───────────────────  │ Rust gateway (Tauri) │
│ (vmix / свой бэкенд)│                      │ poll + merge JSON    │
└─────────────────────┘                      └──────────┬───────────┘
                                                        │
                       ┌────────────────────────────────┼────────────────────────────────┐
                       │                                │                                │
                       ▼                                ▼                                ▼
              GET /api/state                    WebSocket /ws                  статика obs-overlay
              JSON GameState                  {"type":"state",                (index.html, assets)
                                              "payload": {...}}
                       │                                │
                       └────────────────┬───────────────┘
                                        ▼
                              ┌─────────────────────┐
                              │ OBS Browser Source  │
                              │ localhost:8787      │
                              └─────────────────────┘
```

Пользовательский UI управления (URL, порт, старт/стоп) живёт во **встроенном WebView** Tauri и вызывает команды Rust (`start_score_gateway`, `stop_score_gateway`).

---

## Каталоги монорепозитория

| Каталог | Роль |
|---------|------|
| `apps/obs-overlay` | Страница табло для OBS: React, Tailwind, `realtimeClient` (HTTP + WS). Прод-сборка: `dist/`. |
| `apps/desktop-host` | Два слоя: (1) Vite/React UI «хоста» в `src/`; (2) Tauri + Rust в `src-tauri/`. |
| `packages/shared/types` | Общий тип `GameState` и `defaultGameState` для TS; логика дефолтов дублируется в Rust. |
| `docs/` | Документация. |

---

## Поток данных

### 1. Опрос внешнего API (не в режиме «Тест»)

- Реализация: `poll_loop` в `gateway.rs`.
- Метод: **GET** на URL из UI.
- Таймаут запроса: **5 с**; интервал цикла: **~800 мс**.
- Успех только при статусе **2xx**; тело парсится как JSON (`serde_json::Value`).
- **Слияние**: `merge_external_payload` — если корень массив, берётся элемент `[0]`; затем **shallow merge** поверх `default_state_value()` (те же поля, что в `gameState.ts`).
- Результат кладётся в `Arc<RwLock<Value>>` и рассылается подписчикам WebSocket.

### 2. Локальный HTTP (Axum)

- `GET /api/state` — текущее смерженное состояние.
- `GET /ws` — upgrade на WebSocket; первое сообщение и дальнейшие пуши — JSON с `type: "state"` и полным `payload`.
- Остальные пути — `ServeDir` из каталога собранного оверлея (`index.html` + hashed assets).

### 3. Режим «Тест»

- Флаг `test_mode` в команде старта: **не** создаётся `poll_loop`; состояние остаётся **дефолтным** из `default_state_value()`.

### 4. Оверлей в браузере OBS

- `realtimeClient.ts` определяет URL состояния и включение WS по `VITE_*` и same-origin (см. комментарии в файле).
- В типичном прод-запуске страница и API — один origin (`127.0.0.1:порт`), поэтому включается опрос `/api/state` и `ws://.../ws`.

---

## Встраивание оверлея в установщик

- В `tauri.conf.json` в `bundle.resources` копируется **`../../obs-overlay/dist/`** в **`obs-overlay-dist/`** внутри ресурсов приложения.
- В runtime `gateway.rs` сначала ищет файлы через `AppHandle::path().resolve("obs-overlay-dist", BaseDirectory::Resource)`, при неудаче — dev-путь **`../../obs-overlay/dist`** относительно `src-tauri`.

Так установленное приложение **не зависит** от структуры исходников на диске пользователя.

---

## Синхронизация контракта данных

Три источника истины по смыслу полей табло:

1. `packages/shared/types/gameState.ts` — типы и `defaultGameState`.
2. `apps/desktop-host/src/shared/parseExternalState.ts` — превью в UI (`{...defaultGameState, ...partial}`).
3. `gateway.rs` — `default_state_value()` и `merge_external_payload()`.

Изменяя поля, обновляйте **все три** и документ [EXTERNAL_API.md](EXTERNAL_API.md).

---

## Пресеты и команды Tauri

- `lib.rs`: регистрация команд, `GatewayController` в `State`.
- `beforeBuildCommand` / `beforeDevCommand` в `tauri.conf.json` вызывают npm-скрипты сборки фронта и оверлея.

---

## Ограничения текущей реализации

- Опрос внешнего API — только **GET**, без настраиваемых заголовков из UI.
- Локальный gateway **не** реализует `POST` для ручного патча состояния (в `realtimeClient` есть `patchState`, ориентированный на другие бэкенды).
- Превью «Проверить данные» использует `fetch` из WebView — возможен **CORS**, тогда как Rust-опрос после старта сервера CORS не затрагивается.
