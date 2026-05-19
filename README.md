<p align="center">
  <img src="client/public/icon.png" alt="Airport Investment Radar" width="110" />
</p>

<h1 align="center">Airport Investment Radar</h1>

<p align="center">
  AI-powered agent for US airport infrastructure investment analysis.<br/>
  Ask questions in plain English. Get scored, ranked, and sourced answers.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude-Sonnet%204.6-blueviolet?logo=anthropic" alt="Claude" />
  <img src="https://img.shields.io/badge/Angular-20-red?logo=angular" alt="Angular" />
  <img src="https://img.shields.io/badge/NestJS-10-e0234e?logo=nestjs" alt="NestJS" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql" alt="PostgreSQL" />
</p>

---

## Features

| | Feature | Description |
|---|---|---|
| 🤖 | **AI Agent** | Claude Sonnet 4.6 with structured tool-use loop (up to 8 iterations per query) |
| 🏆 | **Investment Scoring** | 0–100 composite score across Congestion, Activity, Long-Haul, and Unmet Demand |
| 🛠️ | **5 Analysis Tools** | Rank by region, compare airports, full analysis, long-haul share, unmet demand |
| ✈️ | **Live Flight Data** | AeroDataBox API for real-time ops and routes, cached 24h/7d |
| 📊 | **FAA Forecast Data** | Terminal Area Forecast — enplanements, operations, 20-year growth projections |
| 💬 | **Chat History** | All conversations persisted in PostgreSQL, reloadable at any time |
| ✏️ | **Edit Title** | Rename any conversation inline directly from the sidebar |
| 🗑️ | **Delete Conversation** | Remove conversations you no longer need |
| 🌙 | **Dark Mode** | Full dark/light toggle with iMessage-style UI |
| 📝 | **Markdown Rendering** | Assistant responses render tables, headers, and bullet lists |
| ⏳ | **Typing Indicator** | Animated 3-dot indicator while the agent is thinking |
| ⚡ | **Quick Scenarios** | 4 one-click example questions to get started immediately |

---

## Screenshots

### Main App

![Main App](docs-images/main%20app.png)

---

### Chat in Action

<table>
  <tr>
    <td width="50%"><img src="docs-images/conversation%201.png" alt="Conversation 1" /></td>
    <td width="50%"><img src="docs-images/conversation%202.png" alt="Conversation 2" /></td>
  </tr>
</table>

---

### Dark Mode & Tools Panel

<table>
  <tr>
    <td width="50%"><img src="docs-images/dark%20mode.png" alt="Dark Mode" /></td>
    <td width="50%"><img src="docs-images/tools%20info.png" alt="Tools Info" /></td>
  </tr>
</table>

---

### Chat History, Edit Title & Delete

<table>
  <tr>
    <td width="34%"><img src="docs-images/chat%20history.png" alt="Chat History" /></td>
    <td width="33%"><img src="docs-images/edit%20conversation.png" alt="Edit Title" /></td>
    <td width="33%"><img src="docs-images/delete%20conversation.png" alt="Delete Conversation" /></td>
  </tr>
</table>

---

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

<img src="docs-images/Architecture.png" alt="Architecture" width="650" />

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
