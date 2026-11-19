import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, type ReactNode, useState } from 'react';
import { useNavigate } from 'react-router';
import { apiFetch } from '../lib/api';
import { authClient, rememberSignedIn } from '../lib/auth-client';
import { useOnline } from '../lib/online';

type SetupStatus = { hasUser: boolean };

const MIN_PASSWORD = 8;

const inputClass =
  'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted outline-none focus:border-[#ffffff40]';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm text-muted">
      {label}
      {children}
    </label>
  );
}

export function LoginPage() {
  const online = useOnline();
  const status = useQuery({
    queryKey: ['setup-status'],
    queryFn: () => apiFetch<SetupStatus>('/api/setup-status'),
    staleTime: 0,
  });

  let content: ReactNode;
  if (status.data) {
    content = status.data.hasUser === false ? <SignUpForm /> : <SignInForm />;
  } else if (status.isError) {
    content = (
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-danger">Não foi possível falar com o servidor.</p>
        <button
          type="button"
          onClick={() => void status.refetch()}
          className="self-start rounded-md border border-line px-3 py-1.5 text-ink hover:bg-hover"
        >
          Tentar de novo
        </button>
      </div>
    );
  } else {
    content = (
      <p className="text-sm text-muted" role="status">
        {online ? 'Carregando…' : 'Sem conexão. Conecte-se à internet para entrar.'}
      </p>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-3xl font-semibold text-ink">Pluton</div>
          <p className="mt-1 text-sm text-muted">Finanças pessoais</p>
        </div>
        {!online && status.data && (
          <p role="status" className="mb-4 rounded-md border border-line px-3 py-2 text-center text-sm text-[#e6c07b]">
            Você está offline. Conecte-se à internet para entrar.
          </p>
        )}
        {content}
      </div>
    </div>
  );
}

function useAfterAuth() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return async () => {
    rememberSignedIn();
    await queryClient.invalidateQueries();
    void navigate('/', { replace: true });
  };
}

function SubmitButton({ children, disabled }: { children: ReactNode; disabled: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="mt-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-danger">
      {message}
    </p>
  );
}

function SignInForm() {
  const online = useOnline();
  const afterAuth = useAfterAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await authClient.signIn.email({ email: email.trim(), password });
      if (res.error) {
        setError(res.error.status === 401 ? 'E-mail ou senha incorretos.' : (res.error.message ?? 'Não foi possível entrar.'));
        return;
      }
      await afterAuth();
    } catch {
      setError('Não foi possível falar com o servidor.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold text-ink">Entrar</h1>
      <Field label="E-mail">
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Senha">
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </Field>
      <FormError message={error} />
      <SubmitButton disabled={!online || submitting}>{submitting ? 'Entrando…' : 'Entrar'}</SubmitButton>
    </form>
  );
}

function SignUpForm() {
  const online = useOnline();
  const afterAuth = useAfterAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await authClient.signUp.email({ name: name.trim(), email: email.trim(), password });
      if (res.error) {
        setError(res.error.message ?? 'Não foi possível criar a conta.');
        // Ex.: conta criada em outra aba — atualiza para mostrar o formulário de entrar.
        if (res.error.status === 403) void queryClient.invalidateQueries({ queryKey: ['setup-status'] });
        return;
      }
      await afterAuth();
    } catch {
      setError('Não foi possível falar com o servidor.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-ink">Criar conta</h1>
        <p className="mt-1 text-sm text-muted">Primeiro acesso: crie a conta única deste Pluton.</p>
      </div>
      <Field label="Nome">
        <input
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="E-mail">
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Senha">
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
        <span className="text-xs text-muted">Mínimo de {MIN_PASSWORD} caracteres.</span>
      </Field>
      <FormError message={error} />
      <SubmitButton disabled={!online || submitting}>{submitting ? 'Criando…' : 'Criar conta'}</SubmitButton>
    </form>
  );
}
