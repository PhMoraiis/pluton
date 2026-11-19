import { serve } from '@hono/node-server';
import { createApp } from './app';
import { resolveWebDist } from './web';

const port = Number(process.env.PORT ?? 3000);
const webDist = resolveWebDist(process.env);

serve({ fetch: createApp({ webDist }).fetch, port }, (info) => {
  console.log(`Pluton ouvindo em http://localhost:${info.port}${webDist ? ` (PWA de ${webDist})` : ''}`);
});
