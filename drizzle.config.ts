import type { Config } from 'drizzle-kit';

/**
 * Drizzle Kit config for the A1 progress DB. Regenerate migrations after any
 * change to src/db/schema.ts with:  npm run db:generate
 * (output lands in src/db/migrations and is committed — the app ships them.)
 */
export default {
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
} satisfies Config;
