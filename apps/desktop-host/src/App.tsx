import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import type { GameState } from "../../../packages/shared/types/gameState";
import { defaultGameState } from "../../../packages/shared/types/gameState";
import { ObsScoreboardView } from "../../obs-overlay/src/obs-scoreboard/ObsScoreboardView";
import { parseExternalStatePayload, type IceFieldId } from "./shared/parseExternalState";

type ValidateState = "idle" | "validating" | "ready" | "error";

/** Порт и URL по умолчанию для режима «Тест» (без внешнего API). */
const DEFAULT_GATEWAY_PORT = 8787;

export default function App() {
  const [apiUrl, setApiUrl] = useState<string>("http://10.7.16.210:8080/api/vmix");
  const [localPort, setLocalPort] = useState<number>(DEFAULT_GATEWAY_PORT);
  const [validateState, setValidateState] = useState<ValidateState>("idle");
  const [error, setError] = useState<string>("");
  const [preview, setPreview] = useState<GameState>(defaultGameState);
  const [obsUrl, setObsUrl] = useState<string | null>(null);
  const [serverRunning, setServerRunning] = useState(false);
  const [iceField, setIceField] = useState<IceFieldId>("A");
  const [lastValidatedJson, setLastValidatedJson] = useState<unknown>(null);

  useEffect(() => {
    if (lastValidatedJson == null) {
      return;
    }
    const parsed = parseExternalStatePayload(lastValidatedJson, iceField);
    if (parsed) {
      setPreview(parsed);
    }
  }, [iceField, lastValidatedJson]);

  const statusLabel = useMemo(() => {
    if (validateState === "idle") return "Ожидание";
    if (validateState === "validating") return "Проверяем...";
    if (validateState === "ready") return "Данные найдены";
    return "Ошибка";
  }, [validateState]);

  const onValidate = async () => {
    const url = apiUrl.trim();
    if (!url) {
      setError("Укажите URL внешнего API.");
      setValidateState("error");
      return;
    }

    setValidateState("validating");
    setError("");

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json = (await response.json()) as unknown;
      const parsed = parseExternalStatePayload(json, iceField);
      if (!parsed) {
        throw new Error("Не удалось распарсить GameState из ответа.");
      }

      setLastValidatedJson(json);
      setPreview(parsed);
      setValidateState("ready");
    } catch (e) {
      setLastValidatedJson(null);
      setValidateState("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onStartServer = async () => {
    if (validateState !== "ready" || serverRunning) {
      return;
    }
    setError("");
    try {
      const url = await invoke<string>("start_score_gateway", {
        apiUrl: apiUrl.trim(),
        port: localPort,
        testMode: false,
        iceField,
      });
      setObsUrl(url);
      setServerRunning(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onTestServer = async () => {
    if (serverRunning) {
      return;
    }
    setError("");
    try {
      const url = await invoke<string>("start_score_gateway", {
        apiUrl: "",
        port: DEFAULT_GATEWAY_PORT,
        testMode: true,
        iceField: "A",
      });
      setLocalPort(DEFAULT_GATEWAY_PORT);
      setObsUrl(url);
      setServerRunning(true);
      setPreview(defaultGameState);
      setLastValidatedJson(null);
      setValidateState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onIceFieldChange = async (next: IceFieldId) => {
    setIceField(next);
    if (!serverRunning) {
      return;
    }
    setError("");
    try {
      await invoke("set_scoreboard_field", { field: next });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onStopServer = async () => {
    setError("");
    try {
      await invoke("stop_score_gateway");
      setObsUrl(null);
      setServerRunning(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 p-5 text-zinc-100">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Hockey Scoreboard Host</h1>
          <span className="rounded bg-zinc-800 px-2 py-1 text-xs">{statusLabel}</span>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-sm text-zinc-300">
              <span className="mb-1 block">URL внешнего API (например vmix)</span>
              <input
                className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                disabled={serverRunning}
              />
            </label>

            <div className="block text-sm text-zinc-300">
              <span className="mb-2 block">Поле льда (какую пару команд показать)</span>
              <div className="flex flex-wrap gap-4">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="iceField"
                    checked={iceField === "A"}
                    onChange={() => void onIceFieldChange("A")}
                  />
                  <span>Поле A (HA / GA)</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="iceField"
                    checked={iceField === "B"}
                    onChange={() => void onIceFieldChange("B")}
                  />
                  <span>Поле B (HB / GB)</span>
                </label>
              </div>
            </div>

            <label className="block text-sm text-zinc-300">
              <span className="mb-1 block">Локальный порт для OBS (gateway)</span>
              <input
                type="number"
                className="w-full rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-700"
                value={localPort}
                min={1024}
                max={65535}
                onChange={(e) => setLocalPort(Number(e.target.value) || DEFAULT_GATEWAY_PORT)}
                disabled={serverRunning}
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50"
                onClick={() => void onValidate()}
                disabled={validateState === "validating" || serverRunning}
              >
                Проверить данные
              </button>
              <button
                type="button"
                className="rounded bg-blue-700 px-3 py-2 text-sm hover:bg-blue-600 disabled:opacity-50"
                onClick={() => void onStartServer()}
                disabled={validateState !== "ready" || serverRunning}
              >
                Запуск сервера
              </button>
              <button
                type="button"
                className="rounded bg-amber-800 px-3 py-2 text-sm hover:bg-amber-700 disabled:opacity-50"
                onClick={() => void onTestServer()}
                disabled={serverRunning}
                title={`Поднять gateway на порту ${DEFAULT_GATEWAY_PORT} без опроса API (стартовое состояние табло)`}
              >
                Тест
              </button>
              <button
                type="button"
                className="rounded border border-zinc-600 px-3 py-2 text-sm hover:bg-zinc-800 disabled:opacity-50"
                onClick={() => void onStopServer()}
                disabled={!serverRunning}
              >
                Остановить
              </button>
            </div>

            {obsUrl ? (
              <div className="rounded border border-emerald-900 bg-emerald-950/30 p-3 text-sm text-emerald-100">
                <div className="font-semibold">OBS Browser Source</div>
                <code className="mt-1 block break-all text-emerald-200">{obsUrl}</code>
              </div>
            ) : null}

            {error ? (
              <div className="rounded border border-red-900 bg-red-950/30 p-3 text-sm text-red-200">{error}</div>
            ) : null}

            <p className="text-xs text-zinc-400">
              <strong className="font-medium text-zinc-300">Тест</strong> — тот же локальный сервер и ссылка для OBS,
              без внешнего API: в табло остаётся стартовое состояние, удобно проверить раздачу оверлея и WebSocket.
              Порт <code className="text-zinc-300">{DEFAULT_GATEWAY_PORT}</code>. Проверка данных и polling идут из
              нативного приложения (без CORS). Оверлей:{" "}
              <code className="text-zinc-300">npm run build:overlay</code> (Tauri в beforeDev).
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-lg font-semibold">Предпросмотр</div>
            <ObsScoreboardView state={preview} variant="preview" />
          </div>
        </div>
      </div>
    </div>
  );
}
