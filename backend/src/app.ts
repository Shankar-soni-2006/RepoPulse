import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { errorMiddleware, notFoundMiddleware } from './middleware/error';
import { sessionMiddleware } from './middleware/session';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import repositoriesRouter from './routes/repositories';
import pullRequestsRouter from './routes/pullRequests';
import { pullRequestDetailRouter } from './routes/pullRequests';
import contributorsRouter from './routes/contributors';
import analyticsRouter from './routes/analytics';
import aiRouter from './routes/ai';

const app = express();

// ---- Core middleware ----
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));

// Raw body for webhook signature validation — must come before json()
app.use('/api/webhooks', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(sessionMiddleware);

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
