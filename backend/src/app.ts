import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import { errorMiddleware, notFoundMiddleware } from './middleware/error.js';
import { authenticate, requireClientHeader } from './middleware/auth.js';
import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import repositoriesRouter from './routes/repositories.js';
import pullRequestsRouter from './routes/pullRequests.js';
import { pullRequestDetailRouter } from './routes/pullRequests.js';
import contributorsRouter from './routes/contributors.js';
import analyticsRouter from './routes/analytics.js';
import aiRouter from './routes/ai.js';

const app = express();

// ---- Core middleware ----
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));

// Raw body for webhook signature validation — must come before json()
app.use('/api/webhooks', express.raw({ type: 'application/json' }));

app.use(express.json());

// Session cookie → req.auth (routes decide whether auth is required)
app.use(authenticate);

// CSRF guard for cookie-authenticated mutations (webhooks authenticate by signature instead)
app.use(['/api/auth', '/api/repositories', '/api/pull-requests', '/api/ai'], requireClientHeader);

// ---- Routes ----
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/repositories', repositoriesRouter);
app.use('/api/repositories/:repositoryId/pull-requests', pullRequestsRouter);
app.use('/api/repositories/:repositoryId/contributors', contributorsRouter);
app.use('/api/repositories/:repositoryId/analytics', analyticsRouter);
app.use('/api/pull-requests', pullRequestDetailRouter);
app.use('/api/ai', aiRouter);

// ---- Unknown routes / error handler (must be last) ----
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
