import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

// Database tests run only against a local, disposable PostgreSQL named by
// AVIV_TEST_DATABASE_URL (e.g. postgresql://postgres@127.0.0.1:54329/postgres).
// The harness recreates an `aviv_test` database on that server for every run.
export const testDatabaseUrl = process.env["AVIV_TEST_DATABASE_URL"];

const root = path.resolve(__dirname, "../../..");

export async function resetTestDatabase() {
  if (!testDatabaseUrl) throw new Error("AVIV_TEST_DATABASE_URL is not set");
  const server = new URL(testDatabaseUrl);
  if (!["127.0.0.1", "localhost", "::1"].includes(server.hostname))
    throw new Error("Database tests refuse to run against a non-local server.");
  const admin = postgres(testDatabaseUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe("DROP DATABASE IF EXISTS aviv_test WITH (FORCE)");
  await admin.unsafe("CREATE DATABASE aviv_test");
  await admin.end();
  server.pathname = "/aviv_test";
  const url = server.toString();
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql.unsafe(readFileSync(path.join(__dirname, "supabase-stub.sql"), "utf8"));
  const journal = JSON.parse(
    readFileSync(path.join(root, "drizzle/migrations/meta/_journal.json"), "utf8"),
  ) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries)
    await sql.unsafe(readFileSync(path.join(root, `drizzle/migrations/${tag}.sql`), "utf8"));
  await sql.end();
  return url;
}

export type Sql = postgres.Sql;
export type Role = "anon" | "authenticated" | "service_role";

// Runs fn inside a transaction as the given API role, with auth.uid() = userId.
export function asRole<T>(
  sql: Sql,
  role: Role,
  userId: string | null,
  fn: (tx: Sql) => Promise<T>,
) {
  return sql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE ${role}`);
    await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify(userId ? { sub: userId } : {})}, true)`;
    return fn(tx as unknown as Sql);
  }) as Promise<T>;
}
