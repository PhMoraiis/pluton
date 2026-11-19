import { existsSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma 7 não carrega .env sozinho: usa o .env da raiz do monorepo, se existir.
const rootEnv = path.resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // `prisma generate` não precisa de banco; migrate/deploy exigem DATABASE_URL.
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
