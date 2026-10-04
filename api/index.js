// Vercel serverless entry: the whole Express API runs as this one function.
// backend/dist is produced by the build command (tsc) before functions are bundled.
import app from '../backend/dist/app.js';

let helpersWarned = false;

export default function handler(req, res) {
  // Vercel's request helpers read the body before Express can, which breaks JSON parsing
  // and webhook signature checks on raw bytes. They are off when the project sets
  // NODEJS_HELPERS=0; fail clearly if that variable is missing.
  if (Object.getOwnPropertyDescriptor(req, 'body')?.get) {
    if (!helpersWarned) {
      console.error('[vercel] Request helpers are enabled. Set NODEJS_HELPERS=0 in the project environment and redeploy.');
      helpersWarned = true;
    }
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ success: false, error: { code: 'SERVER_MISCONFIGURED', message: 'Server configuration error' } }));
    return;
  }

  // vercel.json rewrites /api/<path> to this function. Vercel passes the original URL;
  // if the rewrite destination (/api?path=<path>) arrives instead, restore the original.
  const url = new URL(req.url ?? '/', 'http://internal');
  if (url.pathname === '/api' && url.searchParams.has('path')) {
    const path = url.searchParams.get('path');
    url.searchParams.delete('path');
    req.url = `/api/${path}${url.search}`;
  }
  return app(req, res);
}
