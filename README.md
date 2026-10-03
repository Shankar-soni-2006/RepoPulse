# RepoPulse — GitHub Engineering Intelligence Platform

## Overview
RepoPulse connects to GitHub, synchronizes repository activity, calculates engineering metrics, and provides AI-assisted analysis of engineering trends.

## Stack
- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express + TypeScript + Octokit + Zod
- **Database**: Supabase (PostgreSQL)
- **Cache**: Upstash Redis
- **AI**: Google Gemini API

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
Register `${BACKEND_URL}/api/auth/callback` as the callback URL in your GitHub App.

### 3. Run database migrations
Apply `supabase/migrations/*.sql` via the Supabase CLI or dashboard.

### 4. Develop
```bash
npm run dev:backend     # http://localhost:3001
npm run dev:frontend    # http://localhost:5173 (proxies /api to the backend)
```

### 5. Verify
```bash
npm run typecheck
npm test
npm run build
```

## API Contract
All responses use `{ "success": true, "data": … }` or
`{ "success": false, "error": { "code", "message" } }`.
Shared types live in `shared/contracts.d.ts`.

## Environment Variables
See `.env.example` (backend) and `frontend/.env.example` (frontend).
