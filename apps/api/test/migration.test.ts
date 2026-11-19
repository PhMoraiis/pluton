import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, expect, test } from 'vitest';

const DB_NAME = 'pluton_migration_test';
const migrationsDir = path.resolve(import.meta.dirname, '../prisma/migrations');

function urlForDatabase(database: string): string {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${database}`;
  return url.toString();
}

function migrationSql(suffix: string): string {
  const dir = readdirSync(migrationsDir).find((name) => name.endsWith(`_${suffix}`));
  if (!dir) throw new Error(`Migration *_${suffix} not found`);
  return readFileSync(path.join(migrationsDir, dir, 'migration.sql'), 'utf8');
}

// Never issue DROP/CREATE DATABASE against anything but a local server.
function assertLocalhost(): void {
  const host = new URL(process.env.DATABASE_URL!).hostname;
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error(`Refusing to DROP/CREATE DATABASE on non-local host: ${host}`);
  }
}

async function recreateOrDrop(create: boolean): Promise<void> {
  assertLocalhost();
  const admin = new pg.Client({ connectionString: urlForDatabase('postgres') });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
    // WAL_LOG (Postgres 15+) skips the forced checkpoint of the default FILE_COPY strategy.
    if (create) await admin.query(`CREATE DATABASE ${DB_NAME} STRATEGY = WAL_LOG`);
  } finally {
    await admin.end();
  }
}

let client: pg.Client | undefined;

beforeAll(async () => {
  await recreateOrDrop(true);
  client = new pg.Client({ connectionString: urlForDatabase(DB_NAME) });
  await client.connect();
}, 60_000);

afterAll(async () => {
  try {
    await client?.end();
  } finally {
    await recreateOrDrop(false);
  }
}, 60_000);

test('salary_tags migration keeps existing data and seeds the Assinatura tag', async () => {
  await client!.query(migrationSql('init'));
  await client!.query(`INSERT INTO "user" ("id","name","email","updatedAt") VALUES ('u1','Test','t@example.com',now())`);
  await client!.query(`INSERT INTO "PaymentMethod" ("id","userId","name","color","sortOrder") VALUES ('pm1','u1','Pix','#2B593F',0)`);
  await client!.query(
    `INSERT INTO "Series" ("id","userId","kind","type","baseName","dayOfMonth","amountCents","paymentMethodId")
     VALUES ('s1','u1','EXPENSE','MONTHLY','Streaming',5,1990,'pm1')`,
  );
  await client!.query(
    `INSERT INTO "Entry" ("id","userId","kind","name","amountCents","dueDate","paymentMethodId","paidOn","seriesId","sequence","updatedAt") VALUES
     ('e1','u1','EXPENSE','Streaming',1990,'2026-01-05','pm1','2026-01-05','s1',1,now()),
     ('e2','u1','EXPENSE','Streaming',2490,'2026-02-05','pm1',NULL,'s1',2,now()),
     ('e3','u1','EXPENSE','Mercado',12700,'2026-01-10',NULL,NULL,NULL,NULL,now())`,
  );
  const before = (
    await client!.query(`SELECT "id","amountCents","dueDate"::text AS "dueDate","paidOn"::text AS "paidOn" FROM "Entry" ORDER BY "id"`)
  ).rows;

  await client!.query(migrationSql('salary_tags'));

  const tags = await client!.query(`SELECT name, color, system, "sortOrder" FROM "Tag" WHERE "userId" = 'u1'`);
  expect(tags.rows).toEqual([{ name: 'Assinatura', color: '#D9730D', system: 'SUBSCRIPTION', sortOrder: 0 }]);

  const after = (
    await client!.query(
      `SELECT "id","amountCents","dueDate"::text AS "dueDate","paidOn"::text AS "paidOn","amountAdjusted" FROM "Entry" ORDER BY "id"`,
    )
  ).rows;
  expect(after).toHaveLength(3);
  expect(after.map(({ amountAdjusted, ...rest }) => rest)).toEqual(before);
  expect(after.every((e) => e.amountAdjusted === false)).toBe(true);

  expect((await client!.query(`SELECT role FROM "Series"`)).rows).toEqual([{ role: 'NONE' }]);
  expect((await client!.query(`SELECT count(*)::int AS n FROM "EntryTag"`)).rows[0].n).toBe(0);
  expect((await client!.query(`SELECT count(*)::int AS n FROM "SeriesTag"`)).rows[0].n).toBe(0);
});
