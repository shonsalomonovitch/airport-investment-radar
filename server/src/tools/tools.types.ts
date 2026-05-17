import type { AirportProfile } from '../airports/airports.types';
import type { AirportScore } from '../scoring/scoring.types';

export type ToolResult<T> =
  | { success: true; data: T }
  | { success: false; errorCode: string; userSafeMessage: string };

export interface AnalyzeAirportData {
  score: AirportScore;
  profile: AirportProfile | null;
}
