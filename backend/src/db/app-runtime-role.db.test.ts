import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { createDatabase } from './client.js';

/**
 * What `app_runtime` can and — the point of the exercise — cannot do.
 *
 * Every case here asserts a negative, which is the only kind of assertion that
 * keeps a privilege boundary honest. A grant nobody checks is a grant that
 * grows back: someone debugging a permission error reaches for the owner
 * credential, it works, and the boundary is gone with nothing failing to say
 * so.
 *
 * `set role` rather than a second connection, because the property under test
 * is what the role may do, not whether a password works — and this way the
 * suite needs no credential of its own.
 */

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required for database tests. See vitest.db.config.ts.');
}

const { db, close } = createDatabase(connectionString);

afterAll(async () => {
  await close();
});

/** Runs `work` as `app_runtime`, and puts the session back however it ends. */
async function asAppRuntime<T>(work: () => Promise<T>): Promise<T> {
  await db.execute(sql`set role app_runtime`);
  try {
    return await work();
  } finally {
    await db.execute(sql`reset role`);
  }
}

/**
 * Asserts that Postgres refused the statement for want of privilege.
 *
 * By SQLSTATE rather than by message, for two reasons. Drizzle wraps the
 * driver's error in one of its own — the message reads `Failed query: …`, and a
 * regex against it passes for any failure at all, including a typo in the SQL.
 * And `42501` covers both wordings this suite provokes: "permission denied for
 * table" and "must be owner of table" are the same refusal, and matching the
 * code rather than the prose means a Postgres release rephrasing either one
 * does not turn a security assertion red.
 */
async function expectDeniedByPrivilege(statement: Promise<unknown>): Promise<void> {
  const error: unknown = await statement.then(
    () => null,
    (thrown: unknown) => thrown,
  );

  expect(error, 'the statement was allowed, which is the failure').not.toBeNull();

  // The driver's error is the cause; Drizzle's wrapper is what was thrown.
  const cause: unknown = (error as { cause?: unknown }).cause ?? error;
  const code = (cause as { code?: string }).code;

  expect(code, `expected SQLSTATE 42501, got ${String((cause as Error).message)}`).toBe('42501');
}

describe('the app_runtime role', () => {
  it('exists, and does not bypass row level security', async () => {
    const [role] = await db.execute<{ rolbypassrls: boolean; rolcreatedb: boolean }>(
      sql`select rolbypassrls, rolcreatedb, rolsuper from pg_roles where rolname = 'app_runtime'`,
    );

    expect(role, 'migration 0010 has not been applied').toBeDefined();
    // The whole reason 0007's policies were inert: the owner bypasses them.
    expect(role?.rolbypassrls).toBe(false);
    expect(role?.rolcreatedb).toBe(false);
  });

  it('can do the reading and writing the API actually does', async () => {
    await asAppRuntime(async () => {
      await expect(db.execute(sql`select count(*) from public.brews`)).resolves.toBeDefined();
      await expect(
        db.execute(sql`select count(*) from public.brew_methods`),
      ).resolves.toBeDefined();
      await expect(db.execute(sql`select count(*) from public.brew_stats`)).resolves.toBeDefined();
    });
  });

  it('cannot delete a brew, because the application never does', async () => {
    // Deletion here is `set deleted_at`, so the privilege would only ever be
    // used by something that had gone wrong.
    await asAppRuntime(async () => {
      await expectDeniedByPrivilege(db.execute(sql`delete from public.brews where false`));
    });
  });

  it('cannot drop the tables it reads', async () => {
    await asAppRuntime(async () => {
      await expectDeniedByPrivilege(db.execute(sql`drop table public.brews`));
    });
  });

  it('cannot create objects of its own in the schema', async () => {
    await asAppRuntime(async () => {
      await expectDeniedByPrivilege(db.execute(sql`create table public.smuggled (id int)`));
    });
  });

  it('cannot write the reference vocabularies a migration owns', async () => {
    await asAppRuntime(async () => {
      await expectDeniedByPrivilege(
        db.execute(sql`insert into public.brew_methods (slug, label, display_order)
                       values ('smuggled', 'Smuggled', 99)`),
      );
    });
  });
});
