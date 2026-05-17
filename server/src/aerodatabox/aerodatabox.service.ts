import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { ApiCacheService } from '../cache/api-cache.service';
import type {
  AeroDataBoxFlightEntry,
  AeroDataBoxFlightsResponse,
  AeroDataBoxRouteEntry,
  AeroDataBoxRoutesResponse,
  NormalizedFlightsResult,
  NormalizedRoutesResult,
  RouteEntry,
} from './aerodatabox.types';

const PROVIDER = 'aerodatabox';
const BASE_URL = 'https://aerodatabox.p.rapidapi.com';
const FLIGHTS_TTL_MINUTES = 60 * 24; // 24 hours
const ROUTES_TTL_MINUTES = 60 * 24 * 7; // 7 days

const FALLBACK_FLIGHTS: NormalizedFlightsResult = {
  totalFlights: 0,
  delayedFlights: null,
  cancelledFlights: 0,
  activeFlights: 0,
  landedFlights: 0,
  rawCount: 0,
  source: 'fallback',
  uncertainty: [
    'Live aviation data is unavailable.',
    'Flight statistics could not be retrieved from AeroDataBox or local cache.',
  ],
};

const FALLBACK_ROUTES: NormalizedRoutesResult = {
  totalRoutes: 0,
  routes: [],
  source: 'fallback',
  uncertainty: [
    'Live route data is unavailable.',
    'Route information could not be retrieved from AeroDataBox or local cache.',
  ],
};

@Injectable()
export class AeroDataBoxService {
  private readonly logger = new Logger(AeroDataBoxService.name);

  private readonly apiKey: string;

  constructor(
    private readonly config: ConfigService,
    private readonly apiCache: ApiCacheService,
  ) {
    this.apiKey = this.config.getOrThrow<string>('AERODATABOX_API_KEY');
  }

  async getFlightsByDeparture(iata: string): Promise<NormalizedFlightsResult> {
    const normalizedIata = iata.trim().toUpperCase();
    const cacheKey = `aerodatabox:flights:dep:${normalizedIata}`;

    const cached = await this.apiCache.getFresh(cacheKey);
    if (cached) {
      this.logger.debug(`DB cache hit for ${cacheKey}`);
      return {
        ...(cached.responseJson as NormalizedFlightsResult),
        source: 'aerodatabox-cache',
      };
    }

    try {
      const result = await this.fetchFlights(normalizedIata);
      await this.apiCache.set(PROVIDER, cacheKey, result, FLIGHTS_TTL_MINUTES);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `AeroDataBox flights request failed for ${normalizedIata}: ${message}`,
      );
    }

    return FALLBACK_FLIGHTS;
  }

  async getRoutesByDeparture(iata: string): Promise<NormalizedRoutesResult> {
    const normalizedIata = iata.trim().toUpperCase();
    const cacheKey = `aerodatabox:routes:dep:${normalizedIata}`;

    const cached = await this.apiCache.getFresh(cacheKey);
    if (cached) {
      this.logger.debug(`DB cache hit for ${cacheKey}`);
      return {
        ...(cached.responseJson as NormalizedRoutesResult),
        source: 'aerodatabox-cache',
      };
    }

    try {
      const result = await this.fetchRoutes(normalizedIata);
      await this.apiCache.set(PROVIDER, cacheKey, result, ROUTES_TTL_MINUTES);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `AeroDataBox routes request failed for ${normalizedIata}: ${message}`,
      );
    }

    return FALLBACK_ROUTES;
  }

  private buildHeaders(): Record<string, string> {
    return {
      'x-rapidapi-host': 'aerodatabox.p.rapidapi.com',
      'x-rapidapi-key': this.apiKey,
    };
  }

  private todayDateRange(): { from: string; to: string } {
    // AeroDataBox max window is 12 hours; use 06:00–18:00 UTC to cover peak ops
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    return { from: `${y}-${m}-${d}T06:00`, to: `${y}-${m}-${d}T18:00` };
  }

  private async fetchFlights(iata: string): Promise<NormalizedFlightsResult> {
    const { from, to } = this.todayDateRange();
    const response = await axios.get<AeroDataBoxFlightsResponse>(
      `${BASE_URL}/flights/airports/iata/${iata}/${from}/${to}`,
      {
        params: {
          withLeg: false,
          direction: 'Departure',
          withCancelled: true,
          withCodeshared: false,
          withCargo: false,
          withPrivate: false,
        },
        headers: this.buildHeaders(),
        timeout: 10000,
      },
    );

    const flights: AeroDataBoxFlightEntry[] = response.data?.departures ?? [];

    // Delay = revisedTime is later than scheduledTime
    const isDelayed = (f: AeroDataBoxFlightEntry) => {
      const sched = f.movement?.scheduledTime?.utc;
      const revised = f.movement?.revisedTime?.utc;
      if (!sched || !revised) return false;
      return new Date(revised).getTime() > new Date(sched).getTime();
    };
    const isCancelled = (f: AeroDataBoxFlightEntry) => {
      const s = (f.status ?? '').toLowerCase();
      return s.startsWith('cancel');
    };
    const isActive = (f: AeroDataBoxFlightEntry) => {
      const s = (f.status ?? '').toLowerCase();
      return s === 'inair' || s === 'active' || s === 'departed';
    };
    const isLanded = (f: AeroDataBoxFlightEntry) =>
      (f.status ?? '').toLowerCase() === 'landed';

    const delayed = flights.filter(isDelayed).length;
    const cancelled = flights.filter(isCancelled).length;
    const active = flights.filter(isActive).length;
    const landed = flights.filter(isLanded).length;

    return {
      totalFlights: flights.length,
      delayedFlights: delayed,
      cancelledFlights: cancelled,
      activeFlights: active,
      landedFlights: landed,
      rawCount: flights.length,
      source: 'aerodatabox',
      uncertainty: [],
    };
  }

  private async fetchRoutes(iata: string): Promise<NormalizedRoutesResult> {
    const response = await axios.get<AeroDataBoxRoutesResponse>(
      `${BASE_URL}/airports/iata/${iata}/stats/routes/daily`,
      {
        headers: this.buildHeaders(),
        timeout: 10000,
      },
    );

    const rawRoutes: AeroDataBoxRouteEntry[] = response.data?.routes ?? [];

    const routes: RouteEntry[] = rawRoutes
      .filter((r) => r.destination?.iata)
      .map((r) => ({
        iata: (r.destination?.iata ?? '').toUpperCase(),
        lat: r.destination?.location?.lat ?? null,
        lon: r.destination?.location?.lon ?? null,
        averageDailyFlights: r.averageDailyFlights ?? null,
      }));

    return {
      totalRoutes: routes.length,
      routes,
      source: 'aerodatabox',
      uncertainty:
        routes.length === 0
          ? ['No route data returned from AeroDataBox for this airport.']
          : [],
    };
  }
}
