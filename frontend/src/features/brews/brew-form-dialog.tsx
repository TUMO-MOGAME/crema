import {
  createBrewSchema,
  type Brew,
  type BrewField,
  type BrewMethod,
  type BrewProposal,
  type CreateBrewInput,
} from '@crema/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm, type DefaultValues } from 'react-hook-form';
import { Button } from '../../components/button';
import { Dialog } from '../../components/dialog';
import { CONTROL_CLASS, Field } from '../../components/field';
import { QuickLogPanel } from '../coach/quick-log-panel';
import { useAiEnabled } from '../coach/use-ai';
import { ApiError } from '../../lib/api-client';

/**
 * Add and edit, as wireframe 2 draws them — one component, because the two
 * screens differ by a title, a Delete button and whether the fields start full.
 *
 * The form is driven by `createBrewSchema` from `@crema/shared`, the same
 * schema the API validates with. That is the contract doing its job: the brief
 * requires that a blank field cannot be submitted, and the rule that enforces
 * it is written once. A field that trims to nothing fails here before a request
 * is made, and would fail identically at the API if one were.
 */

interface BrewFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** Absent for add, present for edit. */
  brew?: Brew | undefined;
  methods: BrewMethod[];
  onSubmit: (values: CreateBrewInput) => Promise<unknown>;
  onDelete?: (() => void) | undefined;
  pending: boolean;
  error: unknown;
  /**
   * The last quick-log proposal applied to the form, or null when the fields
   * hold only what a person typed. Owned by the parent rather than here,
   * because clearing it belongs to the events that open and close the dialog —
   * the same clicks that decide which brew the form is about.
   */
  proposal: BrewProposal | null;
  onProposal: (proposal: BrewProposal) => void;
}

