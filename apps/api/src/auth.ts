import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError } from 'better-auth/api';
import { prisma } from './db';
import { INITIAL_PAYMENT_METHODS } from './payment-method-defaults';

/**
 * Opções `advanced` do Better Auth. Em produção o app fica atrás do Traefik do
 * Dokploy, que descarta os X-Forwarded-For/X-Real-Ip vindos do cliente e grava
 * o IP real: o rate limit passa a ser por IP do cliente, não um balde único.
 * Header com mais de um IP é ignorado pelo Better Auth (sem `trustedProxies`).
 * Cookies `Secure` em produção (HTTPS obrigatório).
 */
export function authAdvancedOptions(nodeEnv: string | undefined) {
  return {
    ipAddress: { ipAddressHeaders: ['x-forwarded-for', 'x-real-ip'] },
    useSecureCookies: nodeEnv === 'production',
  };
}

// A origem confiável é a de BETTER_AUTH_URL: em produção a URL pública (mesma
// origem do PWA e da API); em dev `http://localhost:5173` (proxy do Vite).
export const auth = betterAuth({
  basePath: '/api/auth',
  advanced: authAdvancedOptions(process.env.NODE_ENV),
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  emailAndPassword: { enabled: true },
  // Rate limit padrão do Better Auth (janela/limites default, storage em memória),
  // ligado em dev e produção; desligado só na suíte de testes, que cadastra a
  // conta a cada teste e estouraria o limite de /sign-up (3 por 10 s).
  rateLimit: { enabled: process.env.NODE_ENV !== 'test' },
  databaseHooks: {
    user: {
      create: {
        // Conta única: só aceita cadastro se ainda não existir nenhum usuário.
        before: async () => {
          if ((await prisma.user.count()) > 0) {
            throw new APIError('FORBIDDEN', { message: 'Cadastro desabilitado: já existe uma conta.' });
          }
        },
        after: async (user) => {
          await prisma.paymentMethod.createMany({
            data: INITIAL_PAYMENT_METHODS.map((m, sortOrder) => ({ ...m, sortOrder, userId: user.id })),
          });
        },
      },
    },
  },
});
