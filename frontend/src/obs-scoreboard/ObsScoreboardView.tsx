import type { GameState } from "../../../shared/types/gameState";

function periodLabel(period: number): string {
  if (period === 1) return "1ST";
  if (period === 2) return "2ND";
  if (period === 3) return "3RD";
  return `${period}TH`;
}

function logoUrl(fileName: string) {
  return `${import.meta.env.VITE_BASE_LOGO_URL}/logos/${fileName}`;
}

/** Имя файла в /logos/ или уже полный http(s) URL (как у vmix API). */
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

/** Нижний красный тикер: при большинстве — таймер PP, иначе penalty_a / penalty_b. «None» и пусто — не показываем. */
function bottomTickerText(state: GameState): string {
  if (state.PowerPlayActive) {
    return `БОЛЬШИНСТВО ${state.PowerPlayTimer}`;
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
      variant === "preview" ? "flex h-full min-h-[120px] w-full items-center justify-center bg-zinc-900/50 text-sm text-zinc-500" : "h-screen w-screen bg-transparent";
    return <div className={emptyClass}>Скрыто (Visible: off)</div>;
  }

  const tickerText = bottomTickerText(state);

  const section = (
    <section className="w-[1040px] overflow-hidden border border-zinc-900/80 bg-zinc-950/90 text-white shadow-2xl">
      <div className="flex min-h-[52px] items-center justify-between bg-gradient-to-r from-[#0a5db2] to-[#0d7ce6] px-5 py-2 font-black uppercase tracking-wide">
        <span className="max-w-[55%] text-left text-[18px] leading-tight">{state.TournamentTitle}</span>
        <span className="max-w-[42%] text-right text-[18px] leading-tight">{state.SeriesInfo}</span>
      </div>

      <div className="flex h-[152px]">
        <div className="flex w-[218px] items-center justify-center gap-3 bg-gradient-to-b from-[#07101e] to-[#0a0f1a] px-2">
          {state.BrandingImage.trim() ? (
            <img
              src={resolveLogoSrc(state.BrandingImage.trim())}
              alt=""
              className="max-h-[132px] w-full max-w-[200px] object-contain object-center"
            />
          ) : (
            <div className="max-w-[200px] px-1 text-center leading-none">
              <span className="text-[22px] font-black tracking-wide text-white">Time of the stars</span>
            </div>
          )}
        </div>

        <div className="flex flex-1">
          <div className="flex-1">
            <div className="flex h-1/2 items-center border-y border-zinc-900 bg-[linear-gradient(90deg,#0f3767_0%,#0f3767_58%,#14294a_100%)] px-4">
              <img src={resolveLogoSrc(state.logo_a)} alt={state.TeamA} className="mr-3 h-12 w-12 object-contain" />
              <span className="text-[58px] font-black uppercase leading-none">{state.TeamA}</span>
              <span className="ml-auto text-[68px] font-black leading-none">{state.ScoreA}</span>
            </div>
            <div className="flex h-1/2 items-center border-b border-zinc-900 bg-[linear-gradient(90deg,#8e1f33_0%,#8e1f33_58%,#681828_100%)] px-4">
              <img src={resolveLogoSrc(state.logo_b)} alt={state.TeamB} className="mr-3 h-12 w-12 object-contain" />
              <span className="text-[58px] font-black uppercase leading-none">{state.TeamB}</span>
              <span className="ml-auto text-[68px] font-black leading-none">{state.ScoreB}</span>
            </div>
          </div>

          <div className="flex w-[200px] shrink-0 flex-col border-l border-zinc-900 bg-black">
            <div className="flex flex-1 items-center justify-center border-b border-zinc-900 pt-1">
              <div className="text-[56px] font-black leading-none">{periodLabel(state.Period)}</div>
            </div>
            <div className="flex flex-1 items-center justify-center py-1">
              <div className="text-[64px] font-black leading-none tracking-tight">{state.Timer}</div>
            </div>
          </div>
        </div>
      </div>

      {tickerText ? (
        <div className="flex min-h-12 items-center bg-[linear-gradient(90deg,#8d1f33_0%,#b02f49_50%,#8d1f33_100%)] px-4 text-[36px] font-black uppercase leading-none">
          {tickerText}
        </div>
      ) : null}
    </section>
  );

  if (variant === "preview") {
    return (
      <div className="relative h-[280px] w-full overflow-hidden rounded border border-zinc-800 bg-zinc-950">
        <div className="pointer-events-none absolute left-0 top-0 origin-top-left scale-[0.42]">
          {section}
        </div>
      </div>
    );
  }

  return <main className="flex h-screen w-screen items-start justify-start bg-transparent p-4">{section}</main>;
}
