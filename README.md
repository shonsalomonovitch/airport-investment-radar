# Airport Investment Radar

An AI-powered analysis tool for infrastructure investors and analysts. Ask questions in plain English and get structured, data-driven investment scores for any US airport — backed by FAA forecasts, live flight data, and runway metrics.

---

## What It Does

The agent evaluates US airports as infrastructure investment targets. It answers questions like:

- *"Analyze LAX as an investment target"*
- *"Which airports in the Southeast are most capacity-constrained?"*
- *"Compare JFK and EWR — which is the stronger investment?"*
- *"What percentage of flights from MIA are long-haul?"*
- *"What is the unmet demand signal at BOS?"*

Every answer includes a scored breakdown across four investment dimensions, a grade, a verdict, and a concrete recommendation.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│                Angular Client               │
│  Chat UI — sends messages, renders markdown │
└──────────────────┬──────────────────────────┘
                   │ POST /agent/message
┌──────────────────▼──────────────────────────┐
│              NestJS Server                  │
│                                             │
│  AgentService ──► Claude (Anthropic API)    │
│       │                │                   │
│       │         tool_use calls              │
│       │                │                   │
│       └───► ToolsService ──► ScoringService │
│                              │              │
│              ┌───────────────┼────────────┐ │
│              │               │            │ │
│         FAA Data        AeroDataBox    OurAirports│
│         (XLSX,          (live API,     (CSV,     │
│          startup)        pg cache)     startup)  │
└─────────────────────────────────────────────┘
                   │
         PostgreSQL (Prisma Postgres)
         Conversations · Messages · ApiCache
         ScoreSnapshots · ToolCall audit log
```

---

## Quick Start — Docker

The fastest way to run the full stack:

```bash
# 1. Add your API keys to server/.env
cp server/.env.example server/.env
# fill in ANTHROPIC_API_KEY, AERODATABOX_API_KEY, DATABASE_URL

# 2. Start everything
docker compose up --build
```

- Client: http://localhost:4200
- Server: http://localhost:3000

On first run, `prisma migrate deploy` runs automatically before the server starts.

---

## Manual Setup

### Prerequisites

- Node.js 22+
- PostgreSQL (or Prisma Postgres)
- Anthropic API key
- RapidAPI key subscribed to AeroDataBox

### Server

```bash
cd server
npm install
npx prisma migrate deploy
npm run start:dev
```

### Client

```bash
cd client
npm install
ng serve
```

---

## Environment Variables

Create `server/.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-haiku-4-5-20251001

AERODATABOX_API_KEY=your-rapidapi-key

PORT=3000
ALLOWED_ORIGIN=http://localhost:4200

DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
```

---

## The Investment Score

Every airport receives a **score from 0–100** computed across four dimensions:

```
Total = 0.35 × Congestion + 0.25 × Activity + 0.20 × Long-Haul + 0.20 × Unmet Demand
```

| Dimension | Weight | What it measures |
|---|---|---|
| Congestion Pressure | 35% | Ops-per-runway ratio + traffic volume + live delay rate |
| Activity Demand | 25% | Current enplanement scale + FAA growth forecast |
| Long-Haul Opportunity | 20% | Share of routes ≥ 3,000 km (≥30% = full marks) |
| Unmet Demand Proxy | 20% | Growth trajectory hitting a strained airport |

**Grade scale:**

| Grade | Score | Meaning |
|---|---|---|
| A | ≥ 80 | High-priority. Strong case for immediate due diligence. |
| B | ≥ 65 | Solid candidate. Include in shortlist. |
| C | ≥ 50 | Moderate. Targeted plays only (cargo, ground handling). |
| D | ≥ 35 | Weak. Monitor but do not prioritise. |
| F | < 35 | Not a priority. |

**Data sources:**
- FAA Terminal Area Forecast (TAF) — operations and enplanement history + projections
- OurAirports CSV — runway counts, lengths, coordinates
- AeroDataBox API — live departure counts, delay/cancellation rates, daily routes (cached 24h/7d)

---

## Sample Conversations

The following examples show what to type and what kind of output to expect. Use them as a starting point when onboarding analysts to the tool.

---

### 1 — Single Airport Deep Dive

**You:**
> Analyze ATL

**Agent returns:**
- Overall score and grade
- Score breakdown table (all 4 dimensions with weighted contributions)
- Key findings: enplanements, ops-per-runway, growth forecast, long-haul share
- Investment verdict: what type of infrastructure is most justified
- Recommendation: prioritise / add to shortlist / monitor / deprioritise
- 2–3 suggested follow-up questions

---

### 2 — Regional Screening

**You:**
> Which airports in the Southeast are the strongest investment candidates?

**Agent returns:**
- Ranked table of all Southeast airports by score
- Top 3 called out individually with one-line rationale each
- Grade D/F airports explicitly named as not worth pursuing
- Suggested next steps for the top candidates

**Variations:**
> Rank airports in California by investment potential
> Which Midwest airports have the highest congestion pressure?
> Show me all airports in Texas ranked by score

---

### 3 — Head-to-Head Comparison

**You:**
> Compare JFK vs EWR — which is the stronger infrastructure investment?

**Agent returns:**
- Side-by-side score table for both airports with a Winner column per dimension
- Verdict: which airport wins overall and why
- The specific infrastructure type that matches each airport's profile

**Variations:**
> Compare LAX vs SFO on congestion and long-haul opportunity
> Which is better for a cargo infrastructure play — ORD or MDW?

---

### 4 — Long-Haul Route Analysis

**You:**
> What percentage of flights from MIA are long-haul?

**Agent returns:**
- Total routes, long-haul count, percentage
- Per-route breakdown with great-circle distances
- Which destinations push MIA's international score

**Variations:**
> What is the long-haul share at ANC?
> How many international routes does IAD operate?

---

### 5 — Unmet Demand Probe

**You:**
> What is the unmet demand signal at SFO and why?

**Agent returns:**
- Unmet demand proxy score (0–100)
- Breakdown: growth trajectory signal, congestion signal, capacity constraint
- Plain-English interpretation: is demand growing faster than the airport can handle?

**Variations:**
> Is there unmet demand at LGA?
> Which of BOS or PHL has a stronger unmet demand signal?

---

### 6 — Multi-Turn Analysis Workflow

A typical analyst session might look like this:

```
You:      Rank airports in New England by investment score
Agent:    [ranked table — BOS leads, PVD and MHT follow]

You:      Tell me more about BOS
Agent:    [full BOS analysis with score breakdown and verdict]

You:      Compare BOS vs JFK on congestion and long-haul
Agent:    [side-by-side comparison using already-retrieved data]

You:      What infrastructure type makes most sense for BOS?
Agent:    [targeted answer based on BOS's specific profile]
```

The agent remembers the full conversation. Follow-up questions do not re-call tools unnecessarily — it uses data already retrieved in the session.

---

### 7 — Understanding the Score

**You:**
> How is the investment score calculated?

**Agent returns:**
- Full formula with exact weights and normalisation ranges
- Why each dimension was designed the way it was
- What the score does and does not capture
- Known limitations (land constraints, regulatory environment, ownership structure)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Client | Angular 20, TypeScript, nginx |
| Server | NestJS, TypeScript |
| AI | Anthropic Claude via `@anthropic-ai/sdk` |
| Database | PostgreSQL via Prisma v7 (pg adapter) |
| Live Data | AeroDataBox (RapidAPI) |
| Static Data | FAA TAF XLSX + OurAirports CSV |
| Validation | Zod |
| Containerisation | Docker + Docker Compose |

---

## Project Structure

```
airport-investment-radar/
├── docker-compose.yml
├── client/                   Angular frontend
│   └── src/app/
│       ├── chat/             Chat UI components
│       ├── services/         AgentService (HTTP client)
│       └── pipes/            MarkdownPipe
└── server/                   NestJS backend
    ├── prisma/
    │   ├── schema.prisma     DB schema
    │   └── migrations/
    ├── prisma.config.ts      Prisma v7 datasource config
    └── src/
        ├── agent/            Claude agentic loop + system prompt
        ├── aerodatabox/      Live flights + routes API wrapper
        ├── airports/         OurAirports CSV + region definitions
        ├── cache/            PostgreSQL TTL cache for API responses
        ├── conversations/    Chat history (CRUD)
        ├── faa-data/         FAA TAF XLSX loader
        ├── scoring/          4-component investment scoring engine
        ├── tools/            Tool dispatcher + audit logger
        └── data/
            ├── ourairports/  airports.csv, runways.csv
            └── faa/          Airports.xlsx, AirportsOperations.xlsx, Enplanements.xlsx
```
