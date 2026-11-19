import { defineConfig } from 'vitest/config';

// Banco de testes local (docker-compose.dev.yml). As credenciais postgres/postgres
// são placeholders INSEGUROS de uso local; sobrescreva com DATABASE_URL_TEST.
const testDatabaseUrl =
  process.env.DATABASE_URL_TEST ?? 'postgresql://postgres:postgres@localhost:5433/pluton_test';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globals: false,
    globalSetup: ['test/global-setup.ts'],
    // Todos os arquivos compartilham o mesmo banco: execução serial.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      // Segredo SÓ para testes — inseguro, nunca usar fora da suíte.
      BETTER_AUTH_SECRET: 'test-only-insecure-secret-not-for-production',
      BETTER_AUTH_URL: 'http://localhost:3000',
    },
  },
});
