import { Injectable, Logger } from '@nestjs/common';
import { AirportsService } from '../airports/airports.service';
import { FaaDataService } from '../faa-data/faa-data.service';
import { AeroDataBoxService } from '../aerodatabox/aerodatabox.service';
import { PrismaService } from '../prisma/prisma.service';
import type { RunwayCapacityProxy } from '../airports/airports.types';
import type { FaaDemandSnapshot } from '../faa-data/faa-data.types';
import type {
  NormalizedFlightsResult,
  NormalizedRoutesResult,
} from '../aerodatabox/aerodatabox.types';
import type {
  AirportComparisonResult,
  AirportRankingEntry,
  AirportScore,
  ComponentScore,
  LongHaulShareResult,
  RegionRankingResult,
  ScoreBreakdown,
  ScoreGrade,
  UnmetDemandResult,
} from './scoring.types';

const SCORE_TTL_MINUTES = 60 * 24; // 24 hours
const LONG_HAUL_THRESHOLD_KM = 3000;
const RANK_BATCH_SIZE = 5;

const WEIGHTS = {
  congestion: 0.35,
  activity: 0.25,
  longHaul: 0.2,
  unmetDemand: 0.2,
} as const;

const OPS_PER_RUNWAY_MIN = 10_000;
const OPS_PER_RUNWAY_MAX = 100_000;

const TRAFFIC_VOLUME_MIN = 20_000;
const TRAFFIC_VOLUME_MAX = 400_000;

const GROWTH_MIN = -5;
const GROWTH_MAX = 25;

