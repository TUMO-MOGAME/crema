import { createBrewSchema, type Brew, type BrewMethod, type CreateBrewInput } from '@crema/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm, type DefaultValues } from 'react-hook-form';
import { Button } from '../../components/button';
import { Dialog } from '../../components/dialog';
import { CONTROL_CLASS, Field } from '../../components/field';
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
}: BrewFormDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CreateBrewInput>({
    resolver: zodResolver(createBrewSchema),
    // Validate as soon as a field is left, so the first Save is not the first
    // time anyone hears about a problem.
    mode: 'onTouched',
  });

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
      <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-1">
        <Field label="Beans" error={errors.beans?.message}>
          {(props) => (
            <input {...props} {...register('beans')} className={CONTROL_CLASS} autoComplete="off" />
          )}
        </Field>

        <Field label="Method" error={errors.method?.message}>
          {(props) => (
            <select {...props} {...register('method')} className={CONTROL_CLASS} defaultValue="">
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
          <Field label="Coffee grams" error={errors.coffeeGrams?.message}>
            {(props) => (
              <input
                {...props}
                {...register('coffeeGrams', { valueAsNumber: true })}
                type="number"
                step="0.1"
                inputMode="decimal"
                className={`${CONTROL_CLASS} tabular`}
              />
            )}
          </Field>

          <Field label="Water grams" error={errors.waterGrams?.message}>
            {(props) => (
              <input
                {...props}
                {...register('waterGrams', { valueAsNumber: true })}
                type="number"
                step="1"
                inputMode="decimal"
                className={`${CONTROL_CLASS} tabular`}
              />
            )}
          </Field>
        </div>

        <Field label="Rating (out of 5)" error={errors.rating?.message}>
          {(props) => (
            <input
              {...props}
              {...register('rating', { valueAsNumber: true })}
              type="number"
              min={1}
              max={5}
              step={1}
              className={`${CONTROL_CLASS} tabular`}
            />
          )}
        </Field>

        <Field label="Tasting notes" error={errors.tastingNotes?.message}>
          {(props) => (
            <input
              {...props}
              {...register('tastingNotes')}
              className={CONTROL_CLASS}
              autoComplete="off"
            />
          )}
        </Field>

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
