export type AeroDataBoxSource =
  | 'aerodatabox'
  | 'aerodatabox-cache'
  | 'fallback';

export interface RouteEntry {
  iata: string;
  lat: number | null;
  lon: number | null;
  averageDailyFlights: number | null;
}

export interface NormalizedFlightsResult {
  totalFlights: number;
  delayedFlights: number | null;
  cancelledFlights: number;
  activeFlights: number;
  landedFlights: number;
  rawCount: number;
  source: AeroDataBoxSource;
  uncertainty: string[];
}

export interface NormalizedRoutesResult {
  totalRoutes: number;
  routes: RouteEntry[];
  source: AeroDataBoxSource;
  uncertainty: string[];
}

export interface AeroDataBoxLocation {
  lat?: number;
  lon?: number;
}

export interface AeroDataBoxRouteAirport {
  icao?: string;
  iata?: string;
  name?: string;
  location?: AeroDataBoxLocation;
}

export interface AeroDataBoxRouteEntry {
  destination?: AeroDataBoxRouteAirport;
  averageDailyFlights?: number;
}

export interface AeroDataBoxRoutesResponse {
  routes?: AeroDataBoxRouteEntry[];
}

export interface AeroDataBoxFlightTime {
  local?: string;
  utc?: string;
}

export interface AeroDataBoxFlightMovement {
  scheduledTime?: AeroDataBoxFlightTime;
  revisedTime?: AeroDataBoxFlightTime;
  terminal?: string;
}

export interface AeroDataBoxFlightAirline {
  name?: string;
  iata?: string;
}

export interface AeroDataBoxFlightEntry {
  movement?: AeroDataBoxFlightMovement;
  airline?: AeroDataBoxFlightAirline;
  number?: string;
  status?: string; // "Expected" | "Departed" | "CanceledUncertain" | "Unknown" etc.
  codeshareStatus?: string;
  isCargo?: boolean;
}

export interface AeroDataBoxFlightsResponse {
  departures?: AeroDataBoxFlightEntry[];
}
