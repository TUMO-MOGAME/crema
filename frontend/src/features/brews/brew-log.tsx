import type { Brew, BrewMethodSlug, BrewProposal, CreateBrewInput } from '@crema/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../../components/button';
import { OfflineBanner } from '../../components/offline-banner';
import { ThemeToggle } from '../../components/theme-toggle';
import { useToast } from '../../components/toast-context';
import { brewCountTitle, useDocumentTitle } from '../../hooks/use-document-title';
import { ApiError } from '../../lib/api-client';
import { aiApi } from '../coach/ai-api';
import { CoachDialog } from '../coach/coach-dialog';
import { useAiEnabled } from '../coach/use-ai';
import { BrewFormDialog } from './brew-form-dialog';
import { brewKeys } from './brews-api';
import { BrewRow } from './brew-row';
import { DeleteConfirmDialog } from './delete-confirm-dialog';
import { MethodFilter } from './method-filter';
import { useBrewMethods, useBrews, useCreateBrew, useDeleteBrew, useUpdateBrew } from './use-brews';

/**
 * The brew log — wireframe 1, and the dialogs it opens.
 *
 * One column, centred, with the width capped at something readable. A log is
 * read down, so the extra room on a wide screen goes into breathing space
 * rather than into columns that would break the scan.
 */
