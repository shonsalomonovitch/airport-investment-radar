# Score Methodology

---

## Worked Example — BOS (Boston Logan International Airport)

This walks through every step of a real score computation for BOS using representative FAA TAF + OurAirports + AeroDataBox values.

### Raw input data

These are the values pulled from each data source before any formula runs:

| Data point | Value | Source |
|---|---|---|
| Active runways | 6 | OurAirports `runways.csv` (filtered `closed=0`) — 04L/22R, 04R/22L, 9/27, 14/32, 15L/33R, 15R/33L |
| `airCarrierItinerant` (ops/yr) | 288,000 | FAA `AirportsOperations.xlsx` col `itn_Ac`, scenario=0 |
| `currentEnplanements` (passengers/yr) | 17,200,000 | FAA `Enplanements.xlsx` col `aac`, scenario=0 |
| `forecastOperations` (to 2030) | 311,040 | FAA `AirportsOperations.xlsx`, scenario=1 |
| `forecastEnplanements` (to 2030) | 18,232,000 | FAA `Enplanements.xlsx`, scenario=1 |
| Total departures in window (06:00–18:00 UTC) | 240 | AeroDataBox live API |
| Delayed departures | 43 | AeroDataBox — `revisedTime > scheduledTime` |
| Cancelled departures | 13 | AeroDataBox — `status` starts with "cancel" |
| Total routes (daily) | 78 | AeroDataBox `/stats/routes/daily` |
| Long-haul routes (≥ 3,000 km) | 14 | Haversine computed per destination |

---

### Step 1 — Shared pre-computation: `pressureScore`

Computed once in `computeScore()`, reused by Congestion and Unmet Demand.

```
opsPerRunway = airCarrierItinerant ÷ activeRunways
             = 288,000 ÷ 6
             = 48,000

pressureScore = normalize(48,000, low=10,000, high=100,000)
              = (48,000 − 10,000) / (100,000 − 10,000) × 100
              = 38,000 / 90,000 × 100
              = 42.2  →  clamp → 42
```

---

### Step 2 — Component 1: Congestion Pressure (35%)

**Sub-score 1: Ops-per-Runway Pressure (50%)**
```
pressureScore = 42  (from Step 1)
```

**Sub-score 2: Absolute Traffic Volume (30%)**
```
volumeScore = normalize(288,000, low=20,000, high=400,000)
            = (288,000 − 20,000) / (400,000 − 20,000) × 100
            = 268,000 / 380,000 × 100
            = 70.5  →  clamp → 71
```

**Sub-score 3: Delay/Cancellation Rate (20%)**
```
ratio = (delayedFlights + cancelledFlights) / totalFlights
      = (43 + 13) / 240
      = 56 / 240
      = 0.233  (23.3% combined disruption rate)

delayScore = clamp(0.233 × 500, 0, 100)
           = clamp(116.7, 0, 100)
           = 100
```
> 23.3% disruption rate exceeds the 20% ceiling → capped at 100. BOS is known for weather-driven delays.

**Congestion final:**
```
congestionScore = round(0.50 × 42 + 0.30 × 71 + 0.20 × 100)
                = round(21.0 + 21.3 + 20.0)
                = round(62.3)
                = 62

weightedScore = 62 × 0.35 = 21.7
```

---

### Step 3 — Component 2: Activity Demand (25%)

**Growth % calculation (done in `faa-data.service.ts → getDemandSnapshot`):**
```
opsGrowthPct = (forecastOps − currentOps) / currentOps × 100
             = (311,040 − 288,000) / 288,000 × 100
             = 23,040 / 288,000 × 100
             = 8.0%

enpGrowthPct = (forecastEnp − currentEnp) / currentEnp × 100
             = (18,232,000 − 17,200,000) / 17,200,000 × 100
             = 1,032,000 / 17,200,000 × 100
             = 6.0%
```

**Sub-score 1: Current Enplanement Level (50%)**
```
enpLevelScore = normalize(17,200,000, low=0, high=15,000,000)
              = 17,200,000 / 15,000,000 × 100
              = 114.7  →  clamp → 100
```
> BOS exceeds the 15M ceiling — it gets full marks on current scale.

**Sub-score 2: Enplanement Growth Forecast (25%)**
```
enpGrowthScore = normalize(6.0%, low=−5, high=25)
               = (6.0 − (−5)) / (25 − (−5)) × 100
               = 11 / 30 × 100
               = 36.7  →  clamp → 37
```

**Sub-score 3: Operations Growth Forecast (25%)**
```
opsGrowthScore = normalize(8.0%, low=−5, high=25)
               = (8.0 − (−5)) / 30 × 100
               = 13 / 30 × 100
               = 43.3  →  clamp → 43
```

**Activity final:**
```
activityScore = round(0.50 × 100 + 0.25 × 37 + 0.25 × 43)
              = round(50.0 + 9.25 + 10.75)
              = round(70.0)
              = 70

weightedScore = 70 × 0.25 = 17.5
```

---

### Step 4 — Component 3: Long-Haul Opportunity (20%)

**Route classification (Haversine per destination):**

BOS's 14 long-haul routes (≥ 3,000 km great-circle) include destinations like:
London (LHR) ~5,265 km · Paris (CDG) ~5,513 km · Dublin (DUB) ~5,099 km ·
Amsterdam (AMS) ~5,564 km · Frankfurt (FRA) ~6,215 km · Reykjavik (KEF) ~4,178 km ·
Madrid (MAD) ~5,769 km · Rome (FCO) ~7,046 km · Doha (DOH) ~10,611 km ·
Tokyo (NRT) ~10,838 km · Cancun (CUN) ~3,017 km · Mexico City (MEX) ~3,743 km · + 2 more

```
longHaulSharePct = longHaulRoutes / totalRoutes × 100
                 = 14 / 78 × 100
                 = 17.9%

longHaulScore = normalize(17.9%, low=0, high=30%)
              = (17.9 − 0) / (30 − 0) × 100
              = 17.9 / 30 × 100
              = 59.7  →  clamp → 60

weightedScore = 60 × 0.20 = 12.0
```

