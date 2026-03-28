import { useEffect, useMemo, useState } from "react";
import type { GameState } from "../../../shared/types/gameState";
import { defaultGameState } from "../../../shared/types/gameState";

/** Пустая строка = тот же origin (в dev Vite проксирует `/api` и `/ws` на backend). Иначе полный origin, опционально с путём, например `http://host:8080/api/vmix`. */
function resolveApiBase(): string {
  const raw = import.meta.env.VITE_API_BASE_URL?.trim();
  if (raw === undefined || raw === "") {
    return "";
  }
  return raw.replace(/\/+$/, "");
}

const API_BASE = resolveApiBase();

/** Явный URL для GET/POST состояния (если задан — имеет приоритет). */
function resolveStateUrl(): string | undefined {
  const raw = import.meta.env.VITE_API_STATE_URL?.trim();
  if (raw === undefined || raw === "") {
    return undefined;
  }
  return raw.replace(/\/+$/, "");
}

const STATE_URL_OVERRIDE = resolveStateUrl();

function stateUrl(): string {
  const override = STATE_URL_OVERRIDE;
  if (override) {
    return override;
  }
  if (API_BASE === "") {
    return "/api/state";
  }
  // Сервер vmix отдаёт состояние на самом пути /api/vmix, без суффикса /api/state
  if (/\/api\/vmix$/i.test(API_BASE)) {
    return API_BASE;
  }
  return `${API_BASE}/api/state`;
}

/** WS только если состояние грузится с того же origin (или относительным URL через прокси). Иначе локальный /ws перетирает данные с внешнего API (например vmix). */
function shouldSyncViaWebSocket(): boolean {
  if (import.meta.env.VITE_DISABLE_WS === "true") {
    return false;
  }
  const url = stateUrl();
  if (url.startsWith("/")) {
    return true;
  }
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return new URL(url).origin === window.location.origin;
  } catch {
    return false;
  }
}

function wsRootUrl(): string {
  if (API_BASE === "") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}`;
  }
  return API_BASE.replace(/^http/, "ws");
}

export async function patchState(patch: Partial<GameState>) {
  await fetch(stateUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function runAction(path: string) {
  await fetch(`${API_BASE}${path}`, { method: "POST" });
}

function warnFetchFailure(url: string, detail: string) {
  if (import.meta.env.DEV) {
    console.warn(`[scoreboard] нет данных с API (${detail}). Показаны значения по умолчанию из кода. URL: ${url}`);
  }
}

export function useRealtimeGameState() {
  const [state, setState] = useState<GameState>(defaultGameState);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let pollId: number | null = null;

    const fetchState = async () => {
      const url = stateUrl();
      try {
        const response = await fetch(url);
        if (!response.ok) {
          warnFetchFailure(url, `HTTP ${response.status}`);
          return;
        }
        const raw = (await response.json()) as GameState | GameState[];
        const one = Array.isArray(raw) ? raw[0] : raw;
        if (!one || typeof one !== "object") {
          warnFetchFailure(url, "неверный JSON");
          return;
        }
        const payload = { ...defaultGameState, ...one } as GameState;
        setState(payload);
      } catch (e) {
        warnFetchFailure(url, e instanceof Error ? e.message : String(e));
      }
    };

    const startPolling = () => {
      if (pollId !== null) {
        return;
      }
      pollId = window.setInterval(fetchState, 800);
    };

    fetchState();

    if (shouldSyncViaWebSocket()) {
      try {
        ws = new WebSocket(`${wsRootUrl()}/ws`);
        ws.onopen = () => {
          setConnected(true);
          if (pollId !== null) {
            clearInterval(pollId);
            pollId = null;
          }
        };
        ws.onmessage = (event) => {
          const message = JSON.parse(event.data) as {
            type: string;
            payload: GameState;
          };
          if (message.type === "state") {
            setState(message.payload);
          }
        };
        ws.onclose = () => {
          setConnected(false);
          startPolling();
        };
        ws.onerror = () => {
          setConnected(false);
          startPolling();
        };
      } catch {
        startPolling();
      }
    } else {
      startPolling();
    }

    return () => {
      if (ws) {
        ws.close();
      }
      if (pollId !== null) {
        clearInterval(pollId);
      }
    };
  }, []);

  return useMemo(() => ({ state, connected }), [state, connected]);
}
