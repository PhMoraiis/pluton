import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Aplica as migrações versionadas no banco de testes antes da suíte.
export default function setup(): void {
  const databaseUrl =
    process.env.DATABASE_URL_TEST ?? 'postgresql://postgres:postgres@localhost:5433/pluton_test';
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, DATABASE_URL: databaseUrl, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    stdio: 'inherit',
  });
}