---

### Step 5 — Component 4: Unmet Demand Proxy (20%)

**Sub-score 1: Growth Trajectory (50%)**
```
growthSignal = (opsGrowthPct + enpGrowthPct) / 2
             = (8.0 + 6.0) / 2
             = 7.0%

growthScore = normalize(7.0%, low=−5, high=25)
            = (7.0 − (−5)) / 30 × 100
            = 12 / 30 × 100
            = 40.0  →  clamp → 40
```

**Sub-score 2: Ops-per-Runway Pressure (30%)**
```
pressureScore = 42  (same value from Step 1 — reused, not recomputed)
```

**Sub-score 3: Full Congestion Score (20%)**
```
congestionScore = 62  (from Step 2 — passed in directly)
```

**Unmet Demand final:**
```
unmetDemandScore = round(0.50 × 40 + 0.30 × 42 + 0.20 × 62)
                 = round(20.0 + 12.6 + 12.4)
                 = round(45.0)
                 = 45

weightedScore = 45 × 0.20 = 9.0
```

---

### Step 6 — Total score + grade

```
totalScore = round(
    congestion.weightedScore   +  // 21.7
    activity.weightedScore     +  // 17.5
    longHaul.weightedScore     +  // 12.0
    unmetDemand.weightedScore     //  9.0
)
           = round(60.2)
           = 60
```

```
toGrade(60):
  60 >= 80? No
  60 >= 65? No
  60 >= 50? Yes → Grade C
```

### Final result

```
BOS — Boston Logan International Airport
Score:  60 / 100
Grade:  C  (Moderate — may warrant targeted investment but not a flagship expansion play)
```

| Component | Score | Weight | Weighted | Top driver |
|---|---|---|---|---|
| Congestion Pressure | 62 | 35% | 21.7 | 23.3% delay rate pulls it up; 48,000 ops/runway is moderate |
| Activity Demand | 70 | 25% | 17.5 | 17.2M enplanements (capped at 100), 8% ops growth |
| Long-Haul Opportunity | 60 | 20% | 12.0 | 14/78 routes ≥ 3,000 km (17.9% share) |
| Unmet Demand Proxy | 45 | 20% | 9.0 | 7% avg growth, but 6 runways absorb pressure well |
| **TOTAL** | | | **60** | |

### Why BOS scores C and not B or A

The 6 active runways are the key reason BOS doesn't score higher:
- **6 runways spread the ops load:** 288,000 ops ÷ 6 = 48,000 ops/runway. That's moderate pressure — not a strained airport. An airport with 2 runways doing the same total ops would score far higher on congestion.
- **Delay rate saves congestion (delayScore = 100):** Without the 23.3% disruption rate, congestion would score even lower. Delays are BOS's clearest infrastructure pain signal.
- **Unmet demand (45/100) is low:** With 6 runways and moderate FAA growth forecasts, the model says existing capacity can absorb near-term demand — there's no urgency signal.
- **The real investment story for BOS:** Not runway expansion (it has plenty), but terminal modernisation and ground operations — driven by high passenger volumes (17.2M) hitting aging facilities.

---

Every airport gets a **0–100 investment score** built from 4 components, combined into a weighted total, then letter-graded.

```
Total Score = 0.35 × Congestion + 0.25 × Activity + 0.20 × Long-Haul + 0.20 × Unmet Demand
```

Grades: **A** (≥80) · **B** (≥65) · **C** (≥50) · **D** (≥35) · **F** (<35)

---

## Service map — who does what

| Service | File | Role in scoring |
|---|---|---|
| `FaaDataService` | `faa-data.service.ts` | Loads FAA Excel files at startup. Provides ops history, ops forecast, enplanement history, enplanement forecast. |
| `AirportsService` | `airports.service.ts` | Loads OurAirports CSV at startup. Provides runway counts, coordinates, region lists. Computes Haversine distances. |
| `AeroDataBoxService` | `aerodatabox.service.ts` | Calls live AeroDataBox API. Provides flight delay/cancellation counts and daily route list with destination coordinates. |
| `ApiCacheService` | `api-cache.service.ts` | Reads/writes AeroDataBox responses to the `ApiCache` Postgres table with TTL. Prevents redundant API calls. |
| `ScoringService` | `scoring.service.ts` | Orchestrates all the above. Runs all 4 component formulas. Reads/writes score snapshots to `AirportScoreSnapshot` table. |
| `ToolsService` | `tools.service.ts` | Entry point from the AI agent. Validates input with Zod, calls ScoringService, logs every tool call to `ToolCall` table. |

---

## Step 0 — How a score request enters the system

When the AI agent decides to score an airport, it calls a tool. `ToolsService` is the gatekeeper:

```ts
// tools.service.ts → run()
async run(toolName: string, rawInput: unknown, conversationId?: number): Promise<ToolResult<unknown>> {
  const start = Date.now();
  let result: ToolResult<unknown>;

  switch (toolName) {
    case 'analyze_airport':
      result = await this.analyzeAirport(rawInput);
      break;
    case 'compare_airports':
      result = await this.compareAirports(rawInput);
      break;
    case 'rank_airports_by_region':
      result = await this.rankAirportsByRegion(rawInput);
      break;
    case 'calculate_long_haul_share':
      result = await this.calculateLongHaulShare(rawInput);
      break;
    case 'estimate_unmet_demand':
      result = this.estimateUnmetDemand(rawInput);
      break;
  }

  const durationMs = Date.now() - start;
  await this.logToolCall(toolName, rawInput, result, durationMs, conversationId);
  return result;
}
```

Every tool call — input, output, and duration — is logged to the `ToolCall` Postgres table:

```ts
// tools.service.ts → logToolCall()
await this.prisma.client.toolCall.create({
  data: { toolName, inputJson, resultJson, durationMs, conversationId },
});
```

