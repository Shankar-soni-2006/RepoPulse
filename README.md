# RepoPulse — GitHub Engineering Intelligence Platform

## Overview
RepoPulse connects to GitHub, synchronizes repository activity, calculates engineering metrics, and provides AI-assisted analysis of engineering trends.

## Stack
- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express + TypeScript + Octokit + Zod
- **Database**: Supabase (PostgreSQL)
- **Cache**: Upstash Redis
- **AI**: OpenAI-compatible LLM API (Groq primary, Cerebras fallback)

## Project Structure
```
repopulse/
├── frontend/       # React + Vite frontend (talks only to the Express API)
├── backend/        # Express API server (tests in backend/tests)
├── shared/         # API contract types shared by backend and frontend
├── supabase/       # Database migrations
├── scripts/        # Utility scripts
└── docs/           # Architecture, database and requirements docs
```

## Setup

### 1. Install
```bash
npm run install:all
```

### 2. Configure environment
```bash
cp .env.example backend/.env                  # fill in required values
cp frontend/.env.example frontend/.env
```
Create and configure the GitHub App first: see `docs/architecture/github-app-setup.md`.
Generate `TOKEN_ENCRYPTION_KEY` with `openssl rand -base64 32`.

### 3. Run database migrations
Apply `supabase/migrations/*.sql` via the Supabase CLI or dashboard.

### 4. Develop
```bash
npm run dev:backend     # http://localhost:3001
npm run dev:frontend    # http://localhost:5173 (proxies /api to the backend)
```

### Sync a repository from the CLI
```bash
npm run sync:repo -- <repositoryId>
```
See `docs/architecture/sync.md`.

### 5. Verify
```bash
npm run typecheck
npm test               # backend + frontend suites
npm run test:smoke     # live end-to-end check (backend running, real services)
npm run build
```

## Deployment
Two Vercel projects from this repository: `frontend/` (static app, proxies `/api/*`) and
`backend/` (Express API as a serverless function), plus Supabase and Upstash. See
`docs/deployment.md`.

## Signing in

- **Members:** open `/login` → **Continue with GitHub**.
- **Admins:** open `/login?as=admin` → **Sign in as admin with GitHub** (only accounts with
  the admin role get in; members are refused). Make the first admin with
  `npm run admin:role -- <github-login> admin`.

Details, messages and the member/admin privilege table: `docs/project-guide.md` §6.

## Documentation
- `docs/project-guide.md`: **start here**: USP, folder structure, what every file does, admin/member privileges and sign-in, benefits, bottlenecks
- `docs/architecture/`: auth, sync, analytics, webhooks, cache, AI, GitHub App setup
- `docs/database/schema.md`: tables and integrity rules
- `docs/deployment.md`: production setup and verification
- `docs/requirements/acceptance.md`: acceptance criteria and how each is met
- `docs/requirements/test-report.md`: test layers and scenario coverage

## API Contract
All responses use `{ "success": true, "data": … }` or
`{ "success": false, "error": { "code", "message" } }`.
Shared types live in `shared/contracts.d.ts`.

## Environment Variables
See `.env.example` (backend) and `frontend/.env.example` (frontend).
