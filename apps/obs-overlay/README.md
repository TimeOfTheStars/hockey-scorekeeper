# OBS Overlay

Веб-оверлей (Vite + React): собирается в `dist/`, встраивается в desktop-host и раздаётся локальным gateway.

- Состояние: same-origin **`GET /api/state`** и **`WebSocket /ws`** (см. `src/shared/realtimeClient.ts`).
- Типы: [`packages/shared/types/gameState.ts`](../../packages/shared/types/gameState.ts).

```bash
npm ci
npm run dev    # разработка
npm run build  # → dist/
```

**Полная документация:** [../../docs/README.md](../../docs/README.md).
