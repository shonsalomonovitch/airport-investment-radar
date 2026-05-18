import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as XLSX from 'xlsx';
import * as path from 'path';
import type {
  FaaAirportProfile,
  FaaDemandSnapshot,
  FaaEnplanementsRow,
  FaaOperationsRow,
  FaaResult,
} from './faa-data.types';

const FAA_DIR = path.join(process.cwd(), 'src', 'data', 'faa');
const SOURCE = 'FAA TAF local XLSX dataset';
const CURRENT_YEAR = new Date().getUTCFullYear();

const HUB_SIZE_LABELS: Record<number, FaaAirportProfile['hubSize']> = {
  0: 'non-hub',
  1: 'small',
  2: 'medium',
  3: 'large',
};

@Injectable()
export class FaaDataService implements OnModuleInit {
  private readonly logger = new Logger(FaaDataService.name);

  private airports = new Map<string, FaaAirportProfile>();
  private operations = new Map<
    string,
    { historical: FaaOperationsRow[]; forecast: FaaOperationsRow[] }
  >();
  private enplanements = new Map<
    string,
    { historical: FaaEnplanementsRow[]; forecast: FaaEnplanementsRow[] }
  >();

  onModuleInit() {
    this.loadAirports();
    this.loadOperations();
    this.loadEnplanements();
    this.logger.log(
      `FAA data loaded — ${this.airports.size} airports, ${this.operations.size} operations records, ${this.enplanements.size} enplanement records`,
    );
  }

  getFaaAirportProfile(
    iataOrLocid: string,
  ): FaaResult<FaaAirportProfile | null> {
    // FAA data is keyed by LOCID (FAA location identifier). For most large US
    // commercial airports LOCID == IATA, but mismatches exist for some regional
    // airports. When a lookup misses, scores silently use zero values.
    const key = this.normalizeId(iataOrLocid);
    const profile = this.airports.get(key) ?? null;
    return {
      data: profile,
      source: SOURCE,
      uncertainty: profile
        ? undefined
        : `No FAA airport profile found for "${iataOrLocid}". Note: FAA data is indexed by FAA LOCID, which may differ from the IATA code for some regional airports.`,
    };
  }

  getOperationsForecast(iataOrLocid: string): FaaResult<{
    current: FaaOperationsRow | null;
    forecast: FaaOperationsRow | null;
  }> {
    const key = this.normalizeId(iataOrLocid);
    const record = this.operations.get(key);

    if (!record) {
      return {
        data: { current: null, forecast: null },
        source: SOURCE,
        uncertainty: `No FAA operations data found for "${iataOrLocid}". FAA data is indexed by LOCID, which may differ from the IATA code for some regional airports.`,
      };
    }

    const current =
      record.historical.find((r) => r.year === CURRENT_YEAR) ??
      record.historical.sort((a, b) => b.year - a.year)[0] ??
      null;

    const forecast = record.forecast.sort((a, b) => b.year - a.year)[0] ?? null;

    return { data: { current, forecast }, source: SOURCE };
  }

  getEnplanementsForecast(iataOrLocid: string): FaaResult<{
    current: FaaEnplanementsRow | null;
    forecast: FaaEnplanementsRow | null;
  }> {
    const key = this.normalizeId(iataOrLocid);
    const record = this.enplanements.get(key);

    if (!record) {
      return {
        data: { current: null, forecast: null },
        source: SOURCE,
        uncertainty: `No FAA enplanements data found for "${iataOrLocid}". FAA data is indexed by LOCID, which may differ from the IATA code for some regional airports.`,
      };
    }

    const current =
      record.historical.find((r) => r.year === CURRENT_YEAR) ??
      record.historical.sort((a, b) => b.year - a.year)[0] ??
      null;

    const forecast = record.forecast.sort((a, b) => b.year - a.year)[0] ?? null;

    return { data: { current, forecast }, source: SOURCE };
  }

  getDemandSnapshot(iataOrLocid: string): FaaResult<FaaDemandSnapshot> {
    const key = this.normalizeId(iataOrLocid);
    const profile = this.airports.get(key);
    const { data: ops } = this.getOperationsForecast(key);
    const { data: enp } = this.getEnplanementsForecast(key);

    const uncertainties: string[] = [];

    if (!profile)
      uncertainties.push('Airport not found in FAA airport dataset.');
    if (!ops.current)
      uncertainties.push('No current operations data available.');
    if (!ops.forecast)
      uncertainties.push('No forecast operations data available.');
    if (!enp.current)
      uncertainties.push('No current enplanements data available.');
    if (!enp.forecast)
      uncertainties.push('No forecast enplanements data available.');

    const currentOps = ops.current?.totalOperations ?? 0;
    const forecastOps = ops.forecast?.totalOperations ?? 0;
    const currentEnp = enp.current?.airCarrier ?? 0;
    const forecastEnp = enp.forecast?.airCarrier ?? 0;

    const opsGrowthPct =
      currentOps > 0
        ? Math.round(((forecastOps - currentOps) / currentOps) * 1000) / 10
        : 0;
    const enpGrowthPct =
      currentEnp > 0
        ? Math.round(((forecastEnp - currentEnp) / currentEnp) * 1000) / 10
        : 0;

    const snapshot: FaaDemandSnapshot = {
      iata: key,
      name: profile?.name ?? key,
      state: profile?.state ?? 'unknown',
      hubSize: profile ? HUB_SIZE_LABELS[profile.hubSizeRaw] : 'unknown',
      currentYear: ops.current?.year ?? CURRENT_YEAR,
      forecastYear: ops.forecast?.year ?? CURRENT_YEAR,
      currentOperations: currentOps,
      forecastOperations: forecastOps,
      operationsGrowthPct: opsGrowthPct,
      currentEnplanements: currentEnp,
      forecastEnplanements: forecastEnp,
      enplanementGrowthPct: enpGrowthPct,
      source: SOURCE,
      uncertainty:
        uncertainties.length > 0 ? uncertainties.join(' ') : undefined,
    };

    return {
      data: snapshot,
      source: SOURCE,
      uncertainty: snapshot.uncertainty,
    };
  }

