import type { GameState } from "../../../../packages/shared/types/gameState";
import {
  applyTeamNameMode,
  mapServerRowToGameState,
  type IceFieldId,
  type ServerScoreboardRow,
  type TeamNameMode,
} from "../../../../packages/shared/types/serverScoreboard";

export type { IceFieldId, TeamNameMode };

export function parseExternalStatePayload(
  raw: unknown,
  field: IceFieldId = "A",
  nameMode: TeamNameMode = "short",
): GameState | null {
  const one = Array.isArray(raw) ? raw[0] : raw;
  if (!one || typeof one !== "object") {
    return null;
  }

  const base = mapServerRowToGameState(one as ServerScoreboardRow, field);
  return applyTeamNameMode(base, nameMode);
}
