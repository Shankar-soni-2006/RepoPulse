import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../supabase/migrations',
);

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
}

export function readMigration(file: string): string {
  // gen_random_uuid() is core since PG13; PGlite has no pgcrypto extension
  return readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8').replace(
    /create extension if not exists "pgcrypto";/i,
    '',
  );
}

/** A fresh in-process Postgres with every migration applied. */
export async function migratedDb(): Promise<PGlite> {
  const db = new PGlite();
  for (const f of migrationFiles()) await db.exec(readMigration(f));
  return db;
}