---

## Step 1 — Input validation (Zod)

Before touching any scoring logic, `ToolsService` validates the AI's input:

```ts
// tools.service.ts
const IataParam = z.string().min(2).max(5).transform((s) => s.trim().toUpperCase());
const AirportParamSchema = z.object({ airport: IataParam });

async analyzeAirport(rawInput: unknown): Promise<ToolResult<AnalyzeAirportData>> {
  const parsed = AirportParamSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { success: false, errorCode: 'INVALID_INPUT', userSafeMessage: this.zodError(parsed.error) };
  }
  const iata = parsed.data.airport; // e.g. "bos" → "BOS"

  const profileResult = this.airports.getAirportProfile(iata);
  if (!profileResult.data) {
    return { success: false, errorCode: 'AIRPORT_NOT_FOUND', userSafeMessage: `Airport "${iata}" was not found.` };
  }

  const score = await this.scoring.calculateAirportScore(iata);
  return { success: true, data: { score, profile: profileResult.data } };
}
```

---

## Step 2 — Score cache check

`ScoringService.calculateAirportScore()` is the main public entry point. Before computing anything, it checks the Postgres cache:

```ts
// scoring.service.ts → calculateAirportScore()
async calculateAirportScore(iata: string): Promise<AirportScore> {
  const code = iata.trim().toUpperCase();

  const cached = await this.getScoreFromCache(code);
  if (cached) return cached; // skip all computation — return DB snapshot

  const score = await this.computeScore(code);
  await this.saveScoreToCache(code, score);
  return score;
}
```

Cache read — finds a non-expired row for this airport:

```ts
// scoring.service.ts → getScoreFromCache()
const row = await this.prisma.client.airportScoreSnapshot.findFirst({
  where: { iata, expiresAt: { gt: new Date() } },
  orderBy: { createdAt: 'desc' },
});
if (!row) return null;
return { ...(row.scoreJson as AirportScore), fromCache: true };
```

Cache write — deletes any old rows, inserts fresh snapshot with 24h TTL:

```ts
// scoring.service.ts → saveScoreToCache()
const expiresAt = new Date(Date.now() + SCORE_TTL_MINUTES * 60 * 1000); // SCORE_TTL_MINUTES = 1440
await this.prisma.client.airportScoreSnapshot.deleteMany({ where: { iata } });
await this.prisma.client.airportScoreSnapshot.create({
  data: { iata, scoreJson: score, sourcesJson: score.sources, uncertaintyJson: score.uncertainty, expiresAt },
});
```

---

## Step 3 — Data collection (`computeScore`)

If no cache hit, `computeScore()` fires all data fetches — static data synchronously (already in memory), live API calls in parallel:

```ts
// scoring.service.ts → computeScore()
private async computeScore(iata: string): Promise<AirportScore> {
  // Static — already in memory from startup:
  const faaOps    = this.faa.getOperationsForecast(iata);   // FAA ops history + forecast
  const faaDemand = this.faa.getDemandSnapshot(iata);       // FAA enplanements + ops combined
  const { data: capacity } = this.airports.getRunwayCapacityProxy(iata); // runway count + category

  // Live — hits AeroDataBox (or Postgres cache):
  const [flights, routes] = await Promise.all([
    this.aeroDataBox.getFlightsByDeparture(iata),   // delay/cancellation data
    this.aeroDataBox.getRoutesByDeparture(iata),    // route list with coordinates
  ]);
  // ...
}
```

The two live API calls run in parallel via `Promise.all` to minimize latency.

---

## Step 4 — Shared pre-computation (ops-per-runway pressure)

Before running any component formula, `computeScore()` calculates `pressureScore` once. It is reused by both Congestion and Unmet Demand to avoid inconsistency:

```ts
// scoring.service.ts → computeScore()
const airCarrierItinerant = faaOps.data.current?.airCarrierItinerant ?? 0;
const activeRunways = Math.max(capacity.activeRunwayCount, 1); // never divide by 0
const opsPerRunway = airCarrierItinerant > 0
  ? Math.round(airCarrierItinerant / activeRunways)
  : 0;

const pressureScore = this.clamp(
  this.normalizeToScore(opsPerRunway, 10_000, 100_000),
  0, 100,
);
```

Normalization constants (defined at top of file):
```ts
const OPS_PER_RUNWAY_MIN = 10_000;  // very relaxed → score 0
const OPS_PER_RUNWAY_MAX = 100_000; // extremely strained → score 100
```

---

## Step 5 — How raw data is loaded

### FAA data — loaded at server startup by `FaaDataService`

Three Excel files parsed into memory Maps on `onModuleInit()`:

```ts
// faa-data.service.ts → onModuleInit()
onModuleInit() {
  this.loadAirports();      // → this.airports Map<locid, FaaAirportProfile>
  this.loadOperations();    // → this.operations Map<locid, { historical, forecast }>
  this.loadEnplanements();  // → this.enplanements Map<locid, { historical, forecast }>
}
```

**Operations loading** — each row is either historical (`scenario=0`) or forecast (`scenario=1`):

```ts
// faa-data.service.ts → loadOperations()
wb = XLSX.readFile(path.join(FAA_DIR, 'AirportsOperations.xlsx'));
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Sheet1']);

for (const row of rows) {
  const ops: FaaOperationsRow = {
    locid: this.normalizeId(row['locid']),
    scenario: Number(row['scenario']),
    year: Number(row['ayear']),
    airCarrierItinerant: Number(row['itn_Ac'] ?? 0), // ← used in congestion
    totalOperations: 0, // computed below
    // + airTaxiItinerant, generalAviationItinerant, militaryItinerant, etc.
  };
  ops.totalOperations =
    ops.airCarrierItinerant + ops.airTaxiItinerant +
    ops.generalAviationItinerant + ops.militaryItinerant +
    ops.localGa + ops.localMilitary;

  if (ops.scenario === 0) existing.historical.push(ops); // historical
  else existing.forecast.push(ops);                      // forecast
}
```

