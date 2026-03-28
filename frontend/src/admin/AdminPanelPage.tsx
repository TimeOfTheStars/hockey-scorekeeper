import { useMemo } from "react";
import type { GameState } from "../../../shared/types/gameState";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { ObsScoreboardView } from "../obs-scoreboard/ObsScoreboardView";
import { patchState, runAction, useRealtimeGameState } from "../shared/realtimeClient";

function labeledInput(
  label: string,
  value: string | number,
  onCommit: (value: string) => void,
  type: "text" | "number" = "text",
) {
  return (
    <label className="block text-sm text-zinc-300">
      <span className="mb-1 block">{label}</span>
      <Input
        type={type}
        defaultValue={String(value)}
        onBlur={(e) => onCommit(e.target.value)}
      />
    </label>
  );
}

export function AdminPanelPage() {
  const { state, connected } = useRealtimeGameState();

  const wsLabel = useMemo(() => (connected ? "WS connected" : "Polling fallback"), [connected]);

  const update = async <K extends keyof GameState>(key: K, value: GameState[K]) => {
    await patchState({ [key]: value } as Partial<GameState>);
  };

  return (
    <main className="min-h-screen bg-zinc-950 p-5 text-zinc-100">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Control Panel</h1>
            <span className="rounded bg-zinc-800 px-2 py-1 text-xs">{wsLabel}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {labeledInput(
              "TournamentTitle (верхняя панель, слева)",
              state.TournamentTitle,
              (v) => void update("TournamentTitle", v),
            )}
            {labeledInput(
              "SeriesInfo (верхняя панель, справа)",
              state.SeriesInfo,
              (v) => void update("SeriesInfo", v),
            )}
            {labeledInput(
              "BrandingImage (файл в /logos/, пусто = Time of the stars)",
              state.BrandingImage,
              (v) => void update("BrandingImage", v),
            )}
            {labeledInput("TeamA", state.TeamA, (v) => void update("TeamA", v))}
            {labeledInput("TeamAFull", state.TeamAFull, (v) => void update("TeamAFull", v))}
            {labeledInput("TeamB", state.TeamB, (v) => void update("TeamB", v))}
            {labeledInput("TeamBFull", state.TeamBFull, (v) => void update("TeamBFull", v))}
            {labeledInput("logo_a", state.logo_a, (v) => void update("logo_a", v))}
            {labeledInput("logo_b", state.logo_b, (v) => void update("logo_b", v))}
            {labeledInput("Timer", state.Timer, (v) => void update("Timer", v))}
            {labeledInput("PowerPlayTimer (MM:SS)", state.PowerPlayTimer, (v) => void update("PowerPlayTimer", v))}
            {labeledInput("Period", state.Period, (v) => void update("Period", Number(v)), "number")}
            {labeledInput("ShotsA (не на табло)", state.ShotsA, (v) => void update("ShotsA", Number(v)), "number")}
            {labeledInput("ShotsB (не на табло)", state.ShotsB, (v) => void update("ShotsB", Number(v)), "number")}
            {labeledInput("penalty_a", state.penalty_a, (v) => void update("penalty_a", v))}
            {labeledInput("penalty_b", state.penalty_b, (v) => void update("penalty_b", v))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void runAction("/api/actions/goal?team=A&delta=1")}>A +1</Button>
            <Button variant="secondary" onClick={() => void runAction("/api/actions/goal?team=A&delta=-1")}>
              A -1
            </Button>
            <Button onClick={() => void runAction("/api/actions/goal?team=B&delta=1")}>B +1</Button>
            <Button variant="secondary" onClick={() => void runAction("/api/actions/goal?team=B&delta=-1")}>
              B -1
            </Button>
            <Button onClick={() => void runAction(`/api/actions/period?period=${state.Period + 1}`)}>
              Period +1
            </Button>
            <Button variant="outline" onClick={() => void runAction(`/api/actions/period?period=${Math.max(1, state.Period - 1)}`)}>
              Period -1
            </Button>
            <Button variant="destructive" onClick={() => void runAction("/api/actions/timer?running=true")}>
              Start
            </Button>
            <Button variant="outline" onClick={() => void runAction("/api/actions/timer?running=false")}>
              Stop
            </Button>
            <Button onClick={() => void runAction("/api/actions/powerplay?active=true")}>Большинство ON</Button>
            <Button variant="outline" onClick={() => void runAction("/api/actions/powerplay?active=false")}>
              Большинство OFF
            </Button>
            <Button onClick={() => void runAction("/api/actions/visible?visible=true")}>Visible ON</Button>
            <Button variant="outline" onClick={() => void runAction("/api/actions/visible?visible=false")}>
              Visible OFF
            </Button>
          </div>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-lg font-semibold">Live Preview</h2>
          <ObsScoreboardView state={state} variant="preview" />
          <p className="text-xs text-zinc-400">
            Тот же интерфейс, что на `/` — обновляется из этого же состояния (порт Vite:{" "}
            <code className="text-zinc-300">/controlpanel</code>).
          </p>
        </Card>
      </div>
    </main>
  );
}
