import { defineConfig } from "drizzle-kit";

// AVIV's database is defined by the hand-written SQL in drizzle/migrations, not by
// drizzle/schema.ts (which is intentionally empty). `drizzle-kit push` would diff the
// live database against that empty schema and propose dropping every table, so it is
// refused here. Use `npm run db:migrate` to apply migrations.
if (process.argv.some((arg) => arg === "push")) {
  throw new Error(
    "drizzle-kit push is disabled for AVIV: the schema lives in SQL migrations. Use `npm run db:migrate`.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