**Enplanements loading** — same pattern:

```ts
// faa-data.service.ts → loadEnplanements()
wb = XLSX.readFile(path.join(FAA_DIR, 'Enplanements.xlsx'));
const enp: FaaEnplanementsRow = {
  airCarrier: Number(row['aac'] ?? 0), // ← used in activity (current level)
  // + airTaxi, commuter, usFlag, foreignFlag
};
if (enp.scenario === 0) existing.historical.push(enp);
else existing.forecast.push(enp); // ← used for growth forecast
```

**Getting current + forecast rows:**

```ts
// faa-data.service.ts → getOperationsForecast()
// "current" = row for this year, or latest historical if this year not found
const current = record.historical.find((r) => r.year === CURRENT_YEAR)
  ?? record.historical.sort((a, b) => b.year - a.year)[0]
  ?? null;

// "forecast" = latest forecast year available
const forecast = record.forecast.sort((a, b) => b.year - a.year)[0] ?? null;
```

**Growth % calculation** (done in `getDemandSnapshot`):

```ts
// faa-data.service.ts → getDemandSnapshot()
const opsGrowthPct = currentOps > 0
  ? Math.round(((forecastOps - currentOps) / currentOps) * 1000) / 10
  : 0;
const enpGrowthPct = currentEnp > 0
  ? Math.round(((forecastEnp - currentEnp) / currentEnp) * 1000) / 10
  : 0;
```

---

### Airport/Runway data — loaded at server startup by `AirportsService`

Two CSV files parsed into memory Maps on `onModuleInit()`:

```ts
// airports.service.ts → onModuleInit()
onModuleInit() {
  this.loadAirports(); // → this.airportsByIata Map<iata, Airport>
  this.loadRunways();  // → this.runwaysByIcao Map<icao, Runway[]>
}
```

**Airport loading** — filters to US airports with an IATA code only:

```ts
// airports.service.ts → loadAirports()
raw = fs.readFileSync(path.join(CSV_DIR, 'airports.csv'), 'utf-8');
const rows = parse(raw, { columns: true });

for (const row of rows) {
  if (row['iso_country'] !== 'US') continue;
  if (!row['iata_code']) continue;

  const airport: Airport = {
    iataCode: row['iata_code'],
    latitude: parseFloat(row['latitude_deg']),   // ← used for Haversine
    longitude: parseFloat(row['longitude_deg']),  // ← used for Haversine
    isoRegion: row['iso_region'],                 // ← used for regional ranking
    scheduledService: row['scheduled_service'] === 'yes',
    // + ident, type, name, municipality, etc.
  };
  this.airportsByIata.set(airport.iataCode.toUpperCase(), airport);
}
```

**Runway loading** — only keeps runways for airports already in the map:

```ts
// airports.service.ts → loadRunways()
raw = fs.readFileSync(path.join(CSV_DIR, 'runways.csv'), 'utf-8');

for (const row of rows) {
  const ident = row['airport_ident']?.toUpperCase();
  if (!this.airportsByIcao.has(ident)) continue; // skip non-US

  const runway: Runway = {
    lengthFt: row['length_ft'] ? parseFloat(row['length_ft']) : null,
    closed: row['closed'] === '1', // ← active runway filter
    lighted: row['lighted'] === '1',
    surface: row['surface'],
  };
  existing.push(runway);
}
```

**Runway capacity proxy** — classifies airport into high/medium/low:

```ts
// airports.service.ts → getRunwayCapacityProxy()
const active = runways.filter((r) => !r.closed);           // ← active only
const activeRunwayCount = active.length;
const maxLengthFt = Math.max(...active.map((r) => r.lengthFt).filter(Boolean));

// airports.service.ts → classifyCapacity()
private classifyCapacity(activeRunways: number, maxLengthFt: number | null) {
  if (activeRunways >= 3 || maxLengthFt >= 8000) return 'high';
  if (activeRunways >= 2 || maxLengthFt >= 5000) return 'medium';
  return 'low';
}
```

---

### Live flight data — fetched by `AeroDataBoxService` with DB cache

**Cache check first** (via `ApiCacheService`):

```ts
// aerodatabox.service.ts → getFlightsByDeparture()
const cacheKey = `aerodatabox:flights:dep:${normalizedIata}`;
const cached = await this.apiCache.getFresh(cacheKey);
if (cached) return { ...(cached.responseJson as NormalizedFlightsResult), source: 'aerodatabox-cache' };
```

`getFresh` does a single DB query — only returns a row if `expiresAt > now`:

```ts
// api-cache.service.ts → getFresh()
const row = await this.prisma.client.apiCache.findFirst({
  where: { cacheKey, expiresAt: { gt: new Date() } },
});
```

**If no cache hit — call AeroDataBox:**

```ts
// aerodatabox.service.ts → fetchFlights()
// Window: 06:00–18:00 UTC (peak ops, max 12h per API limit)
const { from, to } = this.todayDateRange();
const response = await axios.get(
  `${BASE_URL}/flights/airports/iata/${iata}/${from}/${to}`,
  {
    params: { direction: 'Departure', withCancelled: true, withCodeshared: false, withCargo: false },
    headers: { 'x-rapidapi-key': this.apiKey },
    timeout: 10000,
  }
);

const flights = response.data?.departures ?? [];

// Delay detection: revised time is later than scheduled time
const isDelayed = (f) =>
  new Date(f.movement?.revisedTime?.utc) > new Date(f.movement?.scheduledTime?.utc);

// Cancellation detection: status string starts with "cancel"
const isCancelled = (f) => (f.status ?? '').toLowerCase().startsWith('cancel');

return {
  totalFlights: flights.length,
  delayedFlights: flights.filter(isDelayed).length,
  cancelledFlights: flights.filter(isCancelled).length,
  source: 'aerodatabox',
};
```

