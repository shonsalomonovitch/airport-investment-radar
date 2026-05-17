import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import type {
  Airport,
  AirportProfile,
  AirportProfileResult,
  AirportResult,
  Runway,
  RunwayCapacityProxy,
} from './airports.types';
import { NAMED_REGIONS } from './regions';

const CSV_DIR = path.join(process.cwd(), 'src', 'data', 'ourairports');

const SOURCE = 'OurAirports CSV (static snapshot)';
const CSV_UNCERTAINTY =
  'Data reflects a static OurAirports snapshot. Flight activity, passenger volumes, and terminal capacity are not included.';

@Injectable()
export class AirportsService implements OnModuleInit {
  private readonly logger = new Logger(AirportsService.name);

  private airportsByIata = new Map<string, Airport>();
  private airportsByIcao = new Map<string, Airport>();
  private runwaysByIcao = new Map<string, Runway[]>();

  onModuleInit() {
    this.loadAirports();
    this.loadRunways();
    this.logger.log(
      `Loaded ${this.airportsByIata.size} US airports with IATA codes and ${this.runwaysByIcao.size} runway groups`,
    );
  }

  getAirportByIata(iata: string): AirportResult<Airport | null> {
    const airport = this.airportsByIata.get(iata.toUpperCase()) ?? null;
    return {
      data: airport,
      source: SOURCE,
      uncertainty: airport
        ? undefined
        : `No airport found for IATA code "${iata}"`,
    };
  }

  getAirportByIcao(icao: string): AirportResult<Airport | null> {
    const airport = this.airportsByIcao.get(icao.toUpperCase()) ?? null;
    return {
      data: airport,
      source: SOURCE,
      uncertainty: airport
        ? undefined
        : `No airport found for ICAO code "${icao}"`,
    };
  }

  getAirportProfile(iata: string): AirportProfileResult {
    const normalizedIata = iata.trim().toUpperCase();
    const csvAirport = this.airportsByIata.get(normalizedIata) ?? null;

    if (!csvAirport) {
      return {
        data: null,
        sources: [],
        uncertainty: [
          `Airport "${normalizedIata}" not found in OurAirports CSV.`,
        ],
      };
    }

    const csvRunways = this.runwaysByIcao.get(csvAirport.ident) ?? [];
    const activeRunways = csvRunways.filter((r) => !r.closed);
    const lengths = activeRunways
      .map((r) => r.lengthFt)
      .filter((l): l is number => l !== null);

    const uncertainty: string[] = [];
    if (csvRunways.length === 0) {
      uncertainty.push(
        'No runway data in OurAirports CSV. Runway count may be approximate.',
      );
    }

    const profile: AirportProfile = {
      iata: csvAirport.iataCode,
      icao: csvAirport.icaoCode,
      name: csvAirport.name,
      city: csvAirport.municipality,
      state: csvAirport.isoRegion.replace('US-', ''),
      region: csvAirport.isoRegion,
      country: csvAirport.isoCountry,
      latitude: csvAirport.latitude,
      longitude: csvAirport.longitude,
      elevationFt: csvAirport.elevationFt,
      type: csvAirport.type,
      size: this.typeToSize(csvAirport.type),
      scheduledService: csvAirport.scheduledService,
      runwayCount: csvRunways.length || null,
      longestRunwayFt: lengths.length > 0 ? Math.max(...lengths) : null,
      sources: [SOURCE],
      uncertainty,
    };

    return { data: profile, sources: [SOURCE], uncertainty };
  }

  getRunwaysForAirport(iata: string): AirportResult<Runway[]> {
    const airport = this.airportsByIata.get(iata.toUpperCase());
    if (!airport) {
      return {
        data: [],
        source: SOURCE,
        uncertainty: `No airport found for IATA code "${iata}"`,
      };
    }
    const runways = this.runwaysByIcao.get(airport.ident) ?? [];
    return {
      data: runways,
      source: SOURCE,
      uncertainty:
        runways.length === 0
          ? `No runway data available for ${iata}. Capacity estimates will use airport type as proxy.`
          : undefined,
    };
  }

  getRunwayCapacityProxy(iata: string): AirportResult<RunwayCapacityProxy> {
    const { data: runways } = this.getRunwaysForAirport(iata);
    const active = runways.filter((r) => !r.closed);
    const lengths = active
      .map((r) => r.lengthFt)
      .filter((l): l is number => l !== null);
    const maxLengthFt = lengths.length > 0 ? Math.max(...lengths) : null;

    const capacityCategory = this.classifyCapacity(active.length, maxLengthFt);

    return {
      data: {
        runwayCount: runways.length,
        activeRunwayCount: active.length,
        maxLengthFt,
        capacityCategory,
      },
      source: SOURCE,
      uncertainty:
        runways.length === 0
          ? 'No runway data found. Capacity category derived from airport type instead.'
          : undefined,
    };
  }

