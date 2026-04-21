import { invoke } from "@tauri-apps/api/core";
import {
  AlertCircle,
  Check,
  Copy,
  Loader2,
  MonitorPlay,
  Radio,
  Server,
  Square,
  TestTube2,
} from "lucide-react";
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

  const statusStyle = useMemo(() => {
    if (validateState === "idle") return "bg-zinc-800/80 text-zinc-300 ring-zinc-700/60";
    if (validateState === "validating") return "bg-sky-950/80 text-sky-200 ring-sky-600/50";
    if (validateState === "ready") return "bg-emerald-950/80 text-emerald-200 ring-emerald-600/40";
    return "bg-red-950/80 text-red-200 ring-red-700/50";
  }, [validateState]);

  const [urlCopied, setUrlCopied] = useState(false);
  const [clipboardHint, setClipboardHint] = useState<string | null>(null);

  const copyObsUrl = async () => {
    if (!obsUrl) return;
    setClipboardHint(null);
    try {
      await navigator.clipboard.writeText(obsUrl);
      setUrlCopied(true);
      window.setTimeout(() => setUrlCopied(false), 2000);
    } catch {
      setClipboardHint("Не удалось скопировать — выделите ссылку вручную.");
      window.setTimeout(() => setClipboardHint(null), 4000);
    }
  };

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
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 text-zinc-100">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-zinc-800/80 pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-zinc-500">
              <Server className="h-4 w-4 shrink-0" aria-hidden />
              <span className="text-xs font-medium uppercase tracking-wider">Локальный шлюз для OBS</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Hockey Scoreboard Host</h1>
            <p className="max-w-xl text-sm text-zinc-500">API → проверка → сервер → ссылка в OBS.</p>
          </div>
          <div
            className={`inline-flex items-center gap-2 self-start rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset sm:self-start ${statusStyle}`}
            role="status"
            aria-live="polite"
          >
            {validateState === "validating" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : validateState === "ready" ? (
              <Check className="h-3.5 w-3.5" aria-hidden />
            ) : validateState === "error" ? (
              <AlertCircle className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Radio className="h-3.5 w-3.5 opacity-70" aria-hidden />
            )}
            {statusLabel}
          </div>
        </header>

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] lg:items-start">
          <div className="space-y-6">
            <section className="rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-5 shadow-sm ring-1 ring-white/[0.03] backdrop-blur-sm sm:p-6">
              <h2 className="text-sm font-semibold text-white">Источник и порт</h2>
              <p className="mt-1 text-xs text-zinc-500">Внешний JSON и локальный порт шлюза.</p>

              <div className="mt-5 space-y-5">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-zinc-400">URL внешнего API</span>
                  <input
                    className="w-full rounded-xl border border-zinc-700/80 bg-zinc-950/80 px-3.5 py-2.5 text-sm text-zinc-100 shadow-inner outline-none transition placeholder:text-zinc-600 focus:border-sky-600/60 focus:ring-2 focus:ring-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    disabled={serverRunning}
                    placeholder="https://…"
                    spellCheck={false}
                  />
                </label>

                <div>
                  <span className="mb-2 block text-xs font-medium text-zinc-400">Поле льда</span>
                  <div
                    className="inline-flex rounded-xl border border-zinc-700/80 bg-zinc-950/60 p-1"
                    role="group"
                    aria-label="Выбор поля льда"
                  >
                    <button
                      type="button"
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                        iceField === "A"
                          ? "bg-zinc-700 text-white shadow-sm"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                      onClick={() => void onIceFieldChange("A")}
                    >
                      Поле A
                      <span className="mt-0.5 block text-[10px] font-normal uppercase tracking-wide text-zinc-500">
                        HA / GA
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                        iceField === "B"
                          ? "bg-zinc-700 text-white shadow-sm"
                          : "text-zinc-400 hover:text-zinc-200"
                      }`}
                      onClick={() => void onIceFieldChange("B")}
                    >
                      Поле B
                      <span className="mt-0.5 block text-[10px] font-normal uppercase tracking-wide text-zinc-500">
                        HB / GB
                      </span>
                    </button>
                  </div>
                </div>

                <label className="block max-w-[12rem]">
                  <span className="mb-1.5 block text-xs font-medium text-zinc-400">Порт gateway</span>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-zinc-700/80 bg-zinc-950/80 px-3.5 py-2.5 text-sm tabular-nums outline-none transition focus:border-sky-600/60 focus:ring-2 focus:ring-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                    value={localPort}
                    min={1024}
                    max={65535}
                    onChange={(e) => setLocalPort(Number(e.target.value) || DEFAULT_GATEWAY_PORT)}
                    disabled={serverRunning}
                  />
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-5 shadow-sm ring-1 ring-white/[0.03] backdrop-blur-sm sm:p-6">
              <h2 className="text-sm font-semibold text-white">Действия</h2>
              <p className="mt-1 text-xs text-zinc-500">Проверка → запуск (или «Тест») → OBS.</p>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-600/80 bg-zinc-800/80 px-4 py-2.5 text-sm font-medium text-zinc-100 transition hover:bg-zinc-700/90 disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() => void onValidate()}
                  disabled={validateState === "validating" || serverRunning}
                >
                  {validateState === "validating" ? (
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                  ) : null}
                  Проверить данные
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-900/30 transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() => void onStartServer()}
                  disabled={validateState !== "ready" || serverRunning}
                >
                  <MonitorPlay className="h-4 w-4 shrink-0" aria-hidden />
                  Запуск сервера
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600/90 px-4 py-2.5 text-sm font-medium text-amber-950 transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() => void onTestServer()}
                  disabled={serverRunning}
                  title={`Поднять gateway на порту ${DEFAULT_GATEWAY_PORT} без опроса API`}
                >
                  <TestTube2 className="h-4 w-4 shrink-0" aria-hidden />
                  Тест
                </button>
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-600 bg-transparent px-4 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-800/50 disabled:cursor-not-allowed disabled:opacity-45"
                  onClick={() => void onStopServer()}
                  disabled={!serverRunning}
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
                {clipboardHint ? (
                  <p className="mt-2 text-xs text-amber-200/90">{clipboardHint}</p>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <div
                className="flex gap-3 rounded-2xl border border-red-900/70 bg-red-950/35 p-4 text-sm text-red-100"
                role="alert"
              >
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden />
                <div>{error}</div>
              </div>
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-8">
            <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-5 shadow-sm ring-1 ring-white/[0.03] backdrop-blur-sm sm:p-6">
              <h2 className="text-sm font-semibold text-white">Предпросмотр табло</h2>
              <p className="mt-1 text-xs text-zinc-500">Как оверлей при текущих данных.</p>
              <div className="mt-4 overflow-hidden rounded-xl ring-1 ring-zinc-800/80">
                <ObsScoreboardView state={preview} variant="preview" />
              </div>
            </div>
          </aside>

          <details className="group rounded-xl border border-zinc-800/80 bg-zinc-900/30 text-zinc-400 open:bg-zinc-900/50 lg:col-span-2">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-zinc-300 marker:text-zinc-500">
              Справка по элементам интерфейса
            </summary>
            <div className="space-y-4 border-t border-zinc-800/80 px-4 pb-4 pt-3 text-xs leading-relaxed">
              <div>
                <h3 className="font-semibold text-zinc-300">Статус справа в шапке</h3>
                <p className="mt-1 text-zinc-500">
                  Показывает этап последней операции с API: ещё не проверяли, идёт запрос, ответ разобран и можно
                  запускать сервер, либо ошибка (подробности — в красном блоке).
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-zinc-300">URL внешнего API</h3>
                <p className="mt-1 text-zinc-500">
                  Полный HTTP-адрес JSON состояния матча (формат — в документации репозитория). Запрос выполняется из
                  приложения, CORS не мешает. Поле блокируется, пока запущен gateway.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-zinc-300">Поле льда</h3>
                <p className="mt-1 text-zinc-500">
                  Какую пару команд из ответа подставить в табло: корт A (HA/GA) или B (HB/GB). При уже запущенном
                  сервере переключение сразу уходит в шлюз и обновляет картинку в OBS.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-zinc-300">Порт gateway</h3>
                <p className="mt-1 text-zinc-500">
                  Порт на <code className="rounded bg-zinc-800 px-1 py-px text-zinc-300">127.0.0.1</code>, где слушает
                  шлюз; тот же номер будет в URL для OBS. Должен быть свободен. Менять можно только до запуска сервера.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-zinc-300">Проверить данные</h3>
                <p className="mt-1 text-zinc-500">
                  Загружает ответ по URL, проверяет код HTTP и парсит JSON в модель табло. При успехе обновляется
                  предпросмотр и включается «Запуск сервера». Недоступно, пока gateway уже работает.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-zinc-300">Запуск сервера</h3>
                <p className="mt-1 text-zinc-500">
                  Поднимает локальный gateway: оверлей, <code className="rounded bg-zinc-800 px-1 py-px text-zinc-300">GET /api/state</code>, WebSocket и фоновый опрос вашего API. Нужны успешная проверка и свободный порт.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-zinc-300">Тест</h3>
                <p className="mt-1 text-zinc-500">
                  Тот же gateway без внешнего API: стартовое состояние табло, порт фиксирован —{" "}
                  <code className="rounded bg-zinc-800 px-1 py-px text-zinc-300">{DEFAULT_GATEWAY_PORT}</code>. Удобно
                  проверить OBS и канал обновлений. Статус проверки API сбрасывается.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-zinc-300">Остановить</h3>
                <p className="mt-1 text-zinc-500">
                  Останавливает шлюз и освобождает порт. После остановки можно сменить URL или порт и снова нажать
                  «Проверить данные».
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-zinc-300">Ссылка для OBS и «Копировать»</h3>
                <p className="mt-1 text-zinc-500">
                  Вставьте URL в источник «Браузер» на той же машине, где запущено приложение. «Копировать» кладёт адрес
                  в буфер; при сбое выделите строку вручную. Если картинка в OBS не обновляется, попробуйте пересоздать
                  источник или обновить URL.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-zinc-300">Предпросмотр табло</h3>
                <p className="mt-1 text-zinc-500">
                  Тот же виджет, что в оверлее, в уменьшенном виде. Обновляется после проверки API, при смене поля льда
                  (если JSON уже есть) или в режиме «Тест». На работу gateway не влияет.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-zinc-300">Красный блок ошибки</h3>
                <p className="mt-1 text-zinc-500">
                  Сообщение сети, HTTP, парсинга или команды Tauri. Исправьте настройки и повторите действие.
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-zinc-300">Сборка оверлея для разработки</h3>
                <p className="mt-1 text-zinc-500">
                  Перед упаковкой Tauri обычно нужен свежий фронт оверлея: из корня монорепозитория —{" "}
                  <code className="rounded bg-zinc-800 px-1 py-px text-zinc-300">npm run build:overlay</code> (в скриптах
                  проекта это уже может вызываться автоматически).
                </p>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
