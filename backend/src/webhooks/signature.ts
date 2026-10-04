import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifies GitHub's X-Hub-Signature-256 header (`sha256=<hex HMAC of the raw body>`).
 * Must be given the exact bytes received; re-serialized JSON would not match.
 */
export function verifySignature(secret: string, rawBody: Buffer, header: string | undefined): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const given = Buffer.from(header.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function sign(secret: string, rawBody: Buffer | string): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}