**Then write to cache** (TTL = 24h for flights, 7 days for routes):

```ts
// api-cache.service.ts → set()
await this.prisma.client.apiCache.upsert({
  where: { cacheKey },
  create: { provider, cacheKey, responseJson, fetchedAt: now, expiresAt },
  update: { responseJson, fetchedAt: now, expiresAt },
});
```

**If AeroDataBox fails** — return a static fallback so scoring can continue:

```ts
// aerodatabox.service.ts
const FALLBACK_FLIGHTS: NormalizedFlightsResult = {
  totalFlights: 0,
  delayedFlights: null,   // ← null triggers "no delay data" path in scoreCongestion
  cancelledFlights: 0,
  source: 'fallback',
  uncertainty: ['Live aviation data is unavailable.'],
};
```

---

### Live route data — fetched by `AeroDataBoxService`

```ts
// aerodatabox.service.ts → fetchRoutes()
const cacheKey = `aerodatabox:routes:dep:${normalizedIata}`;
// cache TTL = 7 days (routes change far less often than daily delays)

const response = await axios.get(
  `${BASE_URL}/airports/iata/${iata}/stats/routes/daily`,
  { headers: this.buildHeaders(), timeout: 10000 }
);

const routes: RouteEntry[] = rawRoutes
  .filter((r) => r.destination?.iata) // skip routes with no destination code
  .map((r) => ({
    iata: r.destination.iata.toUpperCase(),
    lat: r.destination?.location?.lat ?? null,  // ← used for Haversine
    lon: r.destination?.location?.lon ?? null,  // ← used for Haversine
    averageDailyFlights: r.averageDailyFlights ?? null,
  }));
```

---

## Component 1: Congestion Pressure (35%)

**In one sentence:** Is this airport running out of room — and is it showing up in delays?

**File:** `scoring.service.ts` → `scoreCongestion()`

```
Congestion = 0.50 × pressureScore + 0.30 × volumeScore + 0.20 × delayScore
```

### Sub-score 1: Ops-per-Runway Pressure (50%)

Data: `airCarrierItinerant` from FAA + `activeRunwayCount` from OurAirports.
Pre-computed in `computeScore()` and passed into `scoreCongestion()`.

```ts
// scoring.service.ts → scoreCongestion()
const opsPerRunway = airCarrierItinerant > 0
  ? Math.round(airCarrierItinerant / activeRunways)
  : 0;

// pressureScore already computed and passed in
drivers.push(`Ops-per-runway: ${opsPerRunway.toLocaleString()}/yr (${airCarrierItinerant.toLocaleString()} ops ÷ ${activeRunways} active runways)`);

if (airCarrierItinerant === 0) {
  assumptions.push('No FAA air carrier ops data — pressure sub-score defaulted to 0.');
  uncertainty.push('FAA operations data unavailable; congestion score may be understated.');
}
```

> 4-runway airport with 200k ops: 200k/4 = 50k → normalize(50k, 10k, 100k) = **56/100**
> 8-runway airport with 100k ops: 100k/8 = 12.5k → normalize(12.5k, 10k, 100k) = **3/100**

### Sub-score 2: Absolute Traffic Volume (30%)

Same `airCarrierItinerant` value, different normalization range:

```ts
// scoring.service.ts → scoreCongestion()
const volumeScore = this.clamp(
  this.normalizeToScore(airCarrierItinerant, 20_000, 400_000),
  0, 100,
);
if (airCarrierItinerant > 0) {
  drivers.push(`Air carrier itinerant ops: ${airCarrierItinerant.toLocaleString()}/year`);
}
```

### Sub-score 3: Delay/Cancellation Rate (20%)

Data: `delayedFlights`, `cancelledFlights`, `totalFlights` from AeroDataBox.

```ts
// scoring.service.ts → scoreCongestion()
let delayScore = 0;
if (flights.delayedFlights !== null && flights.totalFlights > 0) {
  const ratio = (flights.delayedFlights + flights.cancelledFlights) / flights.totalFlights;
  delayScore = this.clamp(ratio * 500, 0, 100); // 20% combined rate → 100
  drivers.push(`Delay/cancellation rate: ${Math.round(ratio * 100)}% (source: ${flights.source})`);
} else {
  // AeroDataBox unavailable or returned fallback
  assumptions.push('No live delay data — delay sub-score defaulted to 0.');
  uncertainty.push('Delay signal unavailable; congestion score may be understated for busy airports.');
}
```

### Final Congestion score:

```ts
// scoring.service.ts → scoreCongestion()
const score = Math.round(0.5 * pressureScore + 0.3 * volumeScore + 0.2 * delayScore);

return {
  score,
  weight: WEIGHTS.congestion,                             // 0.35
  weightedScore: Math.round(score * WEIGHTS.congestion * 10) / 10,
  keyDrivers: drivers,
  assumptions,
  uncertainty,
};
```

---

## Component 2: Activity Demand (25%)

**File:** `scoring.service.ts` → `scoreActivity()`

```
Activity = 0.50 × enpLevelScore + 0.25 × enpGrowthScore + 0.25 × opsGrowthScore
```

All data comes from `faa-data.service.ts` via `getDemandSnapshot()` — no API calls here.

### Sub-score 1: Current Enplanement Level (50%)

Data: `currentEnplanements` = `aac` column from `Enplanements.xlsx`, `scenario=0`, most recent year.
An "enplanement" = one passenger boarding one flight.

```ts
// scoring.service.ts → scoreActivity()
const enpLevelScore = this.clamp(
  this.normalizeToScore(demand.currentEnplanements, 0, 15_000_000),
  0, 100,
);
if (demand.currentEnplanements > 0) {
  drivers.push(`Current enplanements: ${demand.currentEnplanements.toLocaleString()}/year`);
} else {
  assumptions.push('No FAA enplanements data — level sub-score defaulted to 0.');
}
```

### Sub-score 2: Enplanement Growth Forecast (25%)

