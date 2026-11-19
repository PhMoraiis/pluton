import { defineConfig } from 'tsup';

// Bundle de produção da API: `dist/server.js` (ESM). `@pluton/shared` é fonte TS
// do workspace e vai embutido; as dependências do package.json (Prisma, Hono,
// Better Auth...) ficam externas e vêm do node_modules de produção.
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: ['@pluton/shared'],
});
