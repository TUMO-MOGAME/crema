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
import { z } from 'zod';
import { Button } from '../../components/button';
import { Dialog } from '../../components/dialog';
import { CONTROL_CLASS, Field } from '../../components/field';
import { QuickLogPanel } from '../coach/quick-log-panel';
import { useAiEnabled } from '../coach/use-ai';
import { ApiError } from '../../lib/api-client';
import { useFlavorTags } from './use-brews';

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

/**
 * The schema the form validates with: the shared contract, with one seam.
 *
 * The API speaks ISO instants; a `datetime-local` control speaks
 * `2026-08-14T06:30`, in the reader's own timezone, and shows nothing at all
 * if handed an ISO string. So the form holds the control's dialect and this
 * schema translates at the boundary — empty means "not chosen", a local value
 * becomes the instant it names, and anything else falls through to the shared
 * rule so the two sides cannot quietly accept different things.
 */
const brewFormSchema = createBrewSchema.extend({
  brewedAt: z
    .string()
    .optional()
    .transform((value) => localToIso(value))
    .pipe(createBrewSchema.shape.brewedAt),
});

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
  /**
   * A proposal to open *on*, for the coach's hand-off — its fields become the
   * Add form's starting values. Distinct from `proposal` even though the coach
   * sets both, because they answer different questions with different
   * lifetimes: `seed` is what the form starts as and only changes alongside an
   * open, while `proposal` is what the chips mark and also arrives mid-session
   * from Quick Log — which must merge into typed fields, never restart them.
   */
  seed: BrewProposal | null;
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
  seed,
}: BrewFormDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    getValues,
    formState: { errors, dirtyFields },
  } = useForm<CreateBrewInput>({
    resolver: zodResolver(brewFormSchema),
    // Validate as soon as a field is left, so the first Save is not the first
    // time anyone hears about a problem.
    mode: 'onTouched',
  });

  const aiEnabled = useAiEnabled();

  // Edit only — a brew being created has no tags yet, and the extraction that
  // makes them runs after the save this dialog ends with.
  const flavorTags = useFlavorTags(brew?.id);

  const applyProposal = (next: BrewProposal) => {
    // Merge over what is already typed. This used to strip the previous
    // proposal's brewedAt because nothing on screen showed it; now the field
    // has a control, a carried-over value is as visible as any other.
    reset({ ...getValues(), ...definedFields(next.brew) });
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
    //
    // The seed only ever changes alongside an open, so this cannot re-fire
    // mid-session and overwrite what someone has typed — that property is what
    // `seed` exists to carry, and why Quick Log's mid-session proposals go
    // through `applyProposal` instead.
    const values: DefaultValues<CreateBrewInput> = brew
      ? {
          beans: brew.beans,
          method: brew.method,
          coffeeGrams: brew.coffeeGrams,
          waterGrams: brew.waterGrams,
          rating: brew.rating,
          tastingNotes: brew.tastingNotes,
          brewedAt: isoToLocal(brew.brewedAt),
        }
      : { beans: '', tastingNotes: '', brewedAt: '', ...definedFields(seed?.brew ?? {}) };

    reset(values);
  }, [open, brew, seed, reset]);

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
    // The control speaks in minutes, so an untouched prefill would round the
    // stored instant down and a routine edit would quietly rewrite when the
    // brew happened. The exact original stands unless the reader changed it.
    const submitted =
      brew && !dirtyFields.brewedAt ? { ...values, brewedAt: brew.brewedAt } : values;

    await onSubmit(submitted);
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

        {/*
          Optional, and blank means "now" — the server stamps the moment it
          saves, which is what logging a brew as you drink it wants. The field
          exists for the other case the contract has always supported and the
          form never offered: yesterday's brew, logged honestly.
        */}
        <Field
          label="Brewed (blank means now)"
          error={errors.brewedAt?.message}
          badge={inferred('brewedAt') ? 'inferred' : undefined}
        >
          {(props) => (
            <input
              {...props}
              {...register('brewedAt')}
              data-inferred={inferred('brewedAt') || undefined}
              type="datetime-local"
              className={`${CONTROL_CLASS} tabular`}
            />
          )}
        </Field>

        {/*
          A textarea, because the field holds up to 500 characters of prose and
          a single-line box asks it to be scrolled through a letterbox. Three
          rows fits the notes people actually write; the resize handle is for
          the ones who write more.
        */}
        <Field
          label="Tasting notes"
          error={errors.tastingNotes?.message}
          badge={inferred('tastingNotes') ? 'inferred' : undefined}
        >
          {(props) => (
            <textarea
              {...props}
              {...register('tastingNotes')}
              data-inferred={inferred('tastingNotes') || undefined}
              rows={3}
              className={`${CONTROL_CLASS} resize-y`}
              autoComplete="off"
            />
          )}
        </Field>

        {/*
          What the notes read as, in the controlled vocabulary — shown on edit
          because that is where the notes are being reconsidered. Read-only:
          the tags are derived from the text above them, and editing the text
          is how you change them.
        */}
        {brew && flavorTags.data && flavorTags.data.length > 0 && (
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="text-small text-ink-muted font-medium">Flavour</span>
            <ul aria-label="Flavour tags" className="contents">
              {flavorTags.data.map((tag) => (
                <li
                  key={tag.slug}
                  className="bg-sunken text-ink rounded-pill px-2 py-px text-micro"
                >
                  {tag.label}
                </li>
              ))}
            </ul>
            {flavorTags.data.some((tag) => tag.source === 'ai') && (
              <span className="text-micro text-ink-muted">tagged by AI</span>
            )}
          </div>
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

/**
 * A field the model did not mention must stay what the person typed — or stay
 * empty — so only fields with values take part in a merge. Spreading the
 * partial as-is would let an explicit undefined overwrite either.
 *
 * `brewedAt` is additionally translated into the control's dialect: the
 * proposal carries the instant as ISO, and a `datetime-local` handed an ISO
 * string displays an empty box while silently holding a value — the exact
 * invisible-carry-over this form is built to prevent.
 */
function definedFields(brew: BrewProposal['brew']): Partial<CreateBrewInput> {
  const fields: Partial<CreateBrewInput> = Object.fromEntries(
    Object.entries(brew).filter(([, value]) => value !== undefined),
  );

  if (typeof fields.brewedAt === 'string') fields.brewedAt = isoToLocal(fields.brewedAt);

  return fields;
}

/**
 * An ISO instant as a `datetime-local` value: the same moment, written in the
 * reader's own timezone, to the minute — which is as finely as anyone logs a
 * cup of coffee.
 */
function isoToLocal(iso: string): string {
  const date = new Date(iso);
  const pad = (part: number) => String(part).padStart(2, '0');

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * The reverse translation, at the validation boundary. Empty is "not chosen",
 * which the contract spells `undefined`; a readable value becomes the instant
 * it names; anything else is passed through unconverted so the shared schema
 * refuses it with a message that blames this field.
 */
function localToIso(value: string | undefined): string | undefined {
  if (value === undefined || value === '') return undefined;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
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
