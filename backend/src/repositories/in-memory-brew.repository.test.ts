import { brewSchema } from '@crema/shared';
import { describe, expect, it } from 'vitest';
import { describeBrewRepositoryContract } from './brew.repository.contract';
import { InMemoryBrewRepository } from './in-memory-brew.repository';
import { SEED_BREWS, seedBrewInputs } from './seed-brews';

describeBrewRepositoryContract('InMemoryBrewRepository', {
  fresh: () => Promise.resolve(new InMemoryBrewRepository()),
});

/**
 * Everything above is the shared contract. Everything below is specific to this
 * adapter — seeding and instance isolation have no equivalent in Postgres.
 */

describe('InMemoryBrewRepository seeding', () => {
  it('starts empty when given no seed', async () => {
    const repository = new InMemoryBrewRepository();

    await expect(repository.list()).resolves.toMatchObject({ brews: [], total: 0 });
  });

  it('loads the demo brews, so a fresh app is not an empty screen', async () => {
    const repository = new InMemoryBrewRepository(seedBrewInputs());

    await expect(repository.list()).resolves.toMatchObject({ total: SEED_BREWS.length });
  });

  it('seeds brews the shared contract accepts', async () => {
    const repository = new InMemoryBrewRepository(seedBrewInputs());

    const { brews } = await repository.list();

    for (const brew of brews) {
      expect(() => brewSchema.parse(brew)).not.toThrow();
    }
  });

  it('dates the seed relative to now, so the demo data never reads as stale', async () => {
    const repository = new InMemoryBrewRepository(seedBrewInputs());

    const [newest] = (await repository.list()).brews;
    const daysOld = (Date.now() - Date.parse(newest?.brewedAt ?? '')) / 86_400_000;

    // The most recent seeded brew is one day old.
    expect(daysOld).toBeGreaterThan(0.9);
    expect(daysOld).toBeLessThan(1.1);
  });

  it('seeds the wireframe brews in the order the wireframes show them', async () => {
    const repository = new InMemoryBrewRepository(seedBrewInputs());

    const { brews } = await repository.list();

    expect(brews.slice(0, 3).map((brew) => brew.beans)).toEqual([
      'Zimbabwean highlands',
      'Nigerian dark roast',
      'Italian decaf',
    ]);
  });

  it('keeps two instances apart, so one test cannot see the brews of another', async () => {
    const one = new InMemoryBrewRepository();
    const other = new InMemoryBrewRepository();

    await one.create({
      beans: 'Only in the first',
      method: 'v60',
      coffeeGrams: 18,
      waterGrams: 288,
      rating: 5,
      tastingNotes: 'Blackcurrant, jasmine, tea-like and clean',
    });

    await expect(other.list()).resolves.toMatchObject({ brews: [], total: 0 });
  });
});
