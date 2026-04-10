import type { GameState } from "../../../../packages/shared/types/gameState";
import { defaultGameState } from "../../../../packages/shared/types/gameState";
import {
  isNewServerSchema,
  mapServerRowToGameState,
  type IceFieldId,
  type ServerScoreboardRow,
} from "../../../../packages/shared/types/serverScoreboard";

export type { IceFieldId };

export function parseExternalStatePayload(raw: unknown, field: IceFieldId = "A"): GameState | null {
  const one = Array.isArray(raw) ? raw[0] : raw;
  if (!one || typeof one !== "object") {
    return null;
  }

  if (isNewServerSchema(one)) {
    return mapServerRowToGameState(one as ServerScoreboardRow, field);
  }

  return { ...defaultGameState, ...(one as Partial<GameState>) } as GameState;
}
