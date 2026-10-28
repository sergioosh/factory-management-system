import "dotenv/config";
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
await c.connect();

try {
  await c.query(`
    ALTER TABLE production_runs
      ADD COLUMN IF NOT EXISTS shift    text,
      ADD COLUMN IF NOT EXISTS machine  text,
      ADD COLUMN IF NOT EXISTS operator text;
  `);
  console.log("✓ Columns added (or already exist): shift, machine, operator");
} catch (err) {
  console.error("Migration failed:", err.message);
} finally {
  await c.end();
}
