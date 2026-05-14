import { defaultGameState, type GameState } from "./gameState";

/** Команда одного поля льда в новом формате API. */
export interface ServerField {
  TeamH?: string;
  TeamHFull?: string;
  TeamG?: string;
  TeamGFull?: string;
  ScoreH?: number;
  ScoreG?: number;
  ShotsH?: number;
  ShotsG?: number;
  LogoH?: string;
  LogoG?: string;
  /** Только в режиме 2 полей: массивы строк-описаний штрафов на стороне H и G. */
  Penalties?: {
    H?: string[];
    G?: string[];
  };
}

/**
 * Новый формат ответа сервера. Корневое состояние турнира + словарь полей.
 * `num_fields = 1` → доступно только `fields.A`, штрафы лежат в top-level `PenaltyH/PenaltyG`.
 * `num_fields = 2` → `fields.A` и `fields.B`, штрафы внутри каждого поля.
 */
export interface ServerScoreboardRow {
  TournamentTitle?: string;
  num_fields?: number;
  fields?: {
    A?: ServerField;
    B?: ServerField;
  };
  /** Секунды до конца периода. */
  Timer?: number;
  timer_running?: boolean;
  timer_default?: number;
  Period?: number;
  Period_label?: string;
  auto_next_period?: boolean;
  logoLeagues?: string;
  host?: string;
  visible?: boolean;
  server_ts?: number;
  /** Штрафы для режима 1 поля (могут быть null). */
  PenaltyH?: string | null;
  PenaltyG?: string | null;
}

export type IceFieldId = "A" | "B";

/** Какой вариант названий команд показывать в табло. */
export type TeamNameMode = "short" | "full";

/** Подменяет TeamA/TeamB на полные/короткие имена в зависимости от режима. */
export function applyTeamNameMode<T extends { TeamA: string; TeamAFull: string; TeamB: string; TeamBFull: string }>(
  state: T,
  mode: TeamNameMode,
): T {
  if (mode !== "full") {
    return state;
  }
  return {
    ...state,
    TeamA: state.TeamAFull?.trim() ? state.TeamAFull : state.TeamA,
    TeamB: state.TeamBFull?.trim() ? state.TeamBFull : state.TeamB,
  };
}

/** Форматирует число секунд как MM:SS. Отрицательные значения клипуются до 0. */
export function formatTimerSeconds(total: number): string {
  const safe = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function firstPenalty(list: string[] | undefined): string {
  if (!list || list.length === 0) {
    return defaultGameState.penalty_a;
  }
  const first = list[0]?.toString().trim();
  return first ? first : defaultGameState.penalty_a;
}

function topLevelPenalty(value: string | null | undefined): string {
  if (value == null) {
    return defaultGameState.penalty_a;
  }
  const t = value.trim();
  return t === "" ? defaultGameState.penalty_a : t;
}

export function mapServerRowToGameState(row: ServerScoreboardRow, field: IceFieldId): GameState {
  const numFields = row.num_fields ?? 1;
  const effectiveField: IceFieldId = field === "B" && numFields >= 2 ? "B" : "A";
  const f: ServerField = row.fields?.[effectiveField] ?? {};

  const penalty_a =
    numFields >= 2 ? firstPenalty(f.Penalties?.H) : topLevelPenalty(row.PenaltyH);
  const penalty_b =
    numFields >= 2 ? firstPenalty(f.Penalties?.G) : topLevelPenalty(row.PenaltyG);

  return {
    ...defaultGameState,
    TournamentTitle: row.TournamentTitle ?? defaultGameState.TournamentTitle,
    SeriesInfo: defaultGameState.SeriesInfo,
    BrandingImage: row.logoLeagues?.trim() ?? "",
    TeamA: f.TeamH ?? defaultGameState.TeamA,
    TeamAFull: f.TeamHFull ?? defaultGameState.TeamAFull,
    TeamB: f.TeamG ?? defaultGameState.TeamB,
    TeamBFull: f.TeamGFull ?? defaultGameState.TeamBFull,
    penalty_a,
    penalty_b,
    ScoreA: f.ScoreH ?? defaultGameState.ScoreA,
    ScoreB: f.ScoreG ?? defaultGameState.ScoreB,
    ShotsA: f.ShotsH ?? defaultGameState.ShotsA,
    ShotsB: f.ShotsG ?? defaultGameState.ShotsB,
    logo_a: f.LogoH?.trim() ?? defaultGameState.logo_a,
    logo_b: f.LogoG?.trim() ?? defaultGameState.logo_b,
    Timer: row.Timer != null ? formatTimerSeconds(row.Timer) : defaultGameState.Timer,
    Period: row.Period ?? defaultGameState.Period,
    Running: row.timer_running ?? defaultGameState.Running,
    Visible: row.visible ?? defaultGameState.Visible,
    PowerPlayTimer: defaultGameState.PowerPlayTimer,
    PowerPlayActive: defaultGameState.PowerPlayActive,
  };
}
