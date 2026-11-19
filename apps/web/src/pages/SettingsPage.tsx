import { MethodsSection } from '../components/settings/MethodsSection';
import { TagsSection } from '../components/settings/TagsSection';
import { btn } from '../components/settings/styles';
import { useCanWrite } from '../lib/online';
import { useSignOut } from '../lib/useSignOut';

export function SettingsPage() {
  const canWrite = useCanWrite();
  const { signOut, signingOut } = useSignOut();

  return (
    <section aria-label="Configurações" className="flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold text-ink">Configurações</h1>

      <MethodsSection />
      <TagsSection />

      <div>
        <button type="button" onClick={signOut} disabled={!canWrite || signingOut} className={btn}>
          Sair
        </button>
      </div>
    </section>
  );
}