export function BrewFormDialog({
  open,
  onClose,
  brew,
  methods,
  onSubmit,
  onDelete,
  pending,
  error,
  proposal,
  onProposal,
}: BrewFormDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    getValues,
    formState: { errors, dirtyFields },
  } = useForm<CreateBrewInput>({
    resolver: zodResolver(createBrewSchema),
    // Validate as soon as a field is left, so the first Save is not the first
    // time anyone hears about a problem.
    mode: 'onTouched',
  });

  const aiEnabled = useAiEnabled();

  const applyProposal = (next: BrewProposal) => {
    // Merge over what is already typed, but never carry a previous proposal's
    // brewedAt into this one — it has no visible control, so a stale value
    // would be submitted with nothing on screen saying so.
    const { brewedAt: _stale, ...current } = getValues();

    // A field the model did not mention must stay what the person typed, so
    // only fields with values take part in the merge — spreading the partial
    // as-is would let an explicit undefined overwrite a typed one.
    const proposed = Object.fromEntries(
      Object.entries(next.brew).filter(([, value]) => value !== undefined),
    ) as Partial<CreateBrewInput>;

    reset({ ...current, ...proposed });
    onProposal(next);
  };

  /**
   * Marked while the control still holds the model's guess, untouched. The
   * mark comes off the moment the reader edits the field, which `dirtyFields`
   * already tracks against the reset the proposal arrived in.
   */
  const inferred = (field: BrewField): boolean =>
    proposal !== null &&
    proposal.inferred.includes(field) &&
    !(field in dirtyFields) &&
    !(field in errors);

  // Reopening for a different brew has to reload the fields; without this the
  // dialog would show whichever brew was opened first, for the whole session.
  useEffect(() => {
    if (!open) return;

    // `DefaultValues` rather than the input type: an empty Add form legitimately
    // has no method and no doses yet, and the schema type says those are
    // required — which they are, at submit, which is where it is checked.
    const values: DefaultValues<CreateBrewInput> = brew
      ? {
          beans: brew.beans,
          method: brew.method,
          coffeeGrams: brew.coffeeGrams,
          waterGrams: brew.waterGrams,
          rating: brew.rating,
          tastingNotes: brew.tastingNotes,
        }
      : { beans: '', tastingNotes: '' };

    reset(values);
  }, [open, brew, reset]);

  /**
   * A 400 or 422 from the API names the field it refused. Routing those back
   * onto the inputs means a rule the client does not know about — the semantic
   * ones, water against coffee — still lands on the right control rather than
   * as a banner the reader has to map onto a field themselves.
   */
  useEffect(() => {
    if (!(error instanceof ApiError)) return;

    for (const detail of error.details) {
      if (detail.field in createBrewSchema.shape) {
        setError(detail.field as keyof CreateBrewInput, { message: detail.message });
      }
    }
  }, [error, setError]);

  const submit = handleSubmit(async (values) => {
    await onSubmit(values);
  });

  const bannerMessage = unfieldedMessage(error);

  return (
    <Dialog open={open} onClose={onClose} title={brew ? 'Edit a brew' : 'Add a brew'}>
      {/*
        Add only. Editing starts from a brew somebody already confirmed, and
        overwriting their record from a sentence is not this feature's job.
      */}
      {!brew && aiEnabled && <QuickLogPanel onProposal={applyProposal} />}

      <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-1">
        <Field
          label="Beans"
          error={errors.beans?.message}
          badge={inferred('beans') ? 'inferred' : undefined}
        >
          {(props) => (
            <input
              {...props}
              {...register('beans')}
              data-inferred={inferred('beans') || undefined}
              className={CONTROL_CLASS}
              autoComplete="off"
            />
          )}
        </Field>

        <Field
          label="Method"
          error={errors.method?.message}
          badge={inferred('method') ? 'inferred' : undefined}
        >
          {(props) => (
            <select
              {...props}
              {...register('method')}
              data-inferred={inferred('method') || undefined}
              className={CONTROL_CLASS}
              defaultValue=""
            >
              <option value="" disabled>
                Select a method
              </option>
              {methods.map((method) => (
                <option key={method.slug} value={method.slug}>
                  {method.label}
                </option>
              ))}
            </select>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Coffee grams"
            error={errors.coffeeGrams?.message}
            badge={inferred('coffeeGrams') ? 'inferred' : undefined}
          >
            {(props) => (
              <input
                {...props}
                {...register('coffeeGrams', { valueAsNumber: true })}
                data-inferred={inferred('coffeeGrams') || undefined}
                type="number"
                step="0.1"
                inputMode="decimal"
                className={`${CONTROL_CLASS} tabular`}
              />
            )}
          </Field>

          <Field
            label="Water grams"
            error={errors.waterGrams?.message}
            badge={inferred('waterGrams') ? 'inferred' : undefined}
          >
            {(props) => (
              <input
                {...props}
                {...register('waterGrams', { valueAsNumber: true })}
                data-inferred={inferred('waterGrams') || undefined}
                type="number"
                step="1"
                inputMode="decimal"
                className={`${CONTROL_CLASS} tabular`}
              />
            )}
          </Field>
        </div>

        <Field
          label="Rating (out of 5)"
          error={errors.rating?.message}
          badge={inferred('rating') ? 'inferred' : undefined}
        >
          {(props) => (
            <input
              {...props}
              {...register('rating', { valueAsNumber: true })}
              data-inferred={inferred('rating') || undefined}
              type="number"
              min={1}
              max={5}
              step={1}
              className={`${CONTROL_CLASS} tabular`}
            />
          )}
        </Field>

        <Field
          label="Tasting notes"
          error={errors.tastingNotes?.message}
          badge={inferred('tastingNotes') ? 'inferred' : undefined}
        >
          {(props) => (
            <input
              {...props}
              {...register('tastingNotes')}
              data-inferred={inferred('tastingNotes') || undefined}
              className={CONTROL_CLASS}
              autoComplete="off"
            />
          )}
        </Field>

        {/*
          The one proposed field with no control of its own. Saying it here is
          what keeps the submitted brew and the visible form the same claim —
          a value that rode along silently would be exactly the surprise the
          confirmation step exists to prevent.
        */}
        {proposal?.brew.brewedAt && (
          <p className="text-small text-ink-muted">
            Will be logged as brewed {formatBrewedAt(proposal.brew.brewedAt)}.
          </p>
        )}

        {bannerMessage && (
          <p role="alert" className="text-small text-danger mb-2">
            {bannerMessage}
          </p>
        )}

        <div className="mt-2 flex items-center justify-end gap-3">
          {onDelete && (
            <Button variant="danger" onClick={onDelete} className="mr-auto">
              Delete
            </Button>
          )}

          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>

          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** A proposed brew time, in the reader's locale rather than as an ISO string. */
function formatBrewedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * The part of a failure no field can show.
 *
 * Anything the API blamed on a field is already on that field, so repeating it
 * in a banner would say the same thing twice. What is left — a network failure,
 * a 500, a rate limit — has nowhere else to go.
 */
function unfieldedMessage(error: unknown): string | null {
  if (!error) return null;
  if (!(error instanceof ApiError)) return 'Something went wrong. Try again.';
  if (error.details.length > 0) return null;

  return error.message;
}
