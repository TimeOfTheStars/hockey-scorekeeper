import { defaultGameState, type GameState } from "./gameState";

/**
 * Формат одного объекта из ответа внешнего API (массив из одного элемента).
 * Поле льда выбирается на клиенте: A → HA/GA, B → HB/GB.
 */
export interface ServerScoreboardRow {
  TournamentTitle?: string;
  TeamHA?: string;
  TeamHAFull?: string;
  TeamGA?: string;
  TeamGAFull?: string;
  TeamHB?: string;
  TeamHBFull?: string;
  TeamGB?: string;
  TeamGBFull?: string;
  PenaltyH?: string;
  PenaltyG?: string;
  ScoreHA?: number;
  ScoreGA?: number;
  ScoreHB?: number;
  ScoreGB?: number;
  ShotsH?: number;
  ShotsG?: number;
  LogoHA?: string;
  LogoGA?: string;
  LogoHB?: string;
  LogoGB?: string;
  /** URL или имя файла логотипа лиги/турнира */
  logoLeagues?: string;
  Timer?: string;
  Period?: number;
  Running?: boolean;
  Visible?: boolean;
  PowerPlayTimer?: string;
  PowerPlayActive?: boolean;
}

export type IceFieldId = "A" | "B";

export function isNewServerSchema(o: object): boolean {
  const r = o as Record<string, unknown>;
  return "TeamHA" in r || "TeamHB" in r || "ScoreHA" in r || "ScoreHB" in r;
}

export function mapServerRowToGameState(row: ServerScoreboardRow, field: IceFieldId): GameState {
  const base = {
    ...defaultGameState,
    TournamentTitle: row.TournamentTitle ?? defaultGameState.TournamentTitle,
    SeriesInfo: defaultGameState.SeriesInfo,
    BrandingImage: row.logoLeagues?.trim() ?? "",
    Timer: row.Timer ?? defaultGameState.Timer,
    Period: row.Period ?? defaultGameState.Period,
    Running: row.Running ?? defaultGameState.Running,
    Visible: row.Visible ?? defaultGameState.Visible,
    PowerPlayTimer: row.PowerPlayTimer ?? defaultGameState.PowerPlayTimer,
    PowerPlayActive: row.PowerPlayActive ?? defaultGameState.PowerPlayActive,
  };

  if (field === "A") {
    return {
      ...base,
      TeamA: row.TeamHA ?? base.TeamA,
      TeamAFull: row.TeamHAFull ?? base.TeamAFull,
      TeamB: row.TeamGA ?? base.TeamB,
      TeamBFull: row.TeamGAFull ?? base.TeamBFull,
      penalty_a: row.PenaltyH ?? base.penalty_a,
      penalty_b: row.PenaltyG ?? base.penalty_b,
      ScoreA: row.ScoreHA ?? base.ScoreA,
      ScoreB: row.ScoreGA ?? base.ScoreB,
      ShotsA: row.ShotsH ?? base.ShotsA,
      ShotsB: row.ShotsG ?? base.ShotsB,
      logo_a: row.LogoHA?.trim() ?? base.logo_a,
      logo_b: row.LogoGA?.trim() ?? base.logo_b,
    };
  }

  return {
    ...base,
    TeamA: row.TeamHB ?? base.TeamA,
    TeamAFull: row.TeamHBFull ?? base.TeamAFull,
    TeamB: row.TeamGB ?? base.TeamB,
    TeamBFull: row.TeamGBFull ?? base.TeamBFull,
    penalty_a: row.PenaltyH ?? base.penalty_a,
    penalty_b: row.PenaltyG ?? base.penalty_b,
    ScoreA: row.ScoreHB ?? base.ScoreA,
    ScoreB: row.ScoreGB ?? base.ScoreB,
    ShotsA: row.ShotsH ?? base.ShotsA,
    ShotsB: row.ShotsG ?? base.ShotsB,
    logo_a: row.LogoHB?.trim() ?? base.logo_a,
    logo_b: row.LogoGB?.trim() ?? base.logo_b,
  };
}
