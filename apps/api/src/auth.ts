import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError } from 'better-auth/api';
import { prisma } from './db';
import { INITIAL_PAYMENT_METHODS } from './payment-method-defaults';

export const auth = betterAuth({
  basePath: '/api/auth',
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
