# AeroCap Intelligence Agent — Backend Implementation Plan

## Stack

- NestJS (TypeScript)
- Prisma + PostgreSQL
- OurAirports CSV files (in-memory, no DB)
- Anthropic Claude API (claude-haiku-4-5-20251001)
- AviationStack API (optional, feature-flagged)
- API Ninjas API (optional, feature-flagged)

---

## Architecture Decision: Two Data Layers

| Layer | Storage | What lives here |
|---|---|---|
| Static | In-memory (CSV) | Airport metadata, runway data, region mapping |
| Dynamic | PostgreSQL (Prisma) | Conversations, messages, tool call logs, API cache, score snapshots |

OurAirports CSV files are never loaded into PostgreSQL.
PostgreSQL holds only volatile, expensive-to-recompute, or auditable data.

---

## Modules

```
AppModule
├── DatabaseModule       — Prisma client, PostgreSQL connection
├── AirportsModule       — OurAirports CSV loader (in-memory, no DB)
├── ScoringModule        — deterministic score calculation
├── CacheModule          — external API response caching (DB-backed)
└── AgentModule          — tool registry, tool execution, Claude loop, HTTP endpoints
```

---

## Services

| Service | Module | Responsibility |
|---|---|---|
| `PrismaService` | DatabaseModule | Prisma client lifecycle |
| `AirportsService` | AirportsModule | Parse CSVs at startup, in-memory query methods |
| `ScoringService` | ScoringModule | Stateless score formula; reads from DB snapshot if fresh |
| `ApiCacheService` | CacheModule | Read/write external API responses to ApiCache table |
| `AviationStackService` | CacheModule | Call AviationStack, use ApiCacheService first |
| `ApiNinjasService` | CacheModule | Call API Ninjas, use ApiCacheService first |
| `ToolsService` | AgentModule | Implements the 5 tool functions; assembles data from Airports + Scoring + Cache |
| `AgentService` | AgentModule | Claude tool-use loop; persists conversation + messages + audit logs |
| `AgentController` | AgentModule | HTTP layer: /alive, /agent/tools, /agent/message |

---

## HTTP Endpoints

| Method | Path | Description |
|---|---|---|
| GET | /alive | Health check, returns `{ status: 'ok' }` |
| GET | /agent/tools | Returns the tool registry (name, description, input schema) |
| POST | /agent/message | Main chat endpoint. Body: `{ conversationId?, message }` |

---

## Agent Tools

| Tool | Description |
|---|---|
| `rank_airports_by_region` | Ranks airports in a region by investment score |
| `compare_airports` | Side-by-side comparison of two airports |
| `analyze_airport` | Full investment profile for one airport |
| `calculate_long_haul_share` | Long-haul route percentage for one airport |
| `estimate_unmet_demand` | Unmet demand score using proxy metrics |

---

## Scoring Formula

```
Airport Investment Score (0–100) =
  35%  Congestion Pressure Score
+ 25%  Activity Demand Score
+ 20%  Long-Haul Opportunity Score
+ 20%  Unmet Demand Proxy Score
```

### CSV-based proxies (Phase 1, no live API)

| Dimension | Proxy |
|---|---|
| Congestion Pressure | Runway count + airport type |
| Activity Demand | Airport type + scheduled_service flag |
| Long-Haul Opportunity | Airport type + elevation |
| Unmet Demand Proxy | Large metro + medium/small airport type mismatch |

All proxy assumptions are returned in the `assumptions[]` array on every score result.

### Airport Score shape

```ts
interface AirportScore {
  icao: string;
  name: string;
  state: string;
  totalScore: number;          // 0–100
  congestionPressure: number;  // 0–35
  activityDemand: number;      // 0–25
  longHaulOpportunity: number; // 0–20
  unmetDemandProxy: number;    // 0–20
  dataSource: string;          // "csv_only" | "csv+aviationstack" | "csv+api_ninjas"
  assumptions: string[];
}
```

---

## Prisma Schema Models

