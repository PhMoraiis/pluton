import type { DeleteScope, EditScope, EntryDTO, EntryKind, PaymentMethodDTO, TagDTO } from '@pluton/shared';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { draftFromEntry, draftToPatch, type EntryDraft } from '../lib/entryDraft';
import {
  useDeleteEntry,
  useEndSeries,
  usePayEntry,
  useUpdateEntry,
  type EntryPatch,
} from '../lib/entryMutations';
import { friendlyError } from '../lib/errors';
import { EndSeriesDialog } from './EndSeriesDialog';
import { EntrySheet } from './EntrySheet';
import { ScopeDialog, type ScopeOption } from './ScopeDialog';
import { UndoToast } from './UndoToast';

export interface EntryActionsValue {
  canWrite: boolean;
  methods: Map<string, PaymentMethodDTO>;
  tags: Map<string, TagDTO>;
  /** Salva um patch; em série pergunta antes `Só esta` / `Esta e as próximas`. */
  edit: (entry: EntryDTO, patch: EntryPatch) => void;
  /** Abre o formulário completo do lançamento. */
  openEditor: (entry: EntryDTO) => void;
  remove: (entry: EntryDTO) => void;
  endSeries: (entry: EntryDTO) => void;
  setPaid: (entry: EntryDTO, paid: boolean) => void;
  showError: (message: string) => void;
}

const Ctx = createContext<EntryActionsValue | null>(null);

export function useEntryActions(): EntryActionsValue {
  const value = useContext(Ctx);
  if (!value) throw new Error('useEntryActions fora de EntryActionsProvider');
  return value;
}

const EDIT_OPTIONS: ScopeOption<EditScope>[] = [
  { value: 'this', label: 'Só esta' },
  { value: 'following', label: 'Esta e as próximas' },
];
const DELETE_OPTIONS: ScopeOption<DeleteScope>[] = [
  { value: 'this', label: 'Só esta', danger: true },
  { value: 'following', label: 'Esta e as próximas', danger: true },
  { value: 'series', label: 'Série inteira', danger: true },
];
const CONFIRM_DELETE: ScopeOption<'this'>[] = [{ value: 'this', label: 'Excluir', danger: true }];

type Deleting = { entry: EntryDTO; step: 'scope' | 'confirm' | 'confirm-paid' };

interface Props {
  kind: EntryKind;
  canWrite: boolean;
  methods: Map<string, PaymentMethodDTO>;
  tags: Map<string, TagDTO>;
  children: ReactNode;
}

