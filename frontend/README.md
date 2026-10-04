# RepoPulse — Frontend

React + Vite + TypeScript client for the RepoPulse API.

The frontend talks **only** to the RepoPulse Express API (`src/services/`). It never calls
GitHub, Supabase, Redis or the AI provider directly, and it never computes authoritative metrics —
it renders what the backend returns.

## Development

```bash
cp .env.example .env
npm install
npm run dev        # http://localhost:5173, /api proxied to the backend
npm run typecheck
npm run build
```

API contract types are shared with the backend via `../shared/contracts.d.ts`
(imported as `@shared/contracts`, re-exported from `src/types`).
