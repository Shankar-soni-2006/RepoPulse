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
import webhooksRouter from './routes/webhooks.js';
import adminRouter from './routes/admin.js';
import teamRouter from './routes/team.js';

const app = express();

// ---- Core middleware ----
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));

// Raw bytes for webhook signature verification — must come before json(). Any content
// type is accepted here so the handler can reject non-JSON deliveries with a clear 415.
app.use('/api/webhooks', express.raw({ type: () => true, limit: '5mb' }));

app.use(express.json());

// Session cookie → req.auth (routes decide whether auth is required)
app.use(authenticate);

// CSRF guard for cookie-authenticated mutations (webhooks authenticate by signature instead)
app.use(['/api/auth', '/api/repositories', '/api/pull-requests', '/api/ai', '/api/admin'], requireClientHeader);

// ---- Routes ----
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/repositories', repositoriesRouter);
app.use('/api/repositories/:repositoryId/pull-requests', pullRequestsRouter);
app.use('/api/repositories/:repositoryId/contributors', contributorsRouter);
app.use('/api/repositories/:repositoryId', analyticsRouter);
app.use('/api/pull-requests', pullRequestDetailRouter);
app.use('/api/ai', aiRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/admin', adminRouter);
app.use('/api/team', teamRouter);

// ---- Unknown routes / error handler (must be last) ----
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
