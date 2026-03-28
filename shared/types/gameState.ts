export interface GameState {
  /** Левая строка синей верхней панели (название турнира / лиги) */
  TournamentTitle: string;
  /** Правая строка синей верхней панели (серия, счёт серии и т.п.) */
  SeriesInfo: string;
  /**
   * Имя файла картинки брендинга турнира в `{VITE_BASE_LOGO_URL}/logos/`.
   * Пустая строка — показывается текст «Time of the stars».
   */
  BrandingImage: string;
  TeamA: string;
  TeamAFull: string;
  TeamB: string;
  TeamBFull: string;
  penalty_a: string;
  penalty_b: string;
  ScoreA: number;
  ScoreB: number;
  ShotsA: number;
  ShotsB: number;
  logo_a: string;
  logo_b: string;
  Timer: string;
  /** Таймер большинства (MM:SS); тикает на сервере вместе с Timer, пока Running и PowerPlayActive */
  PowerPlayTimer: string;
  PowerPlayActive: boolean;
  Period: number;
  Running: boolean;
  Visible: boolean;
}

export const defaultGameState: GameState = {
  TournamentTitle: "ТВОЯ ИГРА",
  SeriesInfo: "",
  BrandingImage: "",
  TeamA: "ARC",
  TeamAFull: "ARCTIC",
  TeamB: "ST",
  TeamBFull: "StrongTeam",
  penalty_a: "None",
  penalty_b: "БОЛЬШЕНСТВО 01:36",
  ScoreA: 1,
  ScoreB: 1,
  ShotsA: 14,
  ShotsB: 17,
  logo_a: "team-a.png",
  logo_b: "team-b.png",
  Timer: "11:13",
  PowerPlayTimer: "02:00",
  PowerPlayActive: false,
  Period: 2,
  Running: false,
  Visible: true,
};
