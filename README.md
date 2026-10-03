# RepoPulse — GitHub Engineering Intelligence Platform

## Overview
RepoPulse connects to GitHub, synchronizes repository activity, calculates engineering metrics, and provides AI-assisted analysis of engineering trends.

## Stack
- **Frontend**: React + Vite + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Node.js + Express + TypeScript + Octokit
- **Database**: Supabase (PostgreSQL)
- **Cache**: Upstash Redis
- **AI**: Google Gemini API

## Project Structure
```
repopulse/
├── frontend/       # React + Vite frontend
├── backend/        # Express API server
├── supabase/       # Database migrations
└── scripts/        # Utility scripts
```

## Setup

### 1. Clone and install
```bash
git clone <repo>
cd repopulse

# Install backend deps
cd backend && npm install

# Install frontend deps
cd ../frontend && npm install
```

### 2. Configure environment
```bash
cp .env.example backend/.env
# Fill in all required values
```

### 3. Run database migrations
```bash
# Apply migrations via Supabase CLI or dashboard
```

### 4. Start development
```bash
# Backend
cd backend && npm run dev

# Frontend
cd frontend && npm run dev
```

## Environment Variables
See `.env.example` for all required variables.