const LONG_HAUL_FULL_MARKS_PCT = 30;

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(
    private readonly airports: AirportsService,
    private readonly faa: FaaDataService,
    private readonly aeroDataBox: AeroDataBoxService,
    private readonly prisma: PrismaService,
  ) {}

  async calculateAirportScore(iata: string): Promise<AirportScore> {
    const code = iata.trim().toUpperCase();

    const cached = await this.getScoreFromCache(code);
    if (cached) return cached;

    const score = await this.computeScore(code);
    await this.saveScoreToCache(code, score);
    return score;
  }

  async compareAirports(
    iataA: string,
    iataB: string,
  ): Promise<AirportComparisonResult> {
    const [scoreA, scoreB] = await Promise.all([
      this.calculateAirportScore(iataA),
      this.calculateAirportScore(iataB),
    ]);

    const winner =
      scoreA.totalScore > scoreB.totalScore
        ? scoreA.iata
        : scoreB.totalScore > scoreA.totalScore
          ? scoreB.iata
          : 'tie';

    const dimWinner = (dim: keyof ScoreBreakdown): string => {
      const a = scoreA.breakdown[dim].score;
      const b = scoreB.breakdown[dim].score;
      return a > b ? scoreA.iata : b > a ? scoreB.iata : 'tie';
    };

    return {
      airportA: scoreA,
      airportB: scoreB,
      winner,
      dimensionWinners: {
        congestion: dimWinner('congestion'),
        activity: dimWinner('activity'),
        longHaul: dimWinner('longHaul'),
        unmetDemand: dimWinner('unmetDemand'),
      },
    };
  }

  async rankAirportsByRegion(region: string): Promise<RegionRankingResult> {
    const { data: airportList, uncertainty } =
      this.airports.getAirportsByRegion(region);

    if (airportList.length === 0) {
      return {
        region,
        airports: [],
        uncertainty: [
          uncertainty ?? `No airports found for region "${region}".`,
        ],
        sources: [],
      };
    }

    const scored: (AirportScore | null)[] = [];
    for (let i = 0; i < airportList.length; i += RANK_BATCH_SIZE) {
      const batch = airportList.slice(i, i + RANK_BATCH_SIZE);
      const results = await Promise.all(
        batch.map((a) =>
          this.calculateAirportScore(a.iataCode).catch(() => null),
        ),
      );
      scored.push(...results);
      if (i + RANK_BATCH_SIZE < airportList.length) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    const ranked: AirportRankingEntry[] = scored
      .filter((s): s is AirportScore => s !== null)
      .sort((a, b) => b.totalScore - a.totalScore)
      .map((s, i) => ({
        rank: i + 1,
        iata: s.iata,
        name: s.name,
        totalScore: s.totalScore,
        grade: s.grade,
        topDrivers: s.keyDrivers.slice(0, 3),
        fromCache: s.fromCache,
      }));

    const allSources = [...new Set(scored.flatMap((s) => s?.sources ?? []))];
    const allUncertainty = uncertainty ? [uncertainty] : [];

    return {
      region,
      airports: ranked,
      uncertainty: allUncertainty,
      sources: allSources,
    };
  }

  async calculateLongHaulShare(iata: string): Promise<LongHaulShareResult> {
    const code = iata.trim().toUpperCase();
    const routes = await this.aeroDataBox.getRoutesByDeparture(code);
    const originAirport = this.airports.getAirportByIata(code);
    const originLat = originAirport.data?.latitude ?? null;
    const originLon = originAirport.data?.longitude ?? null;

    const uncertainty: string[] = [...routes.uncertainty];
    const routeDetails: LongHaulShareResult['routeDetails'] = [];
    let unknownCount = 0;

    for (const route of routes.routes) {
      if (
        originLat !== null &&
        originLon !== null &&
        route.lat !== null &&
        route.lon !== null
      ) {
        const distKm = Math.round(
          this.airports.haversineKm(originLat, originLon, route.lat, route.lon),
        );
        routeDetails.push({
          destination: route.iata,
          distanceKm: distKm,
          isLongHaul: distKm >= LONG_HAUL_THRESHOLD_KM,
        });
      } else {
        unknownCount++;
        routeDetails.push({
          destination: route.iata,
          distanceKm: null,
          isLongHaul: true,
          note: 'Coordinates unavailable; assumed international long-haul',
        });
      }
    }

    if (unknownCount > 0) {
      uncertainty.push(
        `${unknownCount} destination(s) missing coordinates — assumed international (long-haul, ≥ ${LONG_HAUL_THRESHOLD_KM} km).`,
      );
    }

    const totalRoutes = routeDetails.length;
    const longHaulRoutes = routeDetails.filter((r) => r.isLongHaul).length;
    const longHaulSharePct =
      totalRoutes > 0
        ? Math.round((longHaulRoutes / totalRoutes) * 1000) / 10
        : 0;

    return {
      iata: code,
      totalRoutes,
      longHaulRoutes,
      longHaulSharePct,
      longHaulThresholdKm: LONG_HAUL_THRESHOLD_KM,
      routeDetails,
      uncertainty,
      sources: [routes.source],
    };
  }

  estimateUnmetDemand(iata: string): UnmetDemandResult {
    const code = iata.trim().toUpperCase();
    const { data: demand } = this.faa.getDemandSnapshot(code);
    const { data: capacity } = this.airports.getRunwayCapacityProxy(code);

    const uncertainty: string[] = [];
    if (demand.uncertainty) uncertainty.push(demand.uncertainty);
    uncertainty.push(
      'Unmet demand is a proxy metric, not an official FAA capacity determination.',
    );

    const growthSignal =
      (demand.operationsGrowthPct + demand.enplanementGrowthPct) / 2;
    const growthScore = this.clamp(
      this.normalizeToScore(growthSignal, GROWTH_MIN, GROWTH_MAX),
      0,
      100,
    );

    const activeRunways = Math.max(capacity.activeRunwayCount, 1);
    const opsPerRunway =
      demand.currentOperations > 0
        ? Math.round(demand.currentOperations / activeRunways)
        : 0;
    const pressureScore = this.clamp(
      this.normalizeToScore(opsPerRunway, 30_000, 200_000),
      0,
      100,
    );

    const congestionSignal = Math.round(
      0.5 * pressureScore +
        0.5 *
          this.clamp(
            this.normalizeToScore(
              demand.currentOperations,
              TRAFFIC_VOLUME_MIN,
              TRAFFIC_VOLUME_MAX,
            ),
            0,
            100,
          ),
    );

    const proxyScore = Math.round(
      0.5 * growthScore + 0.3 * pressureScore + 0.2 * congestionSignal,
    );

    return {
      iata: code,
      proxyScore,
      demandGrowthSignal: Math.round(growthSignal * 10) / 10,
      congestionSignal,
      capacityConstraint: capacity.capacityCategory,
      interpretation: this.interpretUnmetDemand(
        proxyScore,
        growthSignal,
        capacity.capacityCategory,
      ),
      uncertainty,
      sources: [
        'FAA TAF local XLSX dataset',
        'OurAirports CSV (static snapshot)',
      ],
    };
  }

  private async computeScore(iata: string): Promise<AirportScore> {
    const airportResult = this.airports.getAirportByIata(iata);
    const name = airportResult.data?.name ?? iata;

    const faaOps = this.faa.getOperationsForecast(iata);
    const faaDemand = this.faa.getDemandSnapshot(iata);
    const { data: capacity } = this.airports.getRunwayCapacityProxy(iata);

    const [flights, routes] = await Promise.all([
      this.aeroDataBox.getFlightsByDeparture(iata),
      this.aeroDataBox.getRoutesByDeparture(iata),
    ]);

    // Pre-compute ops-per-runway pressure — shared by congestion and unmet demand
    const airCarrierItinerant = faaOps.data.current?.airCarrierItinerant ?? 0;
    const activeRunways = Math.max(capacity.activeRunwayCount, 1);
    const opsPerRunway =
      airCarrierItinerant > 0
        ? Math.round(airCarrierItinerant / activeRunways)
        : 0;
    const pressureScore = this.clamp(
      this.normalizeToScore(
        opsPerRunway,
        OPS_PER_RUNWAY_MIN,
        OPS_PER_RUNWAY_MAX,
      ),
      0,
      100,
    );

    const congestion = this.scoreCongestion(
      capacity,
      airCarrierItinerant,
      pressureScore,
      flights,
    );

    const activity = this.scoreActivity(faaDemand.data);

    const longHaul = this.scoreLongHaulFromRoutes(iata, routes);

    const unmetDemand = this.scoreUnmetDemand(
      faaDemand.data,
      pressureScore,
      congestion.score,
    );

    const totalScore = Math.round(
      congestion.weightedScore +
        activity.weightedScore +
        longHaul.weightedScore +
        unmetDemand.weightedScore,
    );

    const uncertaintySet = new Set<string>([
      ...congestion.uncertainty,
      ...activity.uncertainty,
      ...longHaul.uncertainty,
      ...unmetDemand.uncertainty,
      ...(faaDemand.data.uncertainty ? [faaDemand.data.uncertainty] : []),
      ...flights.uncertainty,
      ...routes.uncertainty,
    ]);

    const sources = [
      'OurAirports CSV (static snapshot)',
      'FAA TAF local XLSX dataset',
      flights.source as string,
      routes.source as string,
    ];

    return {
      iata,
      name,
      totalScore,
      grade: this.toGrade(totalScore),
      breakdown: { congestion, activity, longHaul, unmetDemand },
      keyDrivers: this.deriveKeyDrivers({
        congestion,
        activity,
        longHaul,
        unmetDemand,
      }),
      assumptions: this.collectAssumptions(
        congestion,
        activity,
        longHaul,
        unmetDemand,
      ),
      uncertainty: [...uncertaintySet],
      sources: [...new Set(sources)],
      calculatedAt: new Date().toISOString(),
      fromCache: false,
    };
  }

  /**
   * Congestion Pressure (35%)
   *
   * Measures how strained an airport is relative to its runway infrastructure.
   * Uses ops-per-runway as the primary signal — this correctly identifies airports
   * where demand is high relative to physical capacity, regardless of absolute size.
   *
   * Sub-scores:
   *  - Ops-per-runway pressure (50%): airCarrierItinerant ÷ activeRunways
   *      normalised [10k/runway → 0, 100k/runway → 100]
   *  - Absolute traffic volume (30%): airCarrierItinerant
   *      normalised [20k/yr → 0, 400k/yr → 100]
   *  - Delay/cancellation signal (20%): (delayed + cancelled) / total × 500, clamped 0–100
   *      (20% combined rate → 100; defaults to 0 when live data unavailable)
   */
  private scoreCongestion(
    capacity: RunwayCapacityProxy,
    airCarrierItinerant: number,
    pressureScore: number,
    flights: NormalizedFlightsResult,
  ): ComponentScore {
    const drivers: string[] = [];
    const assumptions: string[] = [];
    const uncertainty: string[] = [];

    // Sub-score 1: ops-per-runway pressure (capacity utilisation ratio)
    const activeRunways = Math.max(capacity.activeRunwayCount, 1);
    const opsPerRunway =
      airCarrierItinerant > 0
        ? Math.round(airCarrierItinerant / activeRunways)
        : 0;
    drivers.push(
      `Ops-per-runway: ${opsPerRunway.toLocaleString()}/yr (${airCarrierItinerant.toLocaleString()} ops ÷ ${activeRunways} active runways)`,
    );
    if (airCarrierItinerant === 0) {
      assumptions.push(
        'No FAA air carrier ops data — pressure sub-score defaulted to 0.',
      );
      uncertainty.push(
        'FAA operations data unavailable; congestion score may be understated.',
      );
    }

    // Sub-score 2: absolute traffic volume
    const volumeScore = this.clamp(
      this.normalizeToScore(
        airCarrierItinerant,
        TRAFFIC_VOLUME_MIN,
        TRAFFIC_VOLUME_MAX,
      ),
      0,
      100,
    );
    if (airCarrierItinerant > 0) {
      drivers.push(
        `Air carrier itinerant ops: ${airCarrierItinerant.toLocaleString()}/year`,
      );
    }

    // Sub-score 3: delay/cancellation signal
    let delayScore = 0;
    if (flights.delayedFlights !== null && flights.totalFlights > 0) {
      const ratio =
        (flights.delayedFlights + flights.cancelledFlights) /
        flights.totalFlights;
      delayScore = this.clamp(ratio * 500, 0, 100); // 20% combined rate → 100
      drivers.push(
        `Delay/cancellation rate: ${Math.round(ratio * 100)}% (source: ${flights.source})`,
      );
    } else {
      assumptions.push('No live delay data — delay sub-score defaulted to 0.');
      uncertainty.push(
        'Delay signal unavailable; congestion score may be understated for busy airports.',
      );
    }

    const score = Math.round(
      0.5 * pressureScore + 0.3 * volumeScore + 0.2 * delayScore,
    );

    return {
      score,
      weight: WEIGHTS.congestion,
      weightedScore: Math.round(score * WEIGHTS.congestion * 10) / 10,
      keyDrivers: drivers,
      assumptions,
      uncertainty,
    };
  }

  /**
   * Activity Demand (25%)
   *
   * Measures current traffic scale and FAA-forecast growth trajectory.
   *
   * Sub-scores:
   *  - Current enplanement level (50%): normalised [0 → 0, 15M/yr → 100]
   *  - Enplanement growth forecast (25%): FAA TAF %, normalised [−5% → 0, 25% → 100]
   *  - Operations growth forecast (25%): FAA TAF %, normalised [−5% → 0, 25% → 100]
   *
   * Growth range tightened from the old −10/+40 to −5/+25 to reflect realistic
   * FAA TAF scenario-1 projections; the wider range was compressing scores
   * for all airports into a narrow 40–60 band.
   */
  private scoreActivity(demand: FaaDemandSnapshot): ComponentScore {
    const drivers: string[] = [];
    const assumptions: string[] = [];
    const uncertainty: string[] = [];

    const enpLevelScore = this.clamp(
      this.normalizeToScore(demand.currentEnplanements, 0, 15_000_000),
      0,
      100,
    );
    if (demand.currentEnplanements > 0) {
      drivers.push(
        `Current enplanements: ${demand.currentEnplanements.toLocaleString()}/year`,
      );
    } else {
      assumptions.push(
        'No FAA enplanements data — level sub-score defaulted to 0.',
      );
      uncertainty.push('FAA enplanements data unavailable.');
    }

    const enpGrowthScore = this.clamp(
      this.normalizeToScore(
        demand.enplanementGrowthPct,
        GROWTH_MIN,
        GROWTH_MAX,
      ),
      0,
      100,
    );
    drivers.push(
      `Enplanement growth forecast: ${demand.enplanementGrowthPct}% (to ${demand.forecastYear})`,
    );

    const opsGrowthScore = this.clamp(
      this.normalizeToScore(demand.operationsGrowthPct, GROWTH_MIN, GROWTH_MAX),
      0,
      100,
    );
    drivers.push(
      `Operations growth forecast: ${demand.operationsGrowthPct}% (to ${demand.forecastYear})`,
    );

    assumptions.push(
      `Growth forecasts are FAA TAF scenario-1 projections to ${demand.forecastYear}. Actual growth may differ.`,
    );
    if (demand.uncertainty) uncertainty.push(demand.uncertainty);

    const score = Math.round(
      0.5 * enpLevelScore + 0.25 * enpGrowthScore + 0.25 * opsGrowthScore,
    );

    return {
      score,
      weight: WEIGHTS.activity,
      weightedScore: Math.round(score * WEIGHTS.activity * 10) / 10,
      keyDrivers: drivers,
      assumptions,
      uncertainty,
    };
  }

  /**
   * Long-Haul Opportunity (20%)
   *
   * Long-haul share = routes where great-circle distance ≥ 3,000 km.
   * Destinations without coordinates are assumed international = long-haul.
   *
   * Score: normalised [0% → 0, ≥30% → 100].
   * Ceiling lowered from the old 50% to 30% — few US airports reach 50% international
   * share, so the old formula was systematically underscoring even the most
   * international hubs (JFK ~40% was only scoring 80).
   */
  private scoreLongHaulFromRoutes(
    iata: string,
    routes: NormalizedRoutesResult,
  ): ComponentScore {
    const drivers: string[] = [];
    const assumptions: string[] = [];
    const uncertainty: string[] = [...routes.uncertainty];

    const totalRoutes = routes.routes.length;

    if (totalRoutes === 0) {
      uncertainty.push(
        'No route data available — long-haul score defaulted to 0.',
      );
      return {
        score: 0,
        weight: WEIGHTS.longHaul,
        weightedScore: 0,
        keyDrivers: ['No route data available'],
        assumptions,
        uncertainty,
      };
    }

    const originAirport = this.airports.getAirportByIata(iata);
    const originLat = originAirport.data?.latitude ?? null;
    const originLon = originAirport.data?.longitude ?? null;

    let longHaulCount = 0;
    let unknownCount = 0;

    for (const route of routes.routes) {
      if (
        originLat !== null &&
        originLon !== null &&
        route.lat !== null &&
        route.lon !== null
      ) {
        const distKm = this.airports.haversineKm(
          originLat,
          originLon,
          route.lat,
          route.lon,
        );
        if (distKm >= LONG_HAUL_THRESHOLD_KM) longHaulCount++;
      } else {
        unknownCount++;
        longHaulCount++; // coordinates unavailable → assume international → long-haul
      }
    }

    if (unknownCount > 0) {
      assumptions.push(
        `${unknownCount} destination(s) missing coordinates — assumed international (long-haul, ≥ ${LONG_HAUL_THRESHOLD_KM} km).`,
      );
    }

    const longHaulSharePct = (longHaulCount / totalRoutes) * 100;
    const score = Math.round(
      this.clamp(
        this.normalizeToScore(longHaulSharePct, 0, LONG_HAUL_FULL_MARKS_PCT),
        0,
        100,
      ),
    ); // ≥30% share → 100

    drivers.push(
      `Long-haul routes: ${longHaulCount}/${totalRoutes} (${Math.round(longHaulSharePct)}%)`,
    );
    drivers.push(`Route data source: ${routes.source}`);
    assumptions.push(
      `Long-haul threshold: ${LONG_HAUL_THRESHOLD_KM} km great-circle distance.`,
    );

    return {
      score,
      weight: WEIGHTS.longHaul,
      weightedScore: Math.round(score * WEIGHTS.longHaul * 10) / 10,
      keyDrivers: drivers,
      assumptions,
      uncertainty,
    };
  }

  /**
   * Unmet Demand Proxy (20%)
   *
   * Answers: is demand growing faster than the airport can absorb?
   * Combines growth trajectory with current operational strain.
   *
   * Sub-scores:
   *  - Growth trajectory (50%): avg of ops + enplanement forecast growth
   *      normalised [−5% → 0, 25% → 100]  (same range as Activity for consistency)
   *  - Ops-per-runway pressure (30%): same pressureScore computed in computeScore
   *      — captures current strain independently of absolute size
   *  - Overall congestion score (20%): incorporates delay signal into the proxy
   *
   * Old formula used a binary capacity bucket (low/medium/high runway count) which
   * gave all large airports a fixed 15/100 penalty regardless of how strained they were.
   */
  private scoreUnmetDemand(
    demand: FaaDemandSnapshot,
    pressureScore: number,
    congestionScore: number,
  ): ComponentScore {
    const drivers: string[] = [];
    const assumptions: string[] = [];
    const uncertainty: string[] = [];

    const growthSignal =
      (demand.operationsGrowthPct + demand.enplanementGrowthPct) / 2;
    const growthScore = this.clamp(
      this.normalizeToScore(growthSignal, GROWTH_MIN, GROWTH_MAX),
      0,
      100,
    );

    const score = Math.round(
      0.5 * growthScore + 0.3 * pressureScore + 0.2 * congestionScore,
    );

    drivers.push(
      `Avg demand growth signal: ${Math.round(growthSignal * 10) / 10}% (ops + enplanements avg)`,
    );
    drivers.push(`Ops-per-runway pressure: ${Math.round(pressureScore)}/100`);
    drivers.push(`Congestion score contribution: ${congestionScore}/100`);

    assumptions.push(
      'Unmet demand is a composite proxy, not an official FAA determination.',
    );
    assumptions.push(
      'Formula: 50% growth trajectory + 30% ops-per-runway pressure + 20% congestion score.',
    );

    if (demand.uncertainty) uncertainty.push(demand.uncertainty);

    return {
      score,
      weight: WEIGHTS.unmetDemand,
      weightedScore: Math.round(score * WEIGHTS.unmetDemand * 10) / 10,
      keyDrivers: drivers,
      assumptions,
      uncertainty,
    };
  }

  private async getScoreFromCache(iata: string): Promise<AirportScore | null> {
    const row = await this.prisma.client.airportScoreSnapshot.findFirst({
      where: { iata, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!row) return null;

    try {
      return { ...(row.scoreJson as unknown as AirportScore), fromCache: true };
    } catch {
      return null;
    }
  }

  private async saveScoreToCache(
    iata: string,
    score: AirportScore,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + SCORE_TTL_MINUTES * 60 * 1000);
    // Delete all existing rows for this airport before inserting the fresh one
    // so the table does not accumulate stale snapshots indefinitely.
    await this.prisma.client.airportScoreSnapshot.deleteMany({
      where: { iata },
    });
    await this.prisma.client.airportScoreSnapshot.create({
      data: {
        iata,
        scoreJson: score as never,
        sourcesJson: score.sources as never,
        uncertaintyJson: score.uncertainty as never,
        expiresAt,
      },
    });
    this.logger.debug(
      `Score snapshot saved for ${iata} (expires ${expiresAt.toISOString()})`,
    );
  }

  /** Linear interpolation: `low` → 0, `high` → 100. */
  private normalizeToScore(value: number, low: number, high: number): number {
    if (high <= low) return 0;
    return ((value - low) / (high - low)) * 100;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private toGrade(score: number): ScoreGrade {
    if (score >= 80) return 'A';
    if (score >= 65) return 'B';
    if (score >= 50) return 'C';
    if (score >= 35) return 'D';
    return 'F';
  }

  /** Surface the top key driver from each component, ordered by weighted score descending. */
  private deriveKeyDrivers(breakdown: ScoreBreakdown): string[] {
    const entries: [string, ComponentScore][] = [
      ['Congestion Pressure', breakdown.congestion],
      ['Activity Demand', breakdown.activity],
      ['Long-Haul Opportunity', breakdown.longHaul],
      ['Unmet Demand Proxy', breakdown.unmetDemand],
    ];
    return entries
      .sort((a, b) => b[1].weightedScore - a[1].weightedScore)
      .map(([label, comp]) => `[${label}] ${comp.keyDrivers[0] ?? label}`);
  }

  private collectAssumptions(...components: ComponentScore[]): string[] {
    return [...new Set(components.flatMap((c) => c.assumptions))];
  }

  private interpretUnmetDemand(
    proxyScore: number,
    growthSignal: number,
    capacityCategory: 'high' | 'medium' | 'low',
  ): string {
    const g = Math.round(growthSignal * 10) / 10;
    if (proxyScore >= 70) {
      return (
        `High unmet demand signal: strong growth trajectory (${g}% avg) combined with ` +
        `${capacityCategory} runway capacity suggests significant investment potential.`
      );
    }
    if (proxyScore >= 45) {
      return (
        `Moderate unmet demand signal: ${g}% avg growth with ${capacityCategory} runway ` +
        `capacity — some capacity pressure present.`
      );
    }
    return (
      `Low unmet demand signal: limited growth (${g}% avg) with ${capacityCategory} runway ` +
      `capacity — existing infrastructure appears adequate.`
    );
  }
}
