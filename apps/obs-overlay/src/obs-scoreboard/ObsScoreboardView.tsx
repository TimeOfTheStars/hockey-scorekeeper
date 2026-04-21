import type { CSSProperties, ReactNode } from "react";
import type { GameState } from "../../../../packages/shared/types/gameState";

/** Палитра по референсу: верхняя полоса — градиент слева направо, низ — сплошной синий. */
const C = {
  blueBand1: "#4a70b5",
  blueBand2: "#a8b8d0",
  blueBandBottom: "#2b4a9a",
  /** Акцент и рамки (вместо бывшего красного). */
  accent: "#4a70b5",
  dark: "#1a2f55",
  darkScoreB: "#152542",
  logoBg: "#3d4d68",
  white: "#FFFFFF",
  black: "#0A0A0A",
} as const;

const SKEW_DEG = 14;
const OUTLINE: CSSProperties = {
  WebkitTextStroke: `1.5px ${C.black}`,
  paintOrder: "stroke fill",
};

function periodLabelRu(period: number): { num: string; rest: string } {
  if (period <= 0) return { num: "—", rest: "ПЕР" };
  return { num: String(period), rest: "ПЕР" };
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

/** Внешняя ячейка со skew; фиксированная высота строки, рамки/padding не увеличивают блок (box-border). */
function SkewPanel({
  children,
  className,
  style,
  innerClassName,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  innerClassName?: string;
}) {
  return (
    <div
      className={`box-border flex h-[52px] min-h-[52px] max-h-[52px] overflow-hidden ${className ?? ""}`}
      style={{
        transform: `skewX(-${SKEW_DEG}deg)`,
        transformOrigin: "50% 50%",
        ...style,
      }}
    >
      <div
        className={innerClassName}
        style={{
          transform: `skewX(${SKEW_DEG}deg)`,
          height: "100%",
          minHeight: 0,
          width: "100%",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function ObsScoreboardView({ state, variant = "full" }: { state: GameState; variant?: Variant }) {
  if (!state.Visible) {
    const emptyClass =
      variant === "preview"
        ? "flex h-full min-h-[120px] w-full items-center justify-center bg-zinc-900/50 text-sm text-zinc-500"
        : "h-screen w-screen bg-transparent";
    return <div className={emptyClass}>Скрыто (Visible: off)</div>;
  }

  const tickerText = bottomTickerText(state);
  const period = periodLabelRu(state.Period);
  const tournamentTitle = state.TournamentTitle.trim();
  const tournamentLogo = state.BrandingImage.trim();
  const showTournamentBar = tournamentTitle.length > 0 || tournamentLogo.length > 0;
  const font: CSSProperties = {
    fontFamily: '"Montserrat", "Arial Narrow", "Roboto Condensed", system-ui, sans-serif',
  };

  const scorebug = (
    <section
      className="block w-full min-w-0 max-w-none"
      style={{
        ...font,
        filter: "drop-shadow(3px 5px 10px rgba(0,0,0,0.55))",
      }}
    >
      <div className="flex w-full min-w-0 max-w-none flex-col gap-1">
        {showTournamentBar ? (
          <div
            className={`flex min-h-[2.5rem] w-full items-center gap-2 border-2 border-solid border-black px-2 py-1.5 ${tournamentTitle ? "" : "justify-center"}`}
            style={{
              backgroundImage: `linear-gradient(to right, ${C.blueBand1}, ${C.blueBand2})`,
            }}
          >
            {tournamentLogo ? (
              <img
                src={resolveLogoSrc(tournamentLogo)}
                alt=""
                className="h-7 w-auto max-w-[120px] shrink-0 object-contain"
              />
            ) : null}
            {tournamentTitle ? (
              <span
                className={`min-w-0 truncate text-xs font-black uppercase leading-tight tracking-wide sm:text-sm ${tournamentLogo ? "flex-1 text-left" : "w-full text-center"}`}
                style={{ color: C.white, ...OUTLINE }}
              >
                {tournamentTitle}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Верхняя команда */}
        <div className="flex min-w-0 items-center">
          <SkewPanel
            className="z-10 -mr-1.5 w-[4.25rem] shrink-0 border-solid border-l-[4px] border-t-[4px] px-0.5"
            style={{ backgroundColor: C.logoBg, borderLeftColor: C.accent, borderTopColor: C.accent }}
            innerClassName="flex items-center justify-center"
          >
            {state.logo_a.trim() ? (
              <img
                src={resolveLogoSrc(state.logo_a.trim())}
                alt=""
                className="h-10 w-10 max-h-[2.75rem] max-w-[2.75rem] object-contain"
              />
            ) : (
              <span className="text-xs font-black uppercase text-white/50">A</span>
            )}
          </SkewPanel>

          <SkewPanel
            className="z-[9] -mr-1.5 min-w-0 flex-[1_1_0%] basis-0 px-2 sm:px-3"
            style={{ backgroundColor: C.dark }}
            innerClassName="flex min-h-0 min-w-0 items-center"
          >
            <span
              className="block min-w-0 w-full truncate text-2xl font-black uppercase leading-none tracking-tight sm:text-3xl"
              style={{ color: C.white, ...OUTLINE }}
            >
              {state.TeamA}
            </span>
          </SkewPanel>

          <SkewPanel
            className="z-[8] -mr-1.5 w-[4.25rem] shrink-0 border-2 border-solid border-black"
            style={{
              backgroundImage: `linear-gradient(to right, ${C.blueBand1}, ${C.blueBand2})`,
            }}
            innerClassName="flex items-center justify-center px-1"
          >
            <span className="text-3xl font-black tabular-nums leading-none sm:text-4xl" style={{ color: C.white, ...OUTLINE }}>
              {state.ScoreA}
            </span>
          </SkewPanel>

          <SkewPanel
            className="z-[7] min-w-[6.5rem] shrink-0 border-2 border-solid border-black px-1 sm:min-w-[7.5rem] sm:px-2"
            style={{
              backgroundImage: `linear-gradient(to right, ${C.blueBand1}, ${C.blueBand2})`,
            }}
            innerClassName="flex items-center justify-center leading-none"
          >
            {state.PowerPlayActive ? (
              <span className="whitespace-nowrap text-lg font-black tabular-nums tracking-tight" style={{ color: C.white, ...OUTLINE }}>
                ББ {state.PowerPlayTimer}
              </span>
            ) : (
              <div className="flex flex-row items-center justify-center gap-0.5">
                <span className="text-xl font-black leading-none" style={{ color: C.white, ...OUTLINE }}>
                  {period.num}
                </span>
                <span className="text-xl font-black uppercase leading-none" style={{ color: C.white, ...OUTLINE }}>
                  {period.rest}
                </span>
              </div>
            )}
          </SkewPanel>
        </div>

        {/* Нижняя команда */}
        <div className="flex min-w-0 items-center">
          <SkewPanel
            className="z-10 -mr-1.5 w-[4.25rem] shrink-0 border-solid border-b-[4px] border-l-[4px] px-0.5"
            style={{ backgroundColor: C.logoBg, borderLeftColor: C.accent, borderBottomColor: C.accent }}
            innerClassName="flex items-center justify-center"
          >
            {state.logo_b.trim() ? (
              <img
                src={resolveLogoSrc(state.logo_b.trim())}
                alt=""
                className="h-10 w-10 max-h-[2.75rem] max-w-[2.75rem] object-contain"
              />
            ) : (
              <span className="text-xs font-black uppercase text-white/50">B</span>
            )}
          </SkewPanel>

          <SkewPanel
            className="z-[9] -mr-1.5 min-w-0 flex-[1_1_0%] basis-0 px-2 sm:px-3"
            style={{ backgroundColor: C.blueBandBottom }}
            innerClassName="flex min-h-0 min-w-0 items-center"
          >
            <span
              className="block min-w-0 w-full truncate text-2xl font-black uppercase leading-none tracking-tight sm:text-3xl"
              style={{ color: C.white, ...OUTLINE }}
            >
              {state.TeamB}
            </span>
          </SkewPanel>

          <SkewPanel
            className="z-[8] -mr-1.5 w-[4.25rem] shrink-0 border-2 border-solid border-black"
            style={{ backgroundColor: C.darkScoreB }}
            innerClassName="flex items-center justify-center px-1"
          >
            <span className="text-3xl font-black tabular-nums leading-none sm:text-4xl" style={{ color: C.white, ...OUTLINE }}>
              {state.ScoreB}
            </span>
          </SkewPanel>

          <SkewPanel
            className="z-[7] min-w-[6.5rem] shrink-0 border-2 border-solid border-black px-1 sm:min-w-[7.5rem] sm:px-2"
            style={{
              backgroundImage: `linear-gradient(to right, ${C.blueBand1}, ${C.blueBand2})`,
            }}
            innerClassName="flex items-center justify-center leading-none"
          >
            {state.PowerPlayActive ? (
              <span className="whitespace-nowrap text-lg font-black tabular-nums tracking-tight" style={{ color: C.white, ...OUTLINE }}>
                {state.Timer} · {period.num} {period.rest}
              </span>
            ) : (
              <span className="text-[1.4rem] font-black tabular-nums leading-none tracking-tight sm:text-[1.65rem]" style={{ color: C.white, ...OUTLINE }}>
                {state.Timer}
              </span>
            )}
          </SkewPanel>
        </div>

        {tickerText ? (
          <div
            className="flex min-h-9 items-center justify-center px-3 py-1 text-center text-xs font-black uppercase leading-tight tracking-wide"
            style={{ backgroundColor: C.blueBandBottom, color: C.white, ...OUTLINE }}
          >
            {tickerText}
          </div>
        ) : null}
      </div>
    </section>
  );

  if (variant === "preview") {
    return (
      <div className="relative flex h-[220px] w-full items-center justify-center overflow-hidden rounded border border-zinc-800 bg-zinc-950">
        <div className="pointer-events-none origin-center scale-[0.62]">{scorebug}</div>
      </div>
    );
  }

  return (
    <main className="box-border flex min-h-screen w-full max-w-none min-w-0 items-start justify-start bg-transparent px-2 py-3 sm:px-4 sm:py-4">
      {scorebug}
    </main>
  );
}
