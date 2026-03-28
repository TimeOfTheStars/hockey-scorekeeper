import { ObsScoreboardView } from "./ObsScoreboardView";
import { useRealtimeGameState } from "../shared/realtimeClient";

export function ObsScoreboardPage() {
  const { state } = useRealtimeGameState();
  return <ObsScoreboardView state={state} variant="full" />;
}