  private loadAirports() {
    let wb: ReturnType<typeof XLSX.readFile>;
    try {
      wb = XLSX.readFile(path.join(FAA_DIR, 'Airports.xlsx'));
    } catch (err) {
      this.logger.error(
        `Failed to load FAA Airports.xlsx: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets['Sheet1'],
    );

    for (const row of rows) {
      const locid = this.normalizeId(
        (row['LOCID'] as string | undefined) ?? '',
      );
      if (!locid) continue;

      const profile: FaaAirportProfile = {
        locid,
        name: ((row['APORT_NAME'] as string | undefined) ?? '').trim(),
        city: ((row['CITY'] as string | undefined) ?? '').trim(),
        state: ((row['STATE'] as string | undefined) ?? '').trim(),
        region: ((row['REGION'] as string | undefined) ?? '').trim(),
        hubSizeRaw: Number(row['HUB_SIZE'] ?? 0),
        hubSize: HUB_SIZE_LABELS[Number(row['HUB_SIZE'] ?? 0)] ?? 'non-hub',
        servedVolume: Number(row['SER_VOL'] ?? 0),
        hasControlTower: Number(row['ATCT_FLAG']) === 1,
        isOep35: Number(row['OEP35']) === 1,
      };

      this.airports.set(locid, profile);
    }
  }

  private loadOperations() {
    let wb: ReturnType<typeof XLSX.readFile>;
    try {
      wb = XLSX.readFile(path.join(FAA_DIR, 'AirportsOperations.xlsx'));
    } catch (err) {
      this.logger.error(
        `Failed to load FAA AirportsOperations.xlsx: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets['Sheet1'],
    );

    for (const row of rows) {
      const locid = this.normalizeId(
        (row['locid'] as string | undefined) ?? '',
      );
      if (!locid) continue;

      const ops: FaaOperationsRow = {
        locid,
        scenario: Number(row['scenario']),
        year: Number(row['ayear']),
        airCarrierItinerant: Number(row['itn_Ac'] ?? 0),
        airTaxiItinerant: Number(row['itn_at'] ?? 0),
        generalAviationItinerant: Number(row['itn_ga'] ?? 0),
        militaryItinerant: Number(row['itn_mil'] ?? 0),
        localGa: Number(row['loc_ga'] ?? 0),
        localMilitary: Number(row['loc_mil'] ?? 0),
        overflights: Number(row['tot_overs'] ?? 0),
        totalOperations: 0,
      };
      ops.totalOperations =
        ops.airCarrierItinerant +
        ops.airTaxiItinerant +
        ops.generalAviationItinerant +
        ops.militaryItinerant +
        ops.localGa +
        ops.localMilitary;

      const existing = this.operations.get(locid) ?? {
        historical: [],
        forecast: [],
      };
      if (ops.scenario === 0) existing.historical.push(ops);
      else existing.forecast.push(ops);
      this.operations.set(locid, existing);
    }
  }

  private loadEnplanements() {
    let wb: ReturnType<typeof XLSX.readFile>;
    try {
      wb = XLSX.readFile(path.join(FAA_DIR, 'Enplanements.xlsx'));
    } catch (err) {
      this.logger.error(
        `Failed to load FAA Enplanements.xlsx: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets['Sheet1'],
    );

    for (const row of rows) {
      const locid = this.normalizeId(
        (row['locid'] as string | undefined) ?? '',
      );
      if (!locid) continue;

      const enp: FaaEnplanementsRow = {
        locid,
        scenario: Number(row['scenario']),
        year: Number(row['ayear']),
        airCarrier: Number(row['aac'] ?? 0),
        airTaxi: Number(row['aat'] ?? 0),
        commuter: Number(row['commuter'] ?? 0),
        usFlag: Number(row['us_flag'] ?? 0),
        foreignFlag: Number(row['frgn_flag'] ?? 0),
        totalEnplanements: 0,
      };
      enp.totalEnplanements =
        enp.airCarrier +
        enp.airTaxi +
        enp.commuter +
        enp.usFlag +
        enp.foreignFlag;

      const existing = this.enplanements.get(locid) ?? {
        historical: [],
        forecast: [],
      };
      if (enp.scenario === 0) existing.historical.push(enp);
      else existing.forecast.push(enp);
      this.enplanements.set(locid, existing);
    }
  }

  private normalizeId(raw: string): string {
    return raw.trim().toUpperCase();
  }
}
