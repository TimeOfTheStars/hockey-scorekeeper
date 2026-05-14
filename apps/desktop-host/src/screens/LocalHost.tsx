import { invoke } from "@tauri-apps/api/core";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
  MonitorPlay,
  SlidersHorizontal,
  Square,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { GameState } from "../../../../packages/shared/types/gameState";
import { defaultGameState } from "../../../../packages/shared/types/gameState";
import { ObsScoreboardView } from "../../../obs-overlay/src/obs-scoreboard/ObsScoreboardView";
import type { IceFieldId, TeamNameMode } from "../shared/parseExternalState";

const DEFAULT_GATEWAY_PORT = 8787;

export function LocalHost({ onBack }: { onBack: () => void }) {
  const [numFields, setNumFields] = useState<1 | 2>(1);
  const [iceField, setIceField] = useState<IceFieldId>("A");
  const [nameMode, setNameMode] = useState<TeamNameMode>("short");
  const [localPort, setLocalPort] = useState<number>(DEFAULT_GATEWAY_PORT);
  const [obsUrl, setObsUrl] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState<GameState>(defaultGameState);
  const [error, setError] = useState<string>("");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!running || !obsUrl) {
      return;
    }
    let cancelled = false;
    const wsUrl = obsUrl.replace(/^http/, "ws").replace(/\/+$/, "") + "/ws";
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onmessage = (event) => {
      if (cancelled) return;
      try {
        const message = JSON.parse(event.data) as { type: string; payload: GameState };
        if (message.type === "state" && message.payload) {
          setPreview(message.payload);
        }
      } catch {
        /* ignore */
      }
    };
    return () => {
      cancelled = true;
      wsRef.current = null;
      ws.close();
    };
  }, [running, obsUrl]);

  const onStart = async () => {
    if (running) return;
    setError("");
    try {
      const url = await invoke<string>("start_score_gateway", {
        apiUrl: "",
        port: localPort,
        sourceMode: "local",
        iceField: numFields === 2 ? iceField : "A",
        nameMode,
        numFields,
      });
      setObsUrl(url);
      setRunning(true);
      await invoke("open_control_window");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onStop = async () => {
    setError("");
    try {
      await invoke("stop_score_gateway");
      setObsUrl(null);
      setRunning(false);
      setPreview(defaultGameState);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onIceFieldChange = async (next: IceFieldId) => {
    setIceField(next);
    if (!running) return;
    try {
      await invoke("set_scoreboard_field", { field: next });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onNameModeChange = async (next: TeamNameMode) => {
    if (next === nameMode) return;
    setNameMode(next);
    if (!running) return;
    try {
      await invoke("set_scoreboard_name_mode", { mode: next });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onNumFieldsChange = async (next: 1 | 2) => {
    if (next === numFields) return;
    setNumFields(next);
    if (next === 1) setIceField("A");
    if (!running) return;
    try {
      await invoke("set_num_fields", { value: next });
      if (next === 1) {
        await invoke("set_scoreboard_field", { field: "A" });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const [urlCopied, setUrlCopied] = useState(false);
  const copyObsUrl = async () => {
    if (!obsUrl) return;
    try {
      await navigator.clipboard.writeText(obsUrl);
      setUrlCopied(true);
      window.setTimeout(() => setUrlCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const reopenControl = async () => {
    if (!running) return;
    try {
      await invoke("open_control_window");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-zinc-800/80 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <button
              type="button"
              onClick={onBack}
              disabled={running}
              className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-zinc-500 transition hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Назад к выбору
            </button>
            <div className="flex items-center gap-2 text-zinc-500">
              <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden />
              <span className="text-xs font-medium uppercase tracking-wider">Источник: локально</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Локальное ведение табло</h1>
            <p className="max-w-xl text-sm text-zinc-500">
              Параметры → запуск → панель управления табло открывается отдельным окном.
            </p>
          </div>
        </header>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:items-start">
          <div className="space-y-6">
            <section className="rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-5 shadow-sm ring-1 ring-white/[0.03] backdrop-blur-sm sm:p-6">
              <h2 className="text-sm font-semibold text-white">Параметры</h2>
              <p className="mt-1 text-xs text-zinc-500">Стартовая конфигурация локального табло.</p>

              <div className="mt-5 space-y-5">
                <div>
                  <span className="mb-2 block text-xs font-medium text-zinc-400">Кол-во полей</span>
                  <div
                    className="inline-flex rounded-xl border border-zinc-700/80 bg-zinc-950/60 p-1"
                    role="group"
                  >
                    {([1, 2] as const).map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                          numFields === n ? "bg-zinc-700 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                        }`}
                        onClick={() => void onNumFieldsChange(n)}
                      >
                        {n} {n === 1 ? "поле" : "поля"}
                      </button>
                    ))}
                  </div>
                </div>

                {numFields === 2 ? (
                  <div>
                    <span className="mb-2 block text-xs font-medium text-zinc-400">Активное поле в overlay</span>
                    <div className="inline-flex rounded-xl border border-zinc-700/80 bg-zinc-950/60 p-1" role="group">
                      {(["A", "B"] as const).map((f) => (
                        <button
                          key={f}
                          type="button"
                          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                            iceField === f ? "bg-zinc-700 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                          }`}
                          onClick={() => void onIceFieldChange(f)}
                        >
                          Поле {f}
                          <span className="mt-0.5 block text-[10px] font-normal uppercase tracking-wide text-zinc-500">
                            fields.{f}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div>
                  <span className="mb-2 block text-xs font-medium text-zinc-400">Названия команд</span>
                  <div className="inline-flex rounded-xl border border-zinc-700/80 bg-zinc-950/60 p-1" role="group">
                    {(["short", "full"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                          nameMode === m ? "bg-zinc-700 text-white shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                        }`}
                        onClick={() => void onNameModeChange(m)}
                      >
                        {m === "short" ? "Короткое" : "Полное"}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="block max-w-[12rem]">
                  <span className="mb-1.5 block text-xs font-medium text-zinc-400">Порт gateway</span>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-zinc-700/80 bg-zinc-950/80 px-3.5 py-2.5 text-sm tabular-nums outline-none transition focus:border-amber-600/60 focus:ring-2 focus:ring-amber-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                    value={localPort}
                    min={1024}
                    max={65535}
                    onChange={(e) => setLocalPort(Number(e.target.value) || DEFAULT_GATEWAY_PORT)}
                    disabled={running}
                  />
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-5 shadow-sm ring-1 ring-white/[0.03] backdrop-blur-sm sm:p-6">
              <h2 className="text-sm font-semibold text-white">Действия</h2>
              <p className="mt-1 text-xs text-zinc-500">Запуск открывает панель управления отдельным окном.</p>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-amber-950 shadow-md shadow-amber-900/30 transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() => void onStart()}
                  disabled={running}
                >
                  <MonitorPlay className="h-4 w-4 shrink-0" aria-hidden />
                  Запустить локально
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-600/80 bg-zinc-800/80 px-4 py-2.5 text-sm font-medium text-zinc-100 transition hover:bg-zinc-700/90 disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() => void reopenControl()}
                  disabled={!running}
                >
                  <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden />
                  Открыть панель
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-600 bg-transparent px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-800/50 disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() => void onStop()}
                  disabled={!running}
                >
                  <Square className="h-3.5 w-3.5 shrink-0 fill-current opacity-80" aria-hidden />
                  Остановить
                </button>
              </div>
            </section>

            {obsUrl ? (
              <div className="rounded-2xl border border-emerald-800/60 bg-emerald-950/25 p-5 ring-1 ring-emerald-500/10 sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-100">
                      <MonitorPlay className="h-4 w-4 text-emerald-400" aria-hidden />
                      Ссылка для OBS
                    </div>
                    <p className="mt-1 text-xs text-emerald-200/70">Browser Source → вставьте URL.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyObsUrl()}
                    className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-emerald-600/50 bg-emerald-900/40 px-3.5 py-2 text-xs font-medium text-emerald-100 transition hover:bg-emerald-800/50 sm:self-end"
                  >
                    {urlCopied ? (
                      <>
                        <Check className="h-3.5 w-3.5" aria-hidden />
                        Скопировано
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                        Копировать
                      </>
                    )}
                  </button>
                </div>
                <code className="mt-3 block break-all rounded-lg bg-black/35 px-3 py-2.5 text-xs leading-relaxed text-emerald-100/95">
                  {obsUrl}
                </code>
              </div>
            ) : null}

            {error ? (
              <div className="flex gap-3 rounded-2xl border border-red-900/70 bg-red-950/35 p-4 text-sm text-red-100" role="alert">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden />
                <div>{error}</div>
              </div>
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-8">
            <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-5 shadow-sm ring-1 ring-white/[0.03] backdrop-blur-sm sm:p-6">
              <h2 className="text-sm font-semibold text-white">Предпросмотр табло</h2>
              <p className="mt-1 text-xs text-zinc-500">Зеркало того, что видит OBS.</p>
              <div className="mt-4 overflow-hidden rounded-xl ring-1 ring-zinc-800/80">
                <ObsScoreboardView state={preview} variant="preview" />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