```prisma
model Conversation {
  id        String    @id @default(uuid())
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  messages  Message[]
}

model Message {
  id             String       @id @default(uuid())
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id])
  role           String       // "user" | "assistant" | "tool"
  content        String
  createdAt      DateTime     @default(now())
}

model ToolCallLog {
  id             String   @id @default(uuid())
  conversationId String
  messageId      String?
  toolName       String
  inputJson      Json
  outputJson     Json
  durationMs     Int
  createdAt      DateTime @default(now())
}

model ApiCache {
  id           String   @id @default(uuid())
  source       String   // "aviationstack" | "api_ninjas"
  cacheKey     String   @unique  // e.g. "aviationstack:flights:BOS"
  responseJson Json
  fetchedAt    DateTime @default(now())
  expiresAt    DateTime
}

model AirportScoreSnapshot {
  id               String   @id @default(uuid())
  icao             String
  totalScore       Float
  congestionScore  Float
  activityScore    Float
  longHaulScore    Float
  unmetDemandScore Float
  inputsJson       Json     // raw metric inputs used
  assumptionsJson  Json     // string[]
  dataSource       String   // "csv_only" | "csv+aviationstack" | "csv+api_ninjas"
  scoredAt         DateTime @default(now())
  expiresAt        DateTime

  @@index([icao])
}
```

---

## Cache & Snapshot Expiry

| Table | TTL |
|---|---|
| ApiCache — AviationStack | 24 hours |
| ApiCache — API Ninjas | 7 days |
| AirportScoreSnapshot — csv_only | 7 days |
| AirportScoreSnapshot — with live API | 24 hours |

---

## PostgreSQL Setup

- Prisma provider: `postgresql`
- Local dev: Docker Compose with `postgres:16-alpine`
- Migrations: `prisma migrate dev`
- Connection via `DATABASE_URL` in `.env`

Add to `.env`:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aerocap
```

---

## Data Flow: POST /agent/message

```
Request { conversationId?, message }
  → AgentController
    → AgentService.handleMessage()
      → upsert Conversation in DB
      → save user Message to DB
      → load prior messages from DB (if conversationId provided)
      → send to Claude with tool definitions
        → Claude returns tool_use block
        → ToolsService.executeTool(toolName, input)
          → AirportsService        (CSV, in-memory, always)
          → ApiCacheService.get()  (check DB cache first)
            → AviationStack / API Ninjas  (only on cache miss, only if feature flag on)
            → ApiCacheService.set()       (write response to DB)
          → ScoringService.score()
            → check AirportScoreSnapshot in DB  (reuse if not expired)
            → calculate fresh if needed
            → save AirportScoreSnapshot to DB
          → write ToolCallLog to DB
          → return tool result to Claude
        → Claude returns final assistant message
      → save assistant Message to DB
  → Response { conversationId, message, data }
