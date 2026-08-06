import type { Brew } from '@crema/shared';
import { Button } from '../../components/button';
import { Dialog } from '../../components/dialog';

/**
 * The confirmation before a brew goes.
 *
 * It names the brew rather than asking "are you sure?", because the question
 * worth answering is "sure about which one" — that is the mistake a
 * confirmation exists to catch.
 *
 * The action keeps its name: the control that says Delete produces a dialog
 * whose confirming button also says Delete. A dialog that answered with "OK"
 * would make the reader translate.
 */

interface DeleteConfirmDialogProps {
  brew: Brew | null;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
}

export function DeleteConfirmDialog({
  brew,
  onCancel,
  onConfirm,
  pending,
}: DeleteConfirmDialogProps) {
  return (
    <Dialog open={brew !== null} onClose={onCancel} title="Delete this brew?">
      <div className="flex flex-col gap-6">
        {/*
          "Cannot be undone from here", not "cannot be undone".

          The row is soft-deleted — `deleted_at` is set and the record survives,
          which is what keeps an accidental deletion recoverable and gives the
          AI suggestion trail something to point at. The old wording was true
          about the interface and false about the data, and the difference
          matters to whoever has to answer "is it really gone".
        */}
        <p className="text-body text-ink">
          <span className="text-ink-strong font-semibold">{brew?.beans}</span> and its notes will be
          removed from your log. You cannot undo this from the app.
        </p>

        <div className="flex items-center justify-end gap-3">
          <Button variant="quiet" onClick={onCancel}>
            Cancel
          </Button>

          <Button variant="danger" onClick={onConfirm} disabled={pending}>
            {pending ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