export function BrewLog() {
  const [method, setMethod] = useState<BrewMethodSlug | ''>('');
  const [editing, setEditing] = useState<Brew | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<Brew | null>(null);

  /**
   * The proposal the form is currently showing, if any. It lives here rather
   * than in the dialog because its lifetime is the dialog *session*, and the
   * sessions begin and end in these handlers: opening the form for anything
   * starts clean, so one proposal's guesses can never mark another brew's
   * fields.
   *
   * `seed` is the coach's half of the same idea — the proposal the Add form
   * opens on. Two states because they change at different moments: Quick Log
   * sets `proposal` mid-session while `seed` stays put, which is exactly what
   * lets the form's open-effect depend on `seed` without ever clobbering a
   * half-typed form.
   */
  const [proposal, setProposal] = useState<BrewProposal | null>(null);
  const [seed, setSeed] = useState<BrewProposal | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);
  const aiEnabled = useAiEnabled();

  const brews = useBrews(method || undefined);
  const methods = useBrewMethods();
  const toast = useToast();
  const client = useQueryClient();
  const create = useCreateBrew();
  const update = useUpdateBrew();
  const remove = useDeleteBrew();

  // The brief asks for the count in the page title, and it has to follow the
  // whole log rather than the filter — `Brews: 3` while filtered to three of
  // twelve would be a different claim than the one intended.
  //
  // The unfiltered total is read from a page-sized request rather than by
  // loading every brew: the response says how many matched, so counting costs
  // one page and not the log.
  const unfiltered = useBrews();
  useDocumentTitle(brewCountTitle(unfiltered.total));

  const dialogOpen = adding || editing !== null;

  const openAdd = () => {
    setProposal(null);
    setSeed(null);
    setAdding(true);
  };

  const openEdit = (brew: Brew) => {
    setProposal(null);
    setSeed(null);
    setEditing(brew);
  };

  /** The coach's hand-off: its candidate becomes the Add form's starting point. */
  const openAddFromCoach = (candidate: BrewProposal) => {
    setCoachOpen(false);
    setProposal(candidate);
    setSeed(candidate);
    setAdding(true);
  };

  const closeForm = () => {
    setAdding(false);
    setEditing(null);
    setProposal(null);
    setSeed(null);
    create.reset();
    update.reset();
  };

  /**
   * The dialog closes on success and stays open on failure.
   *
   * The catch is not swallowing the error — React Query holds it, and it is
   * rendered on the offending field or as a banner. What it prevents is the
   * rejection escaping into an unhandled promise, and the form closing over
   * work the server refused to keep.
   *
   * No toast on failure here, because the dialog is still open and already says
   * what went wrong, on the field that caused it. Two accounts of one failure
   * is worse than one.
   */
  const save = async (values: CreateBrewInput) => {
    const editingNow = editing !== null;

    try {
      const saved = editing
        ? await update.mutateAsync({ brew: editing, changes: values })
        : await create.mutateAsync(values);

      closeForm();
      toast.show(editingNow ? 'Brew updated.' : 'Brew added.');
      tagFlavours(saved.id);
    } catch {
      // Left open, with the reason attached to the field that caused it.
    }
  };

  /**
   * The one AI call nobody waits on. Fired after a save succeeds, in its own
   * request, so a slow model can never make saving feel slow — and dropped
   * silently on failure, because the tags are an index over the notes and the
   * notes themselves are already safe. PLANNING 6.3 is the position: notes
   * normalise into the vocabulary on save, carrying `source: 'ai'`.
   */
  const tagFlavours = (brewId: string) => {
    if (!aiEnabled) return;

    void aiApi
      .extractFlavorTags(brewId)
      .then(() => client.invalidateQueries({ queryKey: brewKeys.flavorTags(brewId) }))
      .catch(() => undefined);
  };

  /**
   * Deleting says something either way, and that is what optimism costs.
   *
   * The row leaves the list the moment this is confirmed, before the server has
   * agreed. If the server then refuses, the rollback puts it back — and a brew
   * that disappears and returns on its own, with nothing said, reads as a bug
   * rather than as a save that did not happen.
   */
  const confirmDelete = async () => {
    if (!deleting) return;
    const beans = deleting.beans;

    try {
      await remove.mutateAsync(deleting);
      setDeleting(null);
      closeForm();
      toast.show(`${beans} deleted.`);
    } catch (error) {
      setDeleting(null);
      closeForm();
      toast.show(deleteFailure(error, beans), 'danger');
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-5 py-10 sm:px-8 sm:py-14">
      <div className="flex justify-end">
        <ThemeToggle />
      </div>

      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-ink-strong text-display font-bold tracking-[-0.03em]">
          Brew log
        </h1>

        <div className="flex items-center gap-2">
          {aiEnabled && (
            <Button variant="quiet" onClick={() => setCoachOpen(true)}>
              Coach
            </Button>
          )}
          <Button onClick={openAdd}>Add</Button>
        </div>
      </header>

      <OfflineBanner />

      <MethodFilter methods={methods.data ?? []} value={method} onChange={setMethod} />

      {/*
        The live region is a one-line summary, not the list.

        `aria-live` used to sit on the section wrapping everything, so changing
        the filter re-announced all twelve rows — the assistive equivalent of
        reading the page aloud from the top every time you narrow it. What a
        reader needs to hear is what changed and how much of it there now is;
        the rows themselves are there to be navigated, not recited.
      */}
      <p role="status" aria-live="polite" aria-label="Brew list" className="sr-only">
        {listStatus(brews, method)}
      </p>

      <section aria-busy={brews.isPending}>
        {brews.isPending && <Skeletons />}

        {brews.isError && (
          <ErrorState message={brews.error.message} onRetry={() => void brews.refetch()} />
        )}

        {brews.isSuccess &&
          (brews.brews.length === 0 ? (
            <EmptyState method={method} onClearFilter={() => setMethod('')} />
          ) : (
            <>
              <ul className="border-hairline border-t">
                {brews.brews.map((brew, index) => (
                  <BrewRow key={brew.id} brew={brew} index={index} onEdit={openEdit} />
                ))}
              </ul>

              {brews.hasNextPage && (
                <div className="flex flex-col items-center gap-2 pt-6">
                  <Button
                    variant="quiet"
                    onClick={() => void brews.fetchNextPage()}
                    disabled={brews.isFetchingNextPage}
                  >
                    {brews.isFetchingNextPage ? 'Loading…' : 'Load more'}
                  </Button>
                  {/* Says how far through the log you are, so "Load more" is a
                      known quantity rather than an open-ended one. */}
                  <p className="text-ink-muted text-micro tabular">
                    Showing {brews.brews.length} of {brews.total}
                  </p>
                </div>
              )}
            </>
          ))}
      </section>

      <BrewFormDialog
        open={dialogOpen}
        onClose={closeForm}
        brew={editing ?? undefined}
        methods={methods.data ?? []}
        onSubmit={save}
        onDelete={editing ? () => setDeleting(editing) : undefined}
        pending={create.isPending || update.isPending}
        error={create.error ?? update.error}
        proposal={proposal}
        onProposal={setProposal}
        seed={seed}
      />

      <CoachDialog
        open={coachOpen}
        onClose={() => setCoachOpen(false)}
        onProposal={openAddFromCoach}
      />

      <DeleteConfirmDialog
        brew={deleting}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        pending={remove.isPending}
      />
    </main>
  );
}

