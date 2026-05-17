export interface ComponentScore {
  score: number; // 0–100
  weight: number; // 0.35 | 0.25 | 0.20 | 0.20
  weightedScore: number; // score * weight, rounded to 1 decimal
  keyDrivers: string[];
  assumptions: string[];
  uncertainty: string[];
}

export interface ScoreBreakdown {
  congestion: ComponentScore;
  activity: ComponentScore;
  longHaul: ComponentScore;
  unmetDemand: ComponentScore;
}

export type ScoreGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface AirportScore {
  iata: string;
  name: string;
  totalScore: number; // 0–100, weighted sum rounded to integer
  grade: ScoreGrade;
  breakdown: ScoreBreakdown;
  keyDrivers: string[];
  assumptions: string[];
  uncertainty: string[];
  sources: string[];
  calculatedAt: string; // ISO timestamp
  fromCache: boolean;
}

export interface LongHaulShareResult {
  iata: string;
  totalRoutes: number;
  longHaulRoutes: number;
  longHaulSharePct: number;
  longHaulThresholdKm: number;
  routeDetails: {
    destination: string;
    distanceKm: number | null;
    isLongHaul: boolean;
    note?: string;
  }[];
  uncertainty: string[];
  sources: string[];
}

export interface UnmetDemandResult {
  iata: string;
  proxyScore: number; // 0–100
  demandGrowthSignal: number; // avg of ops + enplanement growth pct
  congestionSignal: number; // 0–100
  capacityConstraint: 'high' | 'medium' | 'low';
  interpretation: string;
  uncertainty: string[];
  sources: string[];
}

export interface AirportRankingEntry {
  rank: number;
  iata: string;
  name: string;
  totalScore: number;
  grade: ScoreGrade;
  topDrivers: string[];
  fromCache: boolean;
}

export interface RegionRankingResult {
  region: string;
  airports: AirportRankingEntry[];
  uncertainty: string[];
  sources: string[];
}

export interface AirportComparisonResult {
  airportA: AirportScore;
  airportB: AirportScore;
  winner: string; // IATA of higher-scoring airport, or 'tie'
  dimensionWinners: {
    congestion: string;
    activity: string;
    longHaul: string;
    unmetDemand: string;
  };
}
