import type { CreateBrewInput } from '@crema/shared';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../lib/app-error';
import { InMemoryBrewRepository } from '../repositories/in-memory-brew.repository';
import { BrewService } from './brew.service';

/**
 * The service against a real in-memory repository rather than a mock.
 *
 * A mock here would assert that the service called the methods this service
 * currently calls, which is a test of the implementation rather than of the
 * behaviour, and it would pass just as happily if the repository were broken.
 * The in-memory adapter is fast, honest, and already proven by the contract
 * suite, so there is nothing a mock would buy.
 */

const input: CreateBrewInput = {
  beans: 'Ethiopian Yirgacheffe',
  method: 'v60',
  coffeeGrams: 18,
  waterGrams: 288,
  rating: 5,
  tastingNotes: 'Blackcurrant, jasmine, tea-like and clean',
};

let service: BrewService;

beforeEach(() => {
  service = new BrewService(new InMemoryBrewRepository());
});

/** The AppError a call threw, or a failure if it did not throw one. */
async function appErrorFrom(call: Promise<unknown>): Promise<AppError> {
  const error: unknown = await call.then(
    () => null,
    (thrown: unknown) => thrown,
  );

  expect(error, 'expected the call to be rejected').toBeInstanceOf(AppError);
  return error as AppError;
}

describe('listing', () => {
  it('returns everything when no filter is given', async () => {
    await service.create(input);
    await service.create({ ...input, method: 'espresso', coffeeGrams: 18, waterGrams: 36 });

    await expect(service.list()).resolves.toMatchObject({ total: 2 });
  });

  it('narrows to a method when one is given', async () => {
    await service.create(input);
    await service.create({ ...input, method: 'espresso', coffeeGrams: 18, waterGrams: 36 });

    const { brews } = await service.list({ method: 'espresso' });

    expect(brews).toHaveLength(1);
    expect(brews[0]?.method).toBe('espresso');
  });
});

describe('reading one brew', () => {
  it('returns it', async () => {
    const created = await service.create(input);

    await expect(service.get(created.id)).resolves.toEqual(created);
  });

  it('is a not-found error when nothing has that id', async () => {
    const error = await appErrorFrom(service.get(randomUUID()));

    expect(error.code).toBe('NOT_FOUND');
    expect(error.status).toBe(404);
  });

  it('names the id, so a support conversation has something to go on', async () => {
    const id = randomUUID();

    const error = await appErrorFrom(service.get(id));

    expect(error.message).toContain(id);
  });
});

describe('the rules a field schema cannot express', () => {
  it('refuses a brew dated in the future', async () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();

    const error = await appErrorFrom(service.create({ ...input, brewedAt: tomorrow }));

    expect(error.code).toBe('SEMANTIC_INVALID');
    expect(error.status).toBe(422);
    expect(error.details?.[0]?.field).toBe('brewedAt');
  });

  it('allows a brew dated a minute ahead, because clocks disagree by that much', async () => {
    const nearlyNow = new Date(Date.now() + 30_000).toISOString();

    await expect(service.create({ ...input, brewedAt: nearlyNow })).resolves.toBeDefined();
  });

  it('allows a brew dated in the past, which is the whole point of the field', async () => {
    const lastWeek = new Date(Date.now() - 7 * 86_400_000).toISOString();

    await expect(service.create({ ...input, brewedAt: lastWeek })).resolves.toBeDefined();
  });

  it('refuses less water than coffee, which is grams and millilitres swapped', async () => {
    const error = await appErrorFrom(
      service.create({ ...input, coffeeGrams: 288, waterGrams: 18 }),
    );

    expect(error.code).toBe('SEMANTIC_INVALID');
    expect(error.details?.[0]?.field).toBe('waterGrams');
  });

  it('refuses equal water and coffee', async () => {
    const error = await appErrorFrom(service.create({ ...input, coffeeGrams: 20, waterGrams: 20 }));

    expect(error.code).toBe('SEMANTIC_INVALID');
  });

  it('allows an espresso, where the ratio is nearly 1:2', async () => {
    await expect(
      service.create({ ...input, method: 'espresso', coffeeGrams: 18, waterGrams: 36 }),
    ).resolves.toBeDefined();
  });

  it('stores nothing when it refuses', async () => {
    await appErrorFrom(service.create({ ...input, coffeeGrams: 288, waterGrams: 18 }));

    await expect(service.list()).resolves.toMatchObject({ brews: [], total: 0 });
  });
});

describe('updating', () => {
  it('applies the change', async () => {
    const created = await service.create(input);

    const updated = await service.update(created.id, { rating: 1 });

    expect(updated.rating).toBe(1);
  });

  it('is a not-found error when nothing has that id', async () => {
    const error = await appErrorFrom(service.update(randomUUID(), { rating: 1 }));

    expect(error.status).toBe(404);
  });

  it('checks the rules against the merged brew, not the patch alone', async () => {
    const created = await service.create(input);

    // 400g of coffee is a valid number on its own, and impossible against the
    // 288g of water already stored. A check that only looked at the patch would
    // let this through and leave a brew POST would have refused.
    const error = await appErrorFrom(service.update(created.id, { coffeeGrams: 400 }));

    expect(error.code).toBe('SEMANTIC_INVALID');
    expect(error.status).toBe(422);
  });

  it('allows a patch that fixes an impossible combination in one go', async () => {
    const created = await service.create(input);

    const updated = await service.update(created.id, { coffeeGrams: 400, waterGrams: 4000 });

    expect(updated.coffeeGrams).toBe(400);
    expect(updated.waterGrams).toBe(4000);
  });

  it('leaves the brew untouched when it refuses', async () => {
    const created = await service.create(input);

    await appErrorFrom(service.update(created.id, { coffeeGrams: 400 }));

    await expect(service.get(created.id)).resolves.toEqual(created);
  });
});

describe('deleting', () => {
  it('removes the brew from view', async () => {
    const created = await service.create(input);

    await service.remove(created.id);

    await expect(service.list()).resolves.toMatchObject({ brews: [], total: 0 });
  });

  it('is a not-found error when nothing has that id', async () => {
    const error = await appErrorFrom(service.remove(randomUUID()));

    expect(error.status).toBe(404);
  });

  it('is a not-found error the second time, so a repeated delete cannot look successful', async () => {
    const created = await service.create(input);
    await service.remove(created.id);

    const error = await appErrorFrom(service.remove(created.id));

    expect(error.status).toBe(404);
  });

  it('refuses to update a deleted brew', async () => {
    const created = await service.create(input);
    await service.remove(created.id);

    const error = await appErrorFrom(service.update(created.id, { rating: 1 }));

    expect(error.status).toBe(404);
  });
});
