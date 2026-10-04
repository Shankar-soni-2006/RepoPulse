import { App } from '@octokit/app';
import { env } from '../config/env.js';

// Normalize the private key — environment variables may have literal \n
const privateKey = env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n');

export const githubAppCredentials = {
  appId: env.GITHUB_APP_ID,
  privateKey,
};

export const githubApp = new App({
  appId: env.GITHUB_APP_ID,
  privateKey,
  oauth: {
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
  },
  webhooks: {
    secret: env.GITHUB_WEBHOOK_SECRET,
  },
});
