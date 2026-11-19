import { SalarySection } from '../components/settings/SalarySection';
import { MethodsSection } from '../components/settings/MethodsSection';
import { SubscriptionsSection } from '../components/settings/SubscriptionsSection';
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

      <SalarySection />
      <MethodsSection />
      <TagsSection />
      <SubscriptionsSection />

      <div>
        <button type="button" onClick={signOut} disabled={!canWrite || signingOut} className={btn}>
          Sair
        </button>
      </div>
    </section>
  );
}
