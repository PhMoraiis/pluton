import { NavLink, Outlet } from 'react-router';
import { useOnline } from '../lib/online';
import { useSignOut } from '../lib/useSignOut';
import { OfflineBanner } from './OfflineBanner';

export const NAV_ITEMS = [
  { to: '/', label: 'Despesas', end: true },
  { to: '/ganhos', label: 'Ganhos' },
  { to: '/historico', label: 'Histórico' },
  { to: '/periodo', label: 'Período' },
  { to: '/importar', label: 'Importar' },
  { to: '/configuracoes', label: 'Configurações' },
] as const;

function navClass({ isActive }: { isActive: boolean }): string {
  return [
    'rounded-md px-2.5 py-1.5 text-sm transition-colors',
    isActive ? 'bg-hover text-ink font-medium' : 'text-muted hover:bg-hover hover:text-ink',
  ].join(' ');
}

function tabClass({ isActive }: { isActive: boolean }): string {
  return [
    'flex flex-1 items-center justify-center px-1 py-2 text-[11px] leading-tight text-center',
    isActive ? 'text-ink font-medium' : 'text-muted',
  ].join(' ');
}

export function Layout() {
  const online = useOnline();
  const { signOut, signingOut } = useSignOut();

  const signOutButton = (
    <button
      type="button"
      onClick={signOut}
      disabled={!online || signingOut}
      className="rounded-md px-2.5 py-1.5 text-left text-sm text-muted hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
    >
      Sair
    </button>
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <OfflineBanner />
      <div className="flex flex-1">
        <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r border-line bg-surface p-3 md:flex">
          <div className="px-2.5 pb-3 pt-1 text-sm font-semibold text-ink">Pluton</div>
          <nav className="flex flex-col gap-0.5" aria-label="Principal">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={'end' in item} className={navClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto flex flex-col">{signOutButton}</div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-line px-4 py-2 md:hidden">
            <span className="text-sm font-semibold text-ink">Pluton</span>
            {signOutButton}
          </header>
          <main className="flex-1 px-4 pb-24 pt-6 md:px-10 md:pb-10">
            <Outlet />
          </main>
        </div>
      </div>

      <nav
        aria-label="Principal (celular)"
        className="fixed inset-x-0 bottom-0 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={'end' in item} className={tabClass}>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