  getDistanceKm(
    originIata: string,
    destinationIata: string,
  ): AirportResult<number | null> {
    const origin = this.airportsByIata.get(originIata.toUpperCase());
    const destination = this.airportsByIata.get(destinationIata.toUpperCase());

    if (!origin || !destination) {
      const missing = [!origin && originIata, !destination && destinationIata]
        .filter(Boolean)
        .join(', ');
      return {
        data: null,
        source: SOURCE,
        uncertainty: `Cannot calculate distance — airport(s) not found: ${missing}`,
      };
    }

    const distanceKm = this.haversineKm(
      origin.latitude,
      origin.longitude,
      destination.latitude,
      destination.longitude,
    );

    return { data: Math.round(distanceKm), source: SOURCE };
  }

  getAirportsByRegion(region: string): AirportResult<Airport[]> {
    const key = region.trim().toLowerCase();
    const stateCodes = NAMED_REGIONS[key] ?? this.resolveStateCode(region);

    if (!stateCodes) {
      return {
        data: [],
        source: SOURCE,
        uncertainty: `Region "${region}" is not recognised. Supported named regions: ${Object.keys(NAMED_REGIONS).join(', ')}.`,
      };
    }

    const stateSet = new Set(stateCodes);
    const airports = [...this.airportsByIata.values()].filter((a) =>
      stateSet.has(a.isoRegion),
    );

    // Scheduled service airports first, then large → medium → small
    airports.sort((a, b) => {
      if (a.scheduledService !== b.scheduledService) {
        return a.scheduledService ? -1 : 1;
      }
      return this.airportTypeRank(a.type) - this.airportTypeRank(b.type);
    });

    return {
      data: airports,
      source: SOURCE,
      uncertainty: CSV_UNCERTAINTY,
    };
  }

  private loadAirports() {
    let raw: string;
    try {
      raw = fs.readFileSync(path.join(CSV_DIR, 'airports.csv'), 'utf-8');
    } catch (err) {
      this.logger.error(
        `Failed to load airports.csv: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    const rows = parse<Record<string, string>>(raw, {
      columns: true,
      skip_empty_lines: true,
    });

    for (const row of rows) {
      if (row['iso_country'] !== 'US') continue;
      if (!row['iata_code']) continue;

      const airport: Airport = {
        id: row['id'],
        ident: row['ident'],
        type: row['type'],
        name: row['name'],
        latitude: parseFloat(row['latitude_deg']),
        longitude: parseFloat(row['longitude_deg']),
        elevationFt: row['elevation_ft']
          ? parseFloat(row['elevation_ft'])
          : null,
        isoCountry: row['iso_country'],
        isoRegion: row['iso_region'],
        municipality: row['municipality'],
        scheduledService: row['scheduled_service'] === 'yes',
        icaoCode: row['icao_code'] || row['ident'],
        iataCode: row['iata_code'],
      };

      this.airportsByIata.set(airport.iataCode.toUpperCase(), airport);
      this.airportsByIcao.set(airport.ident.toUpperCase(), airport);
    }
  }

  private loadRunways() {
    let raw: string;
    try {
      raw = fs.readFileSync(path.join(CSV_DIR, 'runways.csv'), 'utf-8');
    } catch (err) {
      this.logger.error(
        `Failed to load runways.csv: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    const rows = parse<Record<string, string>>(raw, {
      columns: true,
      skip_empty_lines: true,
    });

    for (const row of rows) {
      const ident = row['airport_ident']?.toUpperCase();
      if (!ident || !this.airportsByIcao.has(ident)) continue;

      const runway: Runway = {
        airportIdent: ident,
        lengthFt: row['length_ft'] ? parseFloat(row['length_ft']) : null,
        widthFt: row['width_ft'] ? parseFloat(row['width_ft']) : null,
        surface: row['surface'],
        lighted: row['lighted'] === '1',
        closed: row['closed'] === '1',
      };

      const existing = this.runwaysByIcao.get(ident) ?? [];
      existing.push(runway);
      this.runwaysByIcao.set(ident, existing);
    }
  }

  private classifyCapacity(
    activeRunways: number,
    maxLengthFt: number | null,
  ): 'high' | 'medium' | 'low' {
    if (activeRunways >= 3 || (maxLengthFt !== null && maxLengthFt >= 8000))
      return 'high';
    if (activeRunways >= 2 || (maxLengthFt !== null && maxLengthFt >= 5000))
      return 'medium';
    return 'low';
  }

  haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }

  private airportTypeRank(type: string): number {
    const order: Record<string, number> = {
      large_airport: 0,
      medium_airport: 1,
      small_airport: 2,
    };
    return order[type] ?? 3;
  }

  // Allow passing a raw state code like "US-MA" as the region
  private resolveStateCode(region: string): string[] | null {
    const upper = region.toUpperCase();
    if (/^US-[A-Z]{2}$/.test(upper)) return [upper];
    return null;
  }

  private typeToSize(type: string): string {
    const map: Record<string, string> = {
      large_airport: 'large',
      medium_airport: 'medium',
      small_airport: 'small',
    };
    return map[type] ?? 'unknown';
  }
}
