import { Server, SlidersHorizontal } from "lucide-react";

export function ModeSelect({ onPick }: { onPick: (mode: "server" | "local") => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 text-zinc-100">
      <div className="mx-auto flex max-w-3xl flex-col items-stretch px-4 py-12 sm:px-6 lg:px-8">
        <header className="space-y-2 pb-10 text-center">
          <div className="inline-flex items-center justify-center gap-2 text-zinc-500">
            <Server className="h-4 w-4 shrink-0" aria-hidden />
            <span className="text-xs font-medium uppercase tracking-wider">Локальный шлюз для OBS</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Откуда берём статистику?</h1>
          <p className="mx-auto max-w-lg text-sm text-zinc-500">
            Выберите источник данных табло. Можно вернуться к выбору позже.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onPick("server")}
            className="group flex flex-col items-start gap-3 rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-6 text-left shadow-sm ring-1 ring-white/[0.03] transition hover:border-sky-700/60 hover:bg-zinc-900/70"
          >
            <Server className="h-7 w-7 text-sky-400 transition group-hover:scale-110" aria-hidden />
            <div className="text-lg font-semibold text-white">С сервера</div>
            <p className="text-sm text-zinc-400">
              Опрашиваем внешний JSON API и транслируем состояние в OBS — как было всё это время.
            </p>
            <span className="mt-auto text-xs uppercase tracking-wider text-sky-400/80">
              URL → Проверить → Запустить
            </span>
          </button>

          <button
            type="button"
            onClick={() => onPick("local")}
            className="group flex flex-col items-start gap-3 rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-6 text-left shadow-sm ring-1 ring-white/[0.03] transition hover:border-amber-700/60 hover:bg-zinc-900/70"
          >
            <SlidersHorizontal className="h-7 w-7 text-amber-400 transition group-hover:scale-110" aria-hidden />
            <div className="text-lg font-semibold text-white">Локально</div>
            <p className="text-sm text-zinc-400">
              Ведём табло вручную из встроенной панели управления — счёт, период, таймер, штрафы.
            </p>
            <span className="mt-auto text-xs uppercase tracking-wider text-amber-400/80">
              Поля → Запустить → Панель
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
