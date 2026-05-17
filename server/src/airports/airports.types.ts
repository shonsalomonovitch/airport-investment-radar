export interface Airport {
  id: string;
  ident: string; // ICAO identifier, e.g. "KBOS"
  type: string; // "large_airport" | "medium_airport" | "small_airport" | "heliport" | etc.
  name: string;
  latitude: number;
  longitude: number;
  elevationFt: number | null;
  isoCountry: string;
  isoRegion: string; // e.g. "US-MA"
  municipality: string;
  scheduledService: boolean;
  icaoCode: string;
  iataCode: string;
}

export interface Runway {
  airportIdent: string; // ICAO identifier
  lengthFt: number | null;
  widthFt: number | null;
  surface: string;
  lighted: boolean;
  closed: boolean;
}

export interface RunwayCapacityProxy {
  runwayCount: number;
  activeRunwayCount: number;
  maxLengthFt: number | null;
  capacityCategory: 'high' | 'medium' | 'low';
}

export interface AirportResult<T> {
  data: T;
  source: string;
  uncertainty?: string;
}

/**
 * Enriched airport profile assembled from one or more sources.
 * Used by scoring and tool services — not the raw internal Airport type.
 */
export interface AirportProfile {
  iata: string;
  icao: string;
  name: string;
  city: string;
  state: string; // e.g. "MA"
  region: string; // iso_region code, e.g. "US-MA"
  country: string;
  latitude: number | null;
  longitude: number | null;
  elevationFt: number | null;
  type: string; // "large_airport" | "medium_airport" | "small_airport" | ...
  size: string; // from API Ninjas if available, otherwise derived from type
  scheduledService: boolean | null;
  runwayCount: number | null;
  longestRunwayFt: number | null;
  sources: string[];
  uncertainty: string[];
}

export interface AirportProfileResult {
  data: AirportProfile | null;
  sources: string[];
  uncertainty: string[];
}
