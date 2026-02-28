
export interface PlayerAlerts {
  tackles: boolean;
  fouls: boolean;
  foulsDrawn: boolean;
  shots: boolean;
  shotsOn: boolean;
  yellow: boolean;
  subOut: boolean;
  interceptions: boolean;
  duelsWon: boolean;
}

export interface PlayerStats {
  displayName: string;
  playerId: number;
  minutes: number;
  // Attack
  goals: number;
  assists: number;
  shotsTotal: number;
  shotsOnTarget: number;
  keyPasses: number;
  // Defense
  tackles: number;
  interceptions: number;
  duelsWon: number;
  // Discipline
  fouls: number;
  foulsDrawn: number;
  yellowCards: number;
  redCards: number;
  // General
  totalPasses: number;
  rating: number;
  isSubstitute: boolean;
}

export interface MonitoredPlayer {
  id: number; // Internal unique ID for the app
  sofaId: number; // Actual API ID
  name: string;
  eventId: number;
  alerts: PlayerAlerts;
  lastStats: PlayerStats | null;
  lastAlertedStats?: PlayerStats | null; // Track what we've already alerted for
  teamColor?: string;
}

export interface Game {
  id: number;
  homeTeam: { name: string; score?: number };
  awayTeam: { name: string; score?: number };
  tournament: string;
  minute?: number;
  status: string;
}

export interface GamePlayer {
  id: number;
  name: string;
  position: string;
  shirtNumber: string;
  minutes: number;
  substitute: boolean;
  statistics?: {
      rating?: number;
      goals?: number;
      assists?: number;
      totalShots?: number;
      shotsOnTarget?: number;
      totalPasses?: number;
      keyPasses?: number;
      tackles?: number;
      interceptions?: number;
      duelsWon?: number;
      fouls?: number;
      wasFouled?: number;
      yellowCards?: number;
      redCards?: number;
  };
}

export interface GameLineups {
  home: {
    name: string;
    starters: GamePlayer[];
    substitutes: GamePlayer[];
  };
  away: {
    name: string;
    starters: GamePlayer[];
    substitutes: GamePlayer[];
  };
}

export interface LogEntry {
  id: string;
  time: string;
  message: string;
  type: 'info' | 'alert' | 'error' | 'success';
}

declare global {
  const __APP_VERSION__: string;
}