/** Ações de escrita dos lançamentos + diálogos, toast de desfazer e mensagens de erro. */
export function EntryActionsProvider({ kind, canWrite, methods, tags, children }: Props) {
  const update = useUpdateEntry();
  const del = useDeleteEntry();
  const pay = usePayEntry();
  const end = useEndSeries();

  const [editing, setEditing] = useState<{ entry: EntryDTO; patch: EntryPatch } | null>(null);
  const [sheet, setSheet] = useState<{ entry: EntryDTO; error: string | null } | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const [ending, setEnding] = useState<EntryDTO | null>(null);
  const [undo, setUndo] = useState<{ entry: EntryDTO; at: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fail = (e: unknown) => setError(friendlyError(e));

  // `mutateAsync` (e não callbacks do `mutate`): os callbacks por chamada só disparam
  // para a última chamada do observer, e duas linhas pagas em sequência perderiam o erro.
  function saveEdit(entry: EntryDTO, patch: EntryPatch, scope?: EditScope) {
    if (!canWrite) return;
    setError(null);
    update.mutateAsync({ id: entry.id, scope, patch }).catch(fail);
  }

  function deleteNow(entry: EntryDTO, scope: DeleteScope) {
    if (!canWrite) return;
    setDeleting(null);
    setError(null);
    del.mutateAsync({ id: entry.id, scope }).catch(fail);
  }

  const value: EntryActionsValue = {
    canWrite,
    methods,
    tags,
    edit(entry, patch) {
      if (!canWrite || Object.keys(patch).length === 0) return;
      if (entry.seriesId) setEditing({ entry, patch });
      else saveEdit(entry, patch);
    },
    openEditor(entry) {
      if (canWrite) setSheet({ entry, error: null });
    },
    remove(entry) {
      if (!canWrite) return;
      const step = entry.seriesId ? 'scope' : entry.paidOn ? 'confirm-paid' : 'confirm';
      setDeleting({ entry, step });
    },
    endSeries(entry) {
      if (canWrite && entry.seriesType === 'MONTHLY') setEnding(entry);
    },
    setPaid(entry, paid) {
      if (!canWrite) return;
      setError(null);
      pay.mutateAsync({ entry, paid }).then(() => {
        if (paid) setUndo({ entry, at: Date.now() });
      }, fail);
    },
    showError: setError,
  };

  function submitSheet(entry: EntryDTO, draft: EntryDraft) {
    const result = draftToPatch(entry, draft, methods);
    if (!result.ok) return setSheet({ entry, error: result.error });
    setSheet(null);
    value.edit(entry, result.value);
  }

  const paidLabel = kind === 'EXPENSE' ? 'pago' : 'recebido';

  return (
    <Ctx.Provider value={value}>
      {children}

      {editing && (
        <ScopeDialog
          title="Aplicar alteração"
          message={`“${editing.entry.displayName}” faz parte de uma série.`}
          options={EDIT_OPTIONS}
          disabled={!canWrite}
          onCancel={() => setEditing(null)}
          onChoose={(scope) => {
            if (!canWrite) return;
            saveEdit(editing.entry, editing.patch, scope);
            setEditing(null);
          }}
        />
      )}

      {deleting?.step === 'scope' && (
        <ScopeDialog
          title="Excluir lançamento"
          message="Lançamentos já pagos são preservados em “Esta e as próximas” e “Série inteira”."
          options={DELETE_OPTIONS}
          disabled={!canWrite}
          onCancel={() => setDeleting(null)}
          onChoose={(scope) => {
            if (!canWrite) return;
            if (scope === 'this' && deleting.entry.paidOn) setDeleting({ entry: deleting.entry, step: 'confirm-paid' });
            else deleteNow(deleting.entry, scope);
          }}
        />
      )}
      {(deleting?.step === 'confirm' || deleting?.step === 'confirm-paid') && (
        <ScopeDialog
          title="Excluir lançamento"
          message={
            deleting.step === 'confirm-paid'
              ? 'Este lançamento já foi pago. Excluir mesmo assim?'
              : `Excluir “${deleting.entry.displayName}”?`
          }
          options={CONFIRM_DELETE}
          disabled={!canWrite}
          onCancel={() => setDeleting(null)}
          onChoose={() => deleteNow(deleting.entry, 'this')}
        />
      )}

      {ending && (
        <EndSeriesDialog
          entry={ending}
          canWrite={canWrite}
          onCancel={() => setEnding(null)}
          onConfirm={(lastMonth) => {
            if (!canWrite) return;
            setEnding(null);
            setError(null);
            end.mutateAsync({ seriesId: ending.seriesId!, lastMonth }).catch(fail);
          }}
        />
      )}

      {sheet && (
        <EntrySheet
          mode="edit"
          initial={draftFromEntry(sheet.entry)}
          methods={[...methods.values()]}
          canWrite={canWrite}
          error={sheet.error}
          onSubmit={(draft) => submitSheet(sheet.entry, draft)}
          onCancel={() => setSheet(null)}
          onDelete={() => {
            setSheet(null);
            value.remove(sheet.entry);
          }}
          onEndSeries={
            sheet.entry.seriesType === 'MONTHLY'
              ? () => {
                  setSheet(null);
                  value.endSeries(sheet.entry);
                }
              : undefined
          }
        />
      )}

      {undo && (
        <UndoToast
          key={undo.at}
          message={`“${undo.entry.displayName}” marcado como ${paidLabel}`}
          disabled={!canWrite}
          onClose={() => setUndo(null)}
          onUndo={() => {
            setUndo(null);
            value.setPaid(undo.entry, false);
          }}
        />
      )}

      {error && (
        <div
          role="alert"
          className="fixed inset-x-4 bottom-[calc(12rem+env(safe-area-inset-bottom))] z-40 md:bottom-24 mx-auto flex max-w-md items-start gap-3 rounded-lg border border-danger/50 bg-surface px-4 py-3 text-sm text-danger shadow-xl"
        >
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-muted hover:text-ink">
            Fechar
          </button>
        </div>
      )}
    </Ctx.Provider>
  );
}
