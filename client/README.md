# Airport Investment Radar — Client

Angular 20 single-page application. Provides a chat interface for analysts to query the Airport Investment Radar backend.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Angular 20 (standalone components) |
| Language | TypeScript |
| Styling | CSS custom properties, no UI framework |
| Markdown | marked (rendered in assistant messages) |
| Serving | nginx (Docker production build) |

---

## Development

```bash
npm install
ng serve
```

App runs at `http://localhost:4200`. Requires the backend server running at `http://localhost:3000`.

---

## Production Build

```bash
ng build
```

Output in `dist/client/browser/`. The Docker image copies this into an nginx container.

---

## Environment

API base URL is set per environment:

| File | Used when |
|---|---|
| `src/environments/environment.ts` | `ng serve` (development) |
| `src/environments/environment.prod.ts` | `ng build` (production) |

Change `apiBase` in the prod environment file to point at your deployed server URL.

---

## Structure

```
src/app/
  chat/
    chat.component          Root chat page — state, message sending, conversation management
    message-thread/         Renders the message list with markdown support
    message-input/          Text input + submit (Enter to send, Shift+Enter for newline)
    sidebar/                Conversation history list with rename and delete
    tools-bar/              Displays agent capability cards and example prompts
    chat.types.ts           Message type definition
  services/
    agent.service.ts        HTTP client for all backend API calls
  pipes/
    markdown.pipe.ts        Converts assistant markdown responses to safe HTML
  environments/             API base URL per environment
```

---

## Key Behaviours

- **New conversation**: omit `conversationId` on the first message; the backend creates one and returns it
- **Conversation persistence**: all messages are stored in the database; selecting a conversation from the sidebar loads full history
- **Markdown rendering**: assistant responses are rendered as formatted markdown (tables, bold, code blocks)
- **Error display**: API and AI errors surface as red error bubbles in the message thread with the exact server message
- **Responsive sidebar**: auto-collapses on viewports below 768px; toggleable via header button
