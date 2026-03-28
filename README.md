# hockey-scoreboard

Монорепозиторий с:
- `frontend` — React 18 + TypeScript + Vite + Tailwind + shadcn/ui-style компоненты.
- `backend` — FastAPI + WebSocket + авто-тик таймера через `asyncio`.
- `shared` — общий контракт `GameState` для TypeScript.

## Структура

- `frontend` — OBS overlay (`/`) и админка (`/controlpanel`)
- `backend` — API, WebSocket, хранение состояния в JSON
- `shared/types/gameState.ts` — единая TS-типизация состояния матча (`TournamentTitle`, `SeriesInfo`, `BrandingImage` и остальное)
- `backend/data/game_state.json` — persisted состояние матча

## Переменные окружения

Скопируйте `.env.example` в `frontend/.env`:

```env
VITE_BASE_LOGO_URL=http://10.7.16.212:8080
VITE_API_BASE_URL=http://localhost:8000
```

Логотипы грузятся так:
`{VITE_BASE_LOGO_URL}/logos/<fileName>`

## Запуск

1. Установить node-зависимости:
   - `npm install`
   - `npm --prefix frontend install`
2. Установить python-зависимости:
   - `python3 -m pip install -r backend/requirements.txt`
3. Запустить всё сразу:
   - `npm run dev`

Отдельно:
- `npm run dev:backend` — backend на `http://localhost:8000`
- `npm run dev:frontend` — frontend dev server на `http://localhost:5173`

### Если «нет CSS» / страница без Tailwind

1. Остановите все старые процессы Vite (иногда порт `5173` занят, и открывается другой порт — смотрите вывод в терминале).
2. Запустите снова `npm run dev` и откройте **тот** URL, который показал Vite.
3. Сделайте жёсткое обновление: `Cmd+Shift+R` (macOS) / `Ctrl+Shift+R` (Windows).
4. В DevTools → Network убедитесь, что запрос к странице идёт с **того же хоста**, что и Vite (не смешивайте `127.0.0.1` и `localhost`, если куки/CORS мешают — лучше один вариант).
5. Tailwind и Autoprefixer подключены **явно** в [`frontend/vite.config.ts`](frontend/vite.config.ts) (`css.postcss.plugins`), так что после перезапуска dev-сервера стили должны появляться.

## Маршруты

Один фронтенд (Vite в dev, статика через backend после `build`):

- Табло (OBS): `/`
- Control panel: `/controlpanel`

Примеры:

- Dev: `http://localhost:5173/` и `http://localhost:5173/controlpanel` (backend API всё равно на `:8000`)
- Production (после `npm run build`): `http://localhost:8000/` и `http://localhost:8000/controlpanel`
- API state: `GET/POST http://localhost:8000/api/state`
- WebSocket: `ws://localhost:8000/ws`

## API (основное)

- `POST /api/state` — частичное обновление любого поля `GameState`
- `POST /api/actions/goal?team=A|B&delta=1|-1`
- `POST /api/actions/period?period=<number>`
- `POST /api/actions/timer?running=true|false`
- `POST /api/actions/visible?visible=true|false`
- `POST /api/actions/powerplay?active=true|false` — вкл./выкл. большинства; при `active=true`, если `PowerPlayTimer` был `00:00`, выставляется `02:00`. Таймер большинства **тикает каждую секунду**, пока включён (независимо от паузы игровых часов `Running`). Текст «БОЛЬШИНСТВО MM:SS» — в **нижней красной полосе**.

Любое обновление мгновенно рассылается всем WS-клиентам (`OBS`, `admin`, preview).

## Build

- `npm run build` — собирает frontend в `frontend/dist`
- backend автоматически отдает собранные ассеты и страницу для `/` и `/controlpanel`

## Переход на SQLite позже

Сейчас используется `backend/data/game_state.json`.
Для миграции на SQLite достаточно заменить реализацию `StateStore`, сохранив публичные методы:
- `get()`
- `update_patch()`
- `replace()`
