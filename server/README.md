# Airport Investment Radar — Backend

NestJS API server powering the Airport Investment Radar agent. Combines local aviation datasets, the AeroDataBox API, and Claude AI to help analysts identify US airport infrastructure investment opportunities.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | NestJS (TypeScript) |
| AI | Anthropic Claude (`claude-haiku-4-5`) via `@anthropic-ai/sdk` |
| Database | PostgreSQL via Prisma (pg adapter) |
| Live API | AeroDataBox via RapidAPI |
| Static Data | OurAirports CSV + FAA TAF XLSX (loaded at startup) |
| Validation | Zod |

---

## Prerequisites

- Node.js 20+
- A running PostgreSQL instance
- An [Anthropic API key](https://console.anthropic.com/)
- A [RapidAPI key](https://rapidapi.com/) subscribed to AeroDataBox

---

## Environment Setup

Copy or create `.env` in the `server/` directory:

```env
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-haiku-4-5-20251001

AERODATABOX_API_KEY=your-rapidapi-key

PORT=3000

DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"
```

---

## Installation

```bash
npm install
```

---

## Database

Run Prisma migrations to create all tables:

```bash
npx prisma migrate deploy
```

Or in development (creates and applies a new migration):

```bash
npx prisma migrate dev
```

---

## Static Data Files

The server loads these files at startup. They must exist before running.

```
src/data/
  ourairports/
    airports.csv       ← US airport metadata + coordinates
    runways.csv        ← Runway lengths and surface types
  faa/
    Airports.xlsx      ← FAA TAF airport list + hub classification
    AirportsOperations.xlsx  ← Historical + forecast operations by airport
    Enplanements.xlsx  ← Historical + forecast enplanements by airport
```

These files are local and do not hit any network at runtime.

---

## Running the Server

```bash
# Development (watch mode)
npm run start:dev

# Production
npm run start:prod
```

Server starts on `http://localhost:3000` by default.

---

## API Reference

### Health

```
GET /alive
→ { "status": "ok" }
```

### Agent

```
GET /agent/tools
→ Array of 5 tool definitions Claude can call

POST /agent/message
Body: {
  "message": "Which airports in New England are strong investment candidates?",
  "conversationId": 42          // optional — omit to start a new conversation
}
→ { "answer": "...", "conversationId": 42 }
```

### Conversations

```
GET /conversations
→ [{ id, title, messageCount, lastMessageAt, createdAt, updatedAt }]

GET /conversations/:id/messages
→ [{ id, role, content, createdAt }]

PATCH /conversations/:id/title
Body: { "title": "New England Analysis" }
→ { id, title, updatedAt }
```

---

## Project Structure

```
src/
  agent/            AgentService — runs the Claude agentic loop
    agent.prompt.ts System prompt
    agent.tools.ts  Tool definitions passed to Claude
    agent.controller.ts  /agent endpoints
    pipes/          ZodValidationPipe for request validation
    schemas/        MessageSchema (Zod)
  aerodatabox/      AeroDataBoxService — live flights + routes API
  airports/         AirportsService — OurAirports CSV lookup + haversine distance
  cache/            ApiCacheService — PostgreSQL TTL cache for API responses
  conversations/    ConversationService + controller — chat history management
  faa-data/         FaaDataService — FAA TAF XLSX lookup
  prisma/           PrismaService — DB client
  scoring/          ScoringService — deterministic 4-component investment score
  tools/            ToolsService — dispatches all tool calls, logs audit records
  data/
    ourairports/    airports.csv, runways.csv
    faa/            Airports.xlsx, AirportsOperations.xlsx, Enplanements.xlsx
```

---

## How a Request Flows

1. Client sends `POST /agent/message` with a question and optional `conversationId`.
2. `AgentService` resolves or creates a conversation, loads history from DB, adds the user message.
3. Claude receives the full conversation history + system prompt + 5 tool definitions.
4. Claude responds with a `tool_use` block (e.g. `analyze_airport { airport: "BOS" }`).
5. `ToolsService.run()` validates the input, calls `ScoringService`, and logs the call to the `ToolCall` table.
6. `ScoringService` checks `AirportScoreSnapshot` cache (24h TTL). On miss, calls `AeroDataBoxService` (which checks `ApiCache` first), reads FAA and OurAirports data from memory, and computes the score.
7. The structured result is returned to Claude as a `tool_result`.
8. Claude writes the final explanation. The assistant reply is persisted to the `Message` table.
9. `{ answer, conversationId }` is returned to the client.

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `Conversation` | One row per chat session |
| `Message` | All messages (user + assistant) per conversation |
| `ApiCache` | AeroDataBox responses, TTL-keyed, upserted on each live call |
| `AirportScoreSnapshot` | Computed investment scores, 24h TTL |
| `ToolCall` | Audit log of every tool execution |

---

## Linting and Type Checking

```bash
npx eslint src/          # lint
npx tsc --noEmit         # type check
npx eslint src/ --fix    # auto-fix formatting
```
