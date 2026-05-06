import type { GameState } from "../../../../packages/shared/types/gameState";
import { defaultGameState } from "../../../../packages/shared/types/gameState";
import {
  applyTeamNameMode,
  isNewServerSchema,
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

  const base = isNewServerSchema(one)
    ? mapServerRowToGameState(one as ServerScoreboardRow, field)
    : ({ ...defaultGameState, ...(one as Partial<GameState>) } as GameState);

  return applyTeamNameMode(base, nameMode);
}