```

---

## Feature Flags (from .env)

| Flag | Effect |
|---|---|
| `USE_LIVE_AVIATION_API=false` | AviationStack calls skipped; CSV proxies used |
| `USE_LIVE_AIRPORT_METADATA_API=false` | API Ninjas calls skipped; CSV proxies used |

External API calls are always gated by these flags. The score formula and response shape do not change when flags are toggled — only the quality of inputs changes.

---

## Implementation Order

### Phase 1 — Foundation

1. Docker Compose + PostgreSQL running locally, `DATABASE_URL` in `.env`
2. `DatabaseModule` / `PrismaService` — client setup, lifecycle hooks
3. Prisma schema + first migration — all five models
4. `AirportsService` — CSV parsing at startup, US-only filter, in-memory query methods (`findByIcao`, `findByRegion`, `findByState`, `findByName`)

### Phase 2 — Scoring

5. `ScoringService` — deterministic formula with CSV proxies; snapshot read/write via Prisma
6. `GET /alive` — confirm app boots and DB is reachable

### Phase 3 — API Cache Layer

7. `ApiCacheService` — generic cache read/write with TTL check
8. `AviationStackService` — call API, delegate caching to ApiCacheService, gated by feature flag
9. `ApiNinjasService` — same pattern as AviationStack

### Phase 4 — Tools and Direct Dispatch

10. `GET /agent/tools` — return static tool registry
11. `ToolsService` — implement all 5 tools using Airports + Scoring + Cache services
12. `AgentService` — conversation + message persistence; direct tool dispatch (no Claude yet)
13. `POST /agent/message` — end-to-end with direct keyword dispatch, no Claude

### Phase 5 — Claude Tool-Use Loop

14. Swap direct dispatch for Claude API tool-use loop
15. Add `ToolCallLog` writes on every tool call
16. Verify follow-up questions work using conversation history from DB

---

## OurAirports CSV Files

Located at `src/data/ourairports/`:

| File | Used for |
|---|---|
| `airports.csv` | Airport name, ICAO, type, state, coordinates, scheduled_service |
| `runways.csv` | Runway count per airport (congestion proxy) |
| `regions.csv` | State/region name mapping |
| `countries.csv` | Country filter (US only) |

Loaded once at app startup by `AirportsService`. Never written to DB.

---

## Live Example Questions — Tested Against the Running Agent

These are the 4 exact questions from the assignment brief, tested live against the running server.

---

**Q1: "Which airports in New England are strong candidates for terminal expansion?"**

Tool: `rank_airports_by_region({ region: "New England" })` — 2 iterations
Logs: batches of 5 airports, 300ms apart. Some 429s on AeroDataBox (fallback to FAA data).
Key answer:
- BOS — 58/100 Grade C — only actionable candidate. 14.85M enplanements, 57K ops/runway, 90.7% unmet demand signal
- BDL — 40/100 Grade D — secondary watch-list as BOS overflow play
- All others Grade F — explicitly named as not worth pursuing
- Investment type: gate capacity, international terminal throughput at BOS

---

**Q2: "Compare LA and Santa Ana airport congestion levels."**

Tool: `analyze_airport(LAX)` + `analyze_airport(SNA)` → `compare_airports({ airportA: "LAX", airportB: "SNA" })` — 3 iterations
Logs: LAX flights cached, LAX routes 429'd. SNA flights + routes 429'd. Long-haul defaulted to 0 for both.
Key answer:
- LAX — 80/100 Grade A — congestion score 100/100. 136,738 ops/runway. 40% delay/cancellation rate (live data)
- SNA — 40/100 Grade D — congestion score 27/100. 47,189 ops/runway. Physically capped by 5,700 ft runway
- LAX is nearly 3× more congested per runway than SNA
- Data caveat: LAX long-haul score = 0 due to 429 — real score would be higher (transpacific hub)

---

**Q3: "What is the percentage of long haul flights out of Anchorage airport?"**

Tool: `calculate_long_haul_share({ airport: "ANC" })` — 2 iterations, zero 429s
Logs: Routes API succeeded and cached 7 days. No flights API call needed.
Key answer:
- 63.2% long-haul share — 36 of 57 routes ≥ 3,000 km great-circle distance
- Driven by geography: nearly all continental US destinations are long-haul from ANC
- Trans-Pacific routes: HKG (8,165 km), GRU (12,995 km), FRA (7,502 km), ICN (6,097 km)
- Intra-Alaska routes are the only short-haul: ENA (96 km), FAI (418 km)
- Investment type: cargo infrastructure, cold-chain, international apron — not passenger terminal

---

**Q4: "What is the unmet flight demand in SFO airport and why?"**

Tool: `estimate_unmet_demand(SFO)` → `analyze_airport(SFO)` — 3 iterations
Logs: `estimate_unmet_demand` fires zero AeroDataBox calls (pure FAA data). `analyze_airport` — flights cached, routes 429'd.
Key answer:
- 94/100 proxy score — top tier in the US
- Why: 101.7% FAA forecast growth + 87,701 ops/runway + 23% delay/cancellation rate on just 4 runways
- "1 in 4 flights delayed or cancelled" — systemic, not cyclical
- Long-haul defaulted to 0 (429) — real total score (75/100 Grade B) would move to Grade A with route data
- Investment type: airside capacity, gate infrastructure, terminal throughput
