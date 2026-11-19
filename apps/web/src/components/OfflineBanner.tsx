import { useOnline } from '../lib/online';

export const OFFLINE_MESSAGE = 'Você está offline — somente leitura';

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="border-b border-line bg-[#2b2416] px-4 py-2 text-center text-sm text-[#e6c07b]"
    >
      {OFFLINE_MESSAGE}
    </div>
  );
}