Data: same `Enplanements.xlsx` but `scenario=1`. Growth % computed in `faa-data.service.ts`:

```ts
// faa-data.service.ts → getDemandSnapshot()
const enpGrowthPct = currentEnp > 0
  ? Math.round(((forecastEnp - currentEnp) / currentEnp) * 1000) / 10
  : 0;
```

```ts
// scoring.service.ts → scoreActivity()
const enpGrowthScore = this.clamp(
  this.normalizeToScore(demand.enplanementGrowthPct, GROWTH_MIN, GROWTH_MAX), // -5 to +25
  0, 100,
);
drivers.push(`Enplanement growth forecast: ${demand.enplanementGrowthPct}% (to ${demand.forecastYear})`);
```

### Sub-score 3: Operations Growth Forecast (25%)

Data: `AirportsOperations.xlsx`, `scenario=1`. Growth % also from `getDemandSnapshot()`:

```ts
// faa-data.service.ts → getDemandSnapshot()
const opsGrowthPct = currentOps > 0
  ? Math.round(((forecastOps - currentOps) / currentOps) * 1000) / 10
  : 0;
```

```ts
// scoring.service.ts → scoreActivity()
const opsGrowthScore = this.clamp(
  this.normalizeToScore(demand.operationsGrowthPct, GROWTH_MIN, GROWTH_MAX), // -5 to +25
  0, 100,
);
drivers.push(`Operations growth forecast: ${demand.operationsGrowthPct}% (to ${demand.forecastYear})`);

assumptions.push(`Growth forecasts are FAA TAF scenario-1 projections to ${demand.forecastYear}. Actual growth may differ.`);
```

> Growth range is -5 to +25 (constants: `GROWTH_MIN = -5`, `GROWTH_MAX = 25`).
> The old range was -10/+40. Real FAA TAF projections cluster between -2% and +20%.
> The wider range was compressing all airports into a 40–60 score band.

### Final Activity score:

```ts
// scoring.service.ts → scoreActivity()
const score = Math.round(0.5 * enpLevelScore + 0.25 * enpGrowthScore + 0.25 * opsGrowthScore);

return {
  score,
  weight: WEIGHTS.activity,                          // 0.25
  weightedScore: Math.round(score * WEIGHTS.activity * 10) / 10,
  keyDrivers: drivers,
  assumptions,
  uncertainty,
};
```

---

## Component 3: Long-Haul Opportunity (20%)

**File:** `scoring.service.ts` → `scoreLongHaulFromRoutes()`

```
Long-Haul Score = normalize(longHaulSharePct, 0%, 30%)
```

### Data collection

Routes from AeroDataBox (cached 7 days). Origin coordinates from OurAirports (in memory).

```ts
// scoring.service.ts → scoreLongHaulFromRoutes()
const totalRoutes = routes.routes.length;

if (totalRoutes === 0) {
  // AeroDataBox returned nothing or fallback
  uncertainty.push('No route data available — long-haul score defaulted to 0.');
  return { score: 0, weight: WEIGHTS.longHaul, weightedScore: 0, ... };
}

const originAirport = this.airports.getAirportByIata(iata);
const originLat = originAirport.data?.latitude ?? null;
const originLon = originAirport.data?.longitude ?? null;
```

### Haversine distance — computed in `AirportsService`

```ts
// airports.service.ts → haversineKm()
haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius km
  const dLat = this.toRad(lat2 - lat1);
  const dLon = this.toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
```

### Classifying each route

```ts
// scoring.service.ts → scoreLongHaulFromRoutes()
let longHaulCount = 0;
let unknownCount = 0;

for (const route of routes.routes) {
  if (originLat !== null && originLon !== null && route.lat !== null && route.lon !== null) {
    const distKm = this.airports.haversineKm(originLat, originLon, route.lat, route.lon);
    if (distKm >= LONG_HAUL_THRESHOLD_KM) longHaulCount++; // LONG_HAUL_THRESHOLD_KM = 3000
  } else {
    unknownCount++;
    longHaulCount++; // no coordinates → conservatively assume international = long-haul
  }
}

if (unknownCount > 0) {
  assumptions.push(`${unknownCount} destination(s) missing coordinates — assumed international (long-haul, ≥ 3000 km).`);
}
```

### Scoring

```ts
// scoring.service.ts → scoreLongHaulFromRoutes()
const longHaulSharePct = (longHaulCount / totalRoutes) * 100;
const score = Math.round(
  this.clamp(
    this.normalizeToScore(longHaulSharePct, 0, LONG_HAUL_FULL_MARKS_PCT), // LONG_HAUL_FULL_MARKS_PCT = 30
    0, 100,
  )
);

drivers.push(`Long-haul routes: ${longHaulCount}/${totalRoutes} (${Math.round(longHaulSharePct)}%)`);
drivers.push(`Route data source: ${routes.source}`);
assumptions.push(`Long-haul threshold: 3000 km great-circle distance.`);

return {
  score,
  weight: WEIGHTS.longHaul,                          // 0.20
  weightedScore: Math.round(score * WEIGHTS.longHaul * 10) / 10,
  keyDrivers: drivers,
  assumptions,
  uncertainty,
};
```

> Ceiling is 30% (`LONG_HAUL_FULL_MARKS_PCT = 30`) not 50% because almost no US airport exceeds 30% international share. The old 50% ceiling meant JFK at ~40% only scored 80/100 on this dimension. At 30%, JFK correctly scores 100.

---

## Component 4: Unmet Demand Proxy (20%)

**File:** `scoring.service.ts` → `scoreUnmetDemand()`

```
Unmet Demand = 0.50 × growthScore + 0.30 × pressureScore + 0.20 × congestionScore
```

Answers: *"Is demand growing faster than the airport can absorb right now?"*
This is a proxy metric — not an official FAA capacity determination.

### Sub-score 1: Growth Trajectory (50%)

Data: same `operationsGrowthPct` + `enplanementGrowthPct` from `getDemandSnapshot()` — no extra call.

