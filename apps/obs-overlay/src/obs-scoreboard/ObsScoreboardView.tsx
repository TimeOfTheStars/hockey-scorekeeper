import type { GameState } from "../../../../packages/shared/types/gameState";

/** Палитра как на референсе (broadcast scorebug). */
const C = {
  lightGray: "#D1D1D1",
  mediumGray: "#707070",
  dark: "#1A1A1A",
  red: "#E11B22",
  white: "#FFFFFF",
  black: "#000000",
  line: "#0D0D0D",
} as const;

const GRID_COLS = "minmax(7rem, 9.5rem) 4.75rem 6.5rem";
const ROW_H = "3.25rem";

function periodLabel(period: number): string {
  if (period === 1) return "1ST";
  if (period === 2) return "2ND";
  if (period === 3) return "3RD";
  return `${period}TH`;
}

function logoUrl(fileName: string) {
  const base = import.meta.env.VITE_BASE_LOGO_URL as string | undefined;
  if (!base || base.trim() === "") {
    return `/logos/${fileName}`;
  }
  return `${base}/logos/${fileName}`;
}

function resolveLogoSrc(ref: string): string {
  const t = ref.trim();
  if (/^https?:\/\//i.test(t)) {
    return t;
  }
  return logoUrl(t);
}

function isPenaltyEmpty(s: string): boolean {
  const t = s.trim();
  return t === "" || t.toLowerCase() === "none";
}

function bottomTickerText(state: GameState): string {
  if (state.PowerPlayActive) {
    return "";
  }
  if (!isPenaltyEmpty(state.penalty_a)) {
    return state.penalty_a;
  }
  if (!isPenaltyEmpty(state.penalty_b)) {
    return state.penalty_b;
  }
  return "";
}

type Variant = "full" | "preview";

export function ObsScoreboardView({ state, variant = "full" }: { state: GameState; variant?: Variant }) {
  if (!state.Visible) {
    const emptyClass =
      variant === "preview"
        ? "flex h-full min-h-[120px] w-full items-center justify-center bg-zinc-900/50 text-sm text-zinc-500"
        : "h-screen w-screen bg-transparent";
    return <div className={emptyClass}>Скрыто (Visible: off)</div>;
  }

  const tickerText = bottomTickerText(state);
  const ppLabel = state.PowerPlayActive ? `PP ${state.PowerPlayTimer}` : "";

  const scorebug = (
    <section
      className="inline-block overflow-hidden rounded-none border-2 border-black shadow-none"
      style={{ fontFamily: '"Roboto Condensed", "Arial Narrow", Impact, system-ui, sans-serif' }}
    >
      <div
        className="grid"
        style={{
          gridTemplateColumns: GRID_COLS,
          gridTemplateRows: `${ROW_H} ${ROW_H}`,
        }}
      >
        {/* ——— Ряд A: команда ——— */}
        <div
          className="flex min-h-[3.25rem] items-stretch border-b"
          style={{ backgroundColor: C.lightGray, borderColor: C.line, gridColumn: 1, gridRow: 1 }}
        >
          <div className="w-1 shrink-0 self-stretch" style={{ backgroundColor: C.red }} aria-hidden />
          <div className="flex min-w-0 flex-1 items-center px-2">
            {state.logo_a.trim() ? (
              <img
                src={resolveLogoSrc(state.logo_a.trim())}
                alt=""
                className="mr-2 h-7 w-7 shrink-0 object-contain"
              />
            ) : null}
            <span
              className="truncate text-xl font-bold uppercase leading-none tracking-tight"
              style={{ color: C.black }}
            >
              {state.TeamA}
            </span>
          </div>
        </div>

        {/* Счёт A */}
        <div
          className="flex items-center justify-center border-b border-l"
          style={{ backgroundColor: C.dark, borderColor: C.line, gridColumn: 2, gridRow: 1 }}
        >
          <span className="text-[2.75rem] font-black leading-none tabular-nums" style={{ color: C.white }}>
            {state.ScoreA}
          </span>
        </div>

        {/* PP */}
        <div
          className="flex items-center justify-center border-b border-l px-1"
          style={{
            backgroundColor: state.PowerPlayActive ? C.red : C.dark,
            borderColor: C.line,
            color: C.white,
            gridColumn: 3,
            gridRow: 1,
          }}
        >
          {ppLabel ? (
            <span className="text-center text-base font-black uppercase leading-tight tracking-wide">{ppLabel}</span>
          ) : null}
        </div>

        {/* ——— Ряд B: команда ——— */}
        <div
          className="flex min-h-[3.25rem] items-stretch"
          style={{ backgroundColor: C.lightGray, gridColumn: 1, gridRow: 2 }}
        >
          <div className="flex w-1 shrink-0 self-stretch overflow-hidden" aria-hidden>
            <div className="h-full w-1/2 shrink-0" style={{ backgroundColor: C.white }} />
            <div className="h-full w-1/2 shrink-0" style={{ backgroundColor: C.mediumGray }} />
          </div>
          <div className="flex min-w-0 flex-1 items-center px-2">
            {state.logo_b.trim() ? (
              <img
                src={resolveLogoSrc(state.logo_b.trim())}
                alt=""
                className="mr-2 h-7 w-7 shrink-0 object-contain"
              />
            ) : null}
            <span
              className="truncate text-xl font-bold uppercase leading-none tracking-tight"
              style={{ color: C.black }}
            >
              {state.TeamB}
            </span>
          </div>
        </div>

        <div
          className="flex items-center justify-center border-l"
          style={{ backgroundColor: C.dark, borderColor: C.line, gridColumn: 2, gridRow: 2 }}
        >
          <span className="text-[2.75rem] font-black leading-none tabular-nums" style={{ color: C.white }}>
            {state.ScoreB}
          </span>
        </div>

        <div style={{ backgroundColor: C.dark, gridColumn: 3, gridRow: 2 }} aria-hidden />
      </div>

      {/* Низ: часы (ширина команд) | период (счёт + PP) */}
      <div
        className="grid border-t-2"
        style={{
          gridTemplateColumns: GRID_COLS,
          gridTemplateRows: ROW_H,
          borderColor: C.line,
        }}
      >
        <div
          className="col-span-1 flex items-center justify-center border-r"
          style={{ backgroundColor: C.dark, borderColor: C.line }}
        >
          <span className="text-[2.25rem] font-black tabular-nums tracking-tight" style={{ color: C.white }}>
            {state.Timer}
          </span>
        </div>
        <div
          className="col-span-2 flex items-center justify-center"
          style={{ backgroundColor: C.mediumGray }}
        >
          <span className="text-2xl font-black tracking-wide" style={{ color: C.white }}>
            {periodLabel(state.Period)}
          </span>
        </div>
      </div>

      {tickerText ? (
        <div
          className="flex min-h-10 items-center justify-center border-t-2 px-3 py-1 text-center text-sm font-bold uppercase leading-tight"
          style={{ backgroundColor: C.red, borderColor: C.line, color: C.white }}
        >
          {tickerText}
        </div>
      ) : null}
    </section>
  );

  if (variant === "preview") {
    return (
      <div className="relative flex h-[200px] w-full items-center justify-center overflow-hidden rounded border border-zinc-800 bg-zinc-950">
        <div className="pointer-events-none origin-center scale-[0.72]">{scorebug}</div>
      </div>
    );
  }

  return (
    <main className="flex min-h-screen w-screen items-start justify-start bg-transparent p-4">{scorebug}</main>
  );
}
