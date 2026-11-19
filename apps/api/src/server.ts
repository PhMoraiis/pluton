import { serve } from '@hono/node-server';
import { createApp } from './app';
import { prisma } from './db';
import { resolveWebDist } from './web';

const port = Number(process.env.PORT ?? 3000);
const webDist = resolveWebDist(process.env);

const server = serve({ fetch: createApp({ webDist }).fetch, port }, (info) => {
  console.log(`Pluton ouvindo em http://localhost:${info.port}${webDist ? ` (PWA de ${webDist})` : ''}`);
});

/** Tempo máximo para as requisições em andamento terminarem antes de sair à força. */
const SHUTDOWN_TIMEOUT_MS = 10_000;
let shuttingDown = false;

/**
 * Desligamento gracioso (redeploy do Dokploy manda SIGTERM): para de aceitar conexões,
 * espera as requisições em andamento, desconecta o Prisma e sai — sem esperar o SIGKILL.
 */
function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} recebido: encerrando o Pluton...`);

  const force = setTimeout(() => {
    console.error('Encerramento demorou demais; saindo à força.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  force.unref();

  server.close((closeError) => {
    if (closeError) console.error('Erro ao fechar o servidor HTTP:', closeError);
    prisma
      .$disconnect()
      .catch((error: unknown) => console.error('Erro ao desconectar o Prisma:', error))
      .finally(() => process.exit(closeError ? 1 : 0));
  });
  // Conexões keep-alive ociosas não seguram o `close`.
  if ('closeIdleConnections' in server) server.closeIdleConnections();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