```ts
// scoring.service.ts → scoreUnmetDemand()
const growthSignal = (demand.operationsGrowthPct + demand.enplanementGrowthPct) / 2;
const growthScore = this.clamp(
  this.normalizeToScore(growthSignal, GROWTH_MIN, GROWTH_MAX), // -5 to +25
  0, 100,
);
drivers.push(`Avg demand growth signal: ${Math.round(growthSignal * 10) / 10}% (ops + enplanements avg)`);
```

### Sub-score 2: Ops-per-Runway Pressure (30%)

The exact same `pressureScore` from Congestion — passed from `computeScore()`, not recomputed:

```ts
// scoring.service.ts → computeScore()
const congestion   = this.scoreCongestion(capacity, airCarrierItinerant, pressureScore, flights);
const activity     = this.scoreActivity(faaDemand.data);
const longHaul     = this.scoreLongHaulFromRoutes(iata, routes);
const unmetDemand  = this.scoreUnmetDemand(faaDemand.data, pressureScore, congestion.score);
//                                                          ^^^^^^^^^^^^^ same value, reused
```

```ts
// scoring.service.ts → scoreUnmetDemand()
drivers.push(`Ops-per-runway pressure: ${Math.round(pressureScore)}/100`);
```

### Sub-score 3: Full Congestion Score (20%)

The complete congestion score (pressure + volume + delay) feeds back in, creating compounding:

```ts
// scoring.service.ts → scoreUnmetDemand()
drivers.push(`Congestion score contribution: ${congestionScore}/100`);

const score = Math.round(0.5 * growthScore + 0.3 * pressureScore + 0.2 * congestionScore);

assumptions.push('Unmet demand is a composite proxy, not an official FAA determination.');
assumptions.push('Formula: 50% growth trajectory + 30% ops-per-runway pressure + 20% congestion score.');

return {
  score,
  weight: WEIGHTS.unmetDemand,                        // 0.20
  weightedScore: Math.round(score * WEIGHTS.unmetDemand * 10) / 10,
  keyDrivers: drivers,
  assumptions,
  uncertainty,
};
```

> Compounding effect: a congested airport (high `congestionScore`) with strong FAA growth forecasts scores high on both the 30% pressure input AND the 20% congestion input. Both are driven by the same data — this is intentional. It means the signal is amplified when two independent indicators agree.

---

## Step 6 — Final assembly

```ts
// scoring.service.ts → computeScore()
const totalScore = Math.round(
  congestion.weightedScore +    // congestion.score × 0.35
  activity.weightedScore +      // activity.score   × 0.25
  longHaul.weightedScore +      // longHaul.score   × 0.20
  unmetDemand.weightedScore     // unmetDemand.score × 0.20
);
```

Grade assignment:

```ts
// scoring.service.ts → toGrade()
private toGrade(score: number): ScoreGrade {
  if (score >= 80) return 'A'; // High priority
  if (score >= 65) return 'B'; // Solid candidate
  if (score >= 50) return 'C'; // Moderate
  if (score >= 35) return 'D'; // Weak
  return 'F';                  // Not a priority
}
```

Key drivers are surfaced by sorting components by their weighted contribution:

```ts
// scoring.service.ts → deriveKeyDrivers()
private deriveKeyDrivers(breakdown: ScoreBreakdown): string[] {
  const entries: [string, ComponentScore][] = [
    ['Congestion Pressure', breakdown.congestion],
    ['Activity Demand', breakdown.activity],
    ['Long-Haul Opportunity', breakdown.longHaul],
    ['Unmet Demand Proxy', breakdown.unmetDemand],
  ];
  return entries
    .sort((a, b) => b[1].weightedScore - a[1].weightedScore) // highest weighted contributor first
    .map(([label, comp]) => `[${label}] ${comp.keyDrivers[0] ?? label}`);
}
```

The final object returned to the AI agent:

```ts
// scoring.service.ts → computeScore() return value
return {
  iata,
  name,
  totalScore,
  grade: this.toGrade(totalScore),
  breakdown: { congestion, activity, longHaul, unmetDemand },
  keyDrivers: this.deriveKeyDrivers({ congestion, activity, longHaul, unmetDemand }),
  assumptions: this.collectAssumptions(congestion, activity, longHaul, unmetDemand),
  uncertainty: [...uncertaintySet], // all uncertainty strings from all components
  sources: [...new Set(sources)],   // deduplicated list of data sources
  calculatedAt: new Date().toISOString(),
  fromCache: false,
};
```

---

## Normalization helper (used by every sub-score)

```ts
// scoring.service.ts
private normalizeToScore(value: number, low: number, high: number): number {
  if (high <= low) return 0;
  return ((value - low) / (high - low)) * 100;
}

private clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
```

All normalization constants in one place:

```ts
// scoring.service.ts — top of file
const OPS_PER_RUNWAY_MIN = 10_000;       // congestion: pressure floor
const OPS_PER_RUNWAY_MAX = 100_000;      // congestion: pressure ceiling
const TRAFFIC_VOLUME_MIN = 20_000;       // congestion: volume floor
const TRAFFIC_VOLUME_MAX = 400_000;      // congestion: volume ceiling
const GROWTH_MIN = -5;                   // activity/unmet: growth floor (%)
const GROWTH_MAX = 25;                   // activity/unmet: growth ceiling (%)
const LONG_HAUL_FULL_MARKS_PCT = 30;    // long-haul: 100/100 threshold (%)
const SCORE_TTL_MINUTES = 60 * 24;      // cache: 24 hours
```

---

## Data sources at a glance

