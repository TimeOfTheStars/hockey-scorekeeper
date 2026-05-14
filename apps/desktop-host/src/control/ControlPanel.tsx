import { invoke } from "@tauri-apps/api/core";
import { Eye, EyeOff, Minus, Pause, Play, Plus, RotateCcw, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState, type ChangeEvent, type FocusEvent } from "react";
import type { ServerField, ServerScoreboardRow } from "../../../../packages/shared/types/serverScoreboard";
import { ObsScoreboardView } from "../../../obs-overlay/src/obs-scoreboard/ObsScoreboardView";
import { useGatewayWs } from "./useGatewayWs";

type FieldId = "A" | "B";
type Team = "H" | "G";

function formatMmss(total: number): string {
  const safe = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function parseMmss(text: string): number | null {
  const trimmed = text.trim();
  const m = trimmed.match(/^(\d{1,3}):(\d{1,2})$/);
  if (m) {
    const min = Number(m[1]);
    const sec = Number(m[2]);
    if (sec < 60) return min * 60 + sec;
    return null;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function getField(source: ServerScoreboardRow | null, id: FieldId): ServerField {
  return source?.fields?.[id] ?? {};
}

function getTeamValues(field: ServerField, team: Team) {
  if (team === "H") {
    return {
      short: field.TeamH ?? "",
      full: field.TeamHFull ?? "",
      logo: field.LogoH ?? "",
      score: field.ScoreH ?? 0,
      shots: field.ShotsH ?? 0,
    };
  }
  return {
    short: field.TeamG ?? "",
    full: field.TeamGFull ?? "",
    logo: field.LogoG ?? "",
    score: field.ScoreG ?? 0,
    shots: field.ShotsG ?? 0,
  };
}

function firstPenalty(arr: string[] | undefined): string {
  if (!arr || arr.length === 0) return "";
  return arr[0] ?? "";
}

function readPenalty(source: ServerScoreboardRow | null, field: FieldId, team: Team): string {
  if (!source) return "";
  const numFields = source.num_fields ?? 1;
  if (numFields >= 2) {
    const arr = source.fields?.[field]?.Penalties?.[team];
    return firstPenalty(arr);
  }
  const v = team === "H" ? source.PenaltyH : source.PenaltyG;
  return v ?? "";
}

function useSyncedText(remote: string) {
  const [draft, setDraft] = useState(remote);
  useEffect(() => {
    setDraft(remote);
  }, [remote]);
  return [draft, setDraft] as const;
}

function NumberStepper({
  label,
  value,
  onSet,
  step = 1,
}: {
  label: string;
  value: number;
  onSet: (next: number) => void;
  step?: number;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-zinc-400">{label}</span>
      <div className="inline-flex items-stretch gap-1 rounded-xl border border-zinc-700/80 bg-zinc-950/60">
        <button
          type="button"
          className="px-3 py-2 text-zinc-300 hover:text-white"
          onClick={() => onSet(Math.max(0, value - step))}
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <span className="flex min-w-[3rem] items-center justify-center text-base font-semibold tabular-nums text-white">
          {value}
        </span>
        <button
          type="button"
          className="px-3 py-2 text-zinc-300 hover:text-white"
          onClick={() => onSet(value + step)}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onCommit,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onCommit: (next: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useSyncedText(value);
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-zinc-400">{label}</span>
      <input
        className="w-full rounded-lg border border-zinc-700/80 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-amber-600/60 focus:ring-2 focus:ring-amber-500/25"
        value={draft}
        placeholder={placeholder}
        onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
        onBlur={(e: FocusEvent<HTMLInputElement>) => {
          const next = e.target.value;
          if (next !== value) onCommit(next);
        }}
        spellCheck={false}
      />
    </label>
  );
}

function TeamCard({
  field,
  team,
  source,
}: {
  field: FieldId;
  team: Team;
  source: ServerScoreboardRow | null;
}) {
  const f = getField(source, field);
  const t = getTeamValues(f, team);
  const penalty = readPenalty(source, field, team);

  const commitName = (short: string, full: string) =>
    void invoke("set_team_name", { field, team, short, full });
  const commitLogo = (url: string) => void invoke("set_team_logo", { field, team, url });
  const setScore = (v: number) => void invoke("set_score", { field, team, value: v });
  const setShots = (v: number) => void invoke("set_shots", { field, team, value: v });
  const setPenalty = (v: string | null) => void invoke("set_penalty", { field, team, value: v });

  const [penaltyDraft, setPenaltyDraft] = useSyncedText(penalty);

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
          {team === "H" ? "Хозяева (H)" : "Гости (G)"}
        </h4>
        <span className="text-[10px] text-zinc-500">{t.short || "—"}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TextField label="Короткое" value={t.short} onCommit={(v) => commitName(v, t.full)} />
        <TextField label="Полное" value={t.full} onCommit={(v) => commitName(t.short, v)} />
      </div>

      <div className="mt-3">
        <TextField label="Логотип (URL или имя файла)" value={t.logo} onCommit={commitLogo} placeholder="team-a.png" />
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <NumberStepper label="Счёт" value={t.score} onSet={setScore} />
        <NumberStepper label="Броски" value={t.shots} onSet={setShots} />
      </div>

      <div className="mt-4">
        <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-zinc-400">Штраф</span>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-zinc-700/80 bg-zinc-950/80 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-amber-600/60 focus:ring-2 focus:ring-amber-500/25"
            value={penaltyDraft}
            placeholder="Напр.: №17 2:00 «удар»"
            onChange={(e) => setPenaltyDraft(e.target.value)}
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next !== penalty.trim()) {
                setPenalty(next === "" ? null : next);
              }
            }}
            spellCheck={false}
          />
          <button
            type="button"
            className="rounded-lg border border-zinc-700/80 bg-zinc-900/60 px-3 py-2 text-xs font-medium text-zinc-300 transition hover:bg-zinc-800"
            onClick={() => {
              setPenaltyDraft("");
              setPenalty(null);
            }}
          >
            Снять
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldSection({ field, source }: { field: FieldId; source: ServerScoreboardRow | null }) {
  return (
    <div className="grid grid-cols-1 gap-4">
      <TeamCard field={field} team="H" source={source} />
      <TeamCard field={field} team="G" source={source} />
    </div>
  );
}

function TournamentSection({ source }: { source: ServerScoreboardRow | null }) {
  const title = source?.TournamentTitle ?? "";
  const logo = source?.logoLeagues ?? "";
  const visible = source?.visible ?? true;

  const commit = (nextTitle: string, nextLogo: string) =>
    void invoke("set_tournament", { title: nextTitle, leagueLogo: nextLogo });
  const toggleVisible = () => void invoke("set_visible", { value: !visible });

  return (
    <section className="rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-white">Турнир</h3>
      <div className="mt-4 space-y-3">
        <TextField label="Название турнира" value={title} onCommit={(v) => commit(v, logo)} />
        <TextField label="Логотип лиги (URL)" value={logo} onCommit={(v) => commit(title, v)} />
        <button
          type="button"
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition ${
            visible
              ? "border-emerald-700/60 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-900/40"
              : "border-zinc-700/60 bg-zinc-900/50 text-zinc-300 hover:bg-zinc-800/60"
          }`}
          onClick={toggleVisible}
        >
          {visible ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />}
          {visible ? "Видимо" : "Скрыто"}
        </button>
      </div>
    </section>
  );
}

function PeriodSection({ source }: { source: ServerScoreboardRow | null }) {
  const period = source?.Period ?? 1;
  const label = source?.Period_label ?? "";
  const setPeriod = (v: number, l: string) => void invoke("set_period", { value: v, label: l });
  return (
    <section className="rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-white">Период</h3>
      <div className="mt-4 flex flex-wrap items-end gap-4">
        <NumberStepper label="Номер" value={period} onSet={(v) => setPeriod(Math.max(1, v), label)} />
        <TextField className="flex-1 min-w-[10rem]" label="Подпись" value={label} onCommit={(v) => setPeriod(period, v)} />
      </div>
    </section>
  );
}

function TimerSection({ source }: { source: ServerScoreboardRow | null }) {
  const timer = source?.Timer ?? 0;
  const def = source?.timer_default ?? 1200;
  const running = source?.timer_running ?? false;

  const setTimer = (s: number) => void invoke("set_timer", { seconds: Math.max(0, s) });
  const setDefault = (s: number) => void invoke("set_timer_default", { seconds: Math.max(0, s) });
  const toggle = () => void invoke("set_timer_running", { value: !running });
  const reset = () => void invoke("reset_timer");

  const [defaultDraft, setDefaultDraft] = useSyncedText(formatMmss(def));

  return (
    <section className="rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-white">Таймер</h3>

      <div className="mt-3 flex items-baseline gap-3">
        <div className="text-5xl font-black tabular-nums tracking-tight text-white">{formatMmss(timer)}</div>
        <div className={`text-xs font-medium ${running ? "text-emerald-400" : "text-zinc-500"}`}>
          {running ? "идёт" : "пауза"}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
            running
              ? "bg-zinc-800/80 text-zinc-100 hover:bg-zinc-700/80"
              : "bg-emerald-600 text-emerald-50 hover:bg-emerald-500"
          }`}
          onClick={toggle}
        >
          {running ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
          {running ? "Пауза" : "Старт"}
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/80 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800/80"
          onClick={reset}
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          Сброс
        </button>
        {[-10, -5, +5, +10].map((d) => (
          <button
            key={d}
            type="button"
            className="rounded-lg border border-zinc-700/80 bg-zinc-900/60 px-3 py-2 text-sm tabular-nums text-zinc-200 hover:bg-zinc-800/80"
            onClick={() => setTimer(timer + d)}
          >
            {d > 0 ? `+${d}с` : `${d}с`}
          </button>
        ))}
      </div>

      <label className="mt-4 block max-w-[12rem]">
        <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-zinc-400">
          Длина периода (MM:SS)
        </span>
        <input
          className="w-full rounded-lg border border-zinc-700/80 bg-zinc-950/80 px-3 py-2 text-sm tabular-nums text-zinc-100 outline-none focus:border-amber-600/60 focus:ring-2 focus:ring-amber-500/25"
          value={defaultDraft}
          onChange={(e) => setDefaultDraft(e.target.value)}
          onBlur={(e) => {
            const parsed = parseMmss(e.target.value);
            if (parsed !== null && parsed !== def) {
              setDefault(parsed);
            } else {
              setDefaultDraft(formatMmss(def));
            }
          }}
          spellCheck={false}
        />
      </label>
    </section>
  );
}

export function ControlPanel() {
  const { state, source, connected } = useGatewayWs();
  const numFields = source?.num_fields ?? 1;
  const [activeField, setActiveField] = useState<FieldId>("A");

  useEffect(() => {
    if (numFields < 2 && activeField === "B") {
      setActiveField("A");
    }
  }, [numFields, activeField]);

  const setNumFields = (n: 1 | 2) => void invoke("set_num_fields", { value: n });

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 text-zinc-100">
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-white">Панель управления табло</h1>
            <p className="text-xs text-zinc-500">Все изменения уходят в OBS сразу через WS.</p>
          </div>
          <div
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${
              connected
                ? "bg-emerald-950/60 text-emerald-200 ring-emerald-700/50"
                : "bg-zinc-900 text-zinc-400 ring-zinc-700"
            }`}
          >
            {connected ? <Wifi className="h-3 w-3" aria-hidden /> : <WifiOff className="h-3 w-3" aria-hidden />}
            {connected ? "online" : "offline"}
          </div>
        </header>

        <div className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/40">
          <ObsScoreboardView state={state} variant="preview" />
        </div>

        <TournamentSection source={source} />

        <section className="rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-white">Поля</h3>
            <div className="inline-flex rounded-lg border border-zinc-700/80 bg-zinc-950/60 p-1">
              {([1, 2] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    numFields === n ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                  onClick={() => setNumFields(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {numFields >= 2 ? (
            <div className="mt-3 inline-flex rounded-lg border border-zinc-700/80 bg-zinc-950/60 p-1">
              {(["A", "B"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    activeField === f ? "bg-amber-600 text-amber-950" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                  onClick={() => setActiveField(f)}
                >
                  Поле {f}
                </button>
              ))}
            </div>
          ) : null}

          <div className="mt-4">
            <FieldSection field={activeField} source={source} />
          </div>
        </section>

        <PeriodSection source={source} />
        <TimerSection source={source} />
      </div>
    </div>
  );
}
