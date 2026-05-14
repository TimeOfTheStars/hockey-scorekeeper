import { useEffect, useMemo, useRef, useState } from "react";
import type { GameState } from "../../../../packages/shared/types/gameState";
import { defaultGameState } from "../../../../packages/shared/types/gameState";
import type { ServerScoreboardRow } from "../../../../packages/shared/types/serverScoreboard";

function resolvePort(): number {
  if (typeof window === "undefined") return 8787;
  const fromQuery = new URLSearchParams(window.location.search).get("port");
  const n = fromQuery ? Number(fromQuery) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 8787;
}

export function useGatewayWs() {
  const [port] = useState(resolvePort);
  const [state, setState] = useState<GameState>(defaultGameState);
  const [source, setSource] = useState<ServerScoreboardRow | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;

    const connect = () => {
      if (cancelled) return;
      const url = `ws://127.0.0.1:${port}/ws`;
      try {
        ws = new WebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }
      ws.onopen = () => {
        if (cancelled) return;
        setConnected(true);
      };
      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          const message = JSON.parse(event.data) as {
            type?: string;
            payload?: GameState;
            source?: ServerScoreboardRow;
          };
          if (message.type === "state") {
            if (message.payload) setState(message.payload);
            if (message.source) setSource(message.source);
          }
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        if (cancelled) return;
        setConnected(false);
        scheduleReconnect();
      };
      ws.onerror = () => {
        if (cancelled) return;
        setConnected(false);
      };
    };

    const scheduleReconnect = () => {
      if (cancelled) return;
      if (reconnectTimer.current !== null) return;
      reconnectTimer.current = window.setTimeout(() => {
        reconnectTimer.current = null;
        connect();
      }, 1000);
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer.current !== null) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      if (ws) ws.close();
    };
  }, [port]);

  return useMemo(() => ({ state, source, connected, port }), [state, source, connected, port]);
}