| Data point | Source file / API | Loaded | Used by |
|---|---|---|---|
| `airCarrierItinerant` (ops/yr) | `FAA AirportsOperations.xlsx` col `itn_Ac` | Startup → memory | Congestion (pressure + volume), Unmet Demand |
| `totalOperations` (all ops types) | `FAA AirportsOperations.xlsx` sum of all columns | Startup → memory | Activity (ops growth) |
| `forecastOperations` | `FAA AirportsOperations.xlsx` `scenario=1` | Startup → memory | Activity (ops growth %), Unmet Demand (growth) |
| `currentEnplanements` | `FAA Enplanements.xlsx` col `aac` `scenario=0` | Startup → memory | Activity (current level) |
| `forecastEnplanements` | `FAA Enplanements.xlsx` col `aac` `scenario=1` | Startup → memory | Activity (enp growth %), Unmet Demand (growth) |
| Active runway count | `OurAirports runways.csv` filtered `closed=0` | Startup → memory | Congestion (pressure), Unmet Demand (pressure) |
| Airport coordinates | `OurAirports airports.csv` `latitude_deg/longitude_deg` | Startup → memory | Long-Haul (origin point for Haversine) |
| Delayed/cancelled flights | AeroDataBox `/flights/airports/iata/...` | Per request, cached 24h | Congestion (delay sub-score) |
| Route list + destination coords | AeroDataBox `/airports/iata/.../stats/routes/daily` | Per request, cached 7d | Long-Haul (Haversine per destination) |
| Full score snapshot | Postgres `AirportScoreSnapshot` table | Per request, cached 24h | All — avoids recompute |

---

## Component descriptions

| Component | One sentence |
|---|---|
| **Congestion Pressure** | Is this airport running out of runway capacity — and are flights already breaking down because of it? |
| **Activity Demand** | How large is this airport today, and how fast is it expected to grow? |
| **Long-Haul Opportunity** | What share of routes are long-distance, signaling international infrastructure investment potential? |
| **Unmet Demand Proxy** | Is demand growing faster than the airport's current infrastructure can absorb? |

---

### Congestion Pressure (35%)

**What we measure:** Is this airport running out of runway capacity — and are flights already breaking down because of it?

**How we compute it — 3 inputs:**

- **Ops-per-runway (50%)** — We take the total annual commercial flights and divide by the number of active runways. This tells us how hard each runway is actually working. A small airport with 1 runway doing 100k ops is far more strained than a large airport with 8 runways doing the same volume. This is the core signal.

- **Total annual ops volume (30%)** — Raw scale matters. Even if runway pressure is moderate, an airport handling 400k ops/year is a different investment target than one handling 40k. We normalize against a 20k–400k range.

- **Delay and cancellation rate (20%)** — Live flight data from AeroDataBox. If 20%+ of departures are delayed or cancelled on a given day, the airport is showing real operational strain — not just theoretical pressure. This is the ground truth that confirms or challenges the runway numbers.

**Why this is the strongest signal for investment (35% weight):** Congestion is the most direct evidence that an airport needs capital. Strained runways and high delay rates mean airlines are losing money, passengers are frustrated, and there is a clear, measurable infrastructure gap. Investors and operators can point to these numbers and justify expansion spending.

---

### Activity Demand (25%)

**What we measure:** How large is this airport today, and how fast is it expected to grow?

**How we compute it — 3 inputs:**

- **Current enplanement level (50%)** — Enplanements are the number of passengers boarding flights per year. This tells us the airport's current scale. We normalize against a 0–15M range, so a major hub like BOS (17M) maxes out this sub-score. You can't invest in growth that isn't there.

- **Enplanement growth forecast (25%)** — The FAA Terminal Area Forecast projects passenger numbers to 2030. We calculate the percentage growth from today's number to that forecast. A 20%+ projected growth is a strong buy signal; a declining forecast is a red flag.

- **Operations growth forecast (25%)** — Same idea but for total flight operations — takeoffs and landings. This captures cargo and charter growth that enplanements miss. Both growth signals together paint a fuller picture of where the airport is heading.

**Why this matters for investment:** An airport can be congested today but shrinking tomorrow — that's a poor investment. Activity Demand ensures we're backing airports with both current scale and a credible growth trajectory. FAA forecasts are the most authoritative public projection available for US airports.

---

### Long-Haul Opportunity (20%)

**What we measure:** What share of routes are long-distance, signaling international infrastructure investment potential?

**How we compute it — 1 input:**

- **Long-haul share (100%)** — We take every daily route departing from the airport and compute the great-circle distance to each destination using the Haversine formula (latitude/longitude coordinates from OurAirports and AeroDataBox). Any route ≥ 3,000 km is classified as long-haul. We then divide long-haul routes by total routes to get a percentage, normalized against a 0–30% range. If a destination has no coordinates, we conservatively assume it is international and count it as long-haul.

**Why this matters for investment:** Long-haul routes — especially international ones — generate significantly higher revenue per seat than domestic routes. Airports with strong international exposure need more infrastructure: larger terminals, customs and immigration facilities, international gates, lounges, and ground handling capacity. A high long-haul score tells an investor exactly where to spend: international terminal expansion is the highest-yield opportunity at that airport.

---

### Unmet Demand Proxy (20%)

**What we measure:** Is demand growing faster than the airport's current infrastructure can absorb?

**How we compute it — 3 inputs:**

- **Growth trajectory (50%)** — We average the ops growth forecast and the enplanement growth forecast into a single signal. If both are growing strongly, new demand is incoming. This is the forward-looking part of the score.

- **Ops-per-runway pressure (30%)** — The exact same runway pressure score from Congestion, reused here. If runways are already stretched and more demand is arriving, that gap compounds. An airport with spare runway capacity can absorb growth without new investment; a strained one cannot.

- **Full congestion score (20%)** — The complete Congestion score — including live delay data — feeds back in. This creates a compounding effect: if an airport is already showing operational breakdown today and is forecast to grow, the unmet demand signal is amplified from two directions.

**Why this matters for investment:** This component answers the most important investor question — not "is it busy now?" but "will it be too busy soon, and can it cope?" A high unmet demand score means there is a real, quantifiable gap between where demand is going and what the infrastructure can handle. That gap is where investment returns are generated.
