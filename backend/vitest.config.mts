import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Placeholder config so src/config/env.ts validates. Tests must stub or avoid
    // external calls — these values never reach a real service.
    env: {
      NODE_ENV: 'test',
      GITHUB_APP_ID: '1',
      GITHUB_APP_PRIVATE_KEY: 'test-private-key',
      GITHUB_CLIENT_ID: 'test-client-id',
      GITHUB_CLIENT_SECRET: 'test-client-secret',
      GITHUB_WEBHOOK_SECRET: 'test-webhook-secret',
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      FRONTEND_URL: 'http://localhost:5173',
      BACKEND_URL: 'http://localhost:3001',
    },
  },
});