/**
 * Why a delete did not happen, in the words the reader needs.
 *
 * The API's own message is used when there is one — it is written for a person
 * and is more specific than anything that could be reconstructed here. A brew
 * already gone is the one case worth rewording, because "not found" describes
 * the request rather than the situation.
 */
function deleteFailure(error: unknown, beans: string): string {
  if (error instanceof ApiError) {
    if (error.code === 'NOT_FOUND') return `${beans} was already deleted.`;
    return `Could not delete ${beans}. ${error.message}`;
  }

  return `Could not delete ${beans}. Try again.`;
}

/**
 * What the live region says.
 *
 * One sentence describing the state of the list: loading, broken, empty, or how
 * much of it is on screen. It is deliberately not the list itself.
 */
function listStatus(brews: ReturnType<typeof useBrews>, method: string): string {
  if (brews.isPending) return 'Loading brews.';
  if (brews.isError) return 'Could not load your brews.';

  if (brews.total === 0) {
    return method ? 'No brews logged with this method.' : 'No brews logged yet.';
  }

  const shown = brews.brews.length;
  const noun = brews.total === 1 ? 'brew' : 'brews';

  return shown < brews.total
    ? `Showing ${shown} of ${brews.total} ${noun}.`
    : `${brews.total} ${noun}.`;
}

/**
 * An empty screen is an invitation, so it says what to do next. The filtered
 * case offers the way out of the filter — otherwise the only clue that twelve
 * brews still exist is remembering you set a filter.
 */
function EmptyState({ method, onClearFilter }: { method: string; onClearFilter: () => void }) {
  if (method) {
    return (
      <div className="border-hairline flex flex-col items-start gap-3 border-t py-16">
        <p className="text-ink text-body">No brews logged with this method yet.</p>
        <Button variant="quiet" onClick={onClearFilter} className="px-0">
          Show all methods
        </Button>
      </div>
    );
  }

  return (
    <div className="border-hairline flex flex-col gap-2 border-t py-16">
      <p className="text-ink-strong text-row font-semibold">Nothing logged yet.</p>
      <p className="text-ink-muted text-body">
        Add your first brew and the ratios start telling you something.
      </p>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    // Named for the same reason the toast regions are: the page now carries
    // several live regions, and "the alert" has to mean one of them.
    <div
      role="alert"
      aria-label="Could not load your brews"
      className="border-hairline flex flex-col items-start gap-3 border-t py-16"
    >
      <p className="text-ink-strong text-row font-semibold">Could not load your brews.</p>
      <p className="text-ink-muted text-body">{message}</p>
      <Button variant="quiet" onClick={onRetry} className="px-0">
        Try again
      </Button>
    </div>
  );
}

/** Row-shaped, so the list does not jump when the data lands. */
function Skeletons() {
  return (
    <ul className="border-hairline border-t" aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <li key={row} className="border-hairline flex items-center gap-4 border-b py-4">
          <div className="bg-sunken size-12 shrink-0 animate-pulse rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <div className="bg-sunken h-5 w-1/2 animate-pulse rounded" />
            <div className="bg-sunken h-6 w-3/4 animate-pulse rounded-full" />
          </div>
        </li>
      ))}
    </ul>
  );
}
