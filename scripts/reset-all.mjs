// Wipes ALL business data back to a blank slate — masters, transactions, lots,
// ledger, audit log, doc counters — everything. Keeps users/roles/auth/settings
// untouched so you don't get locked out.
//
// Unlike clearing individual tables by hand in the Neon UI, TRUNCATE ... CASCADE
// here follows every foreign key automatically (so nothing gets left behind like
// the stale `lots` rows that caused the OPENING-RM001 collision) and RESTART
// IDENTITY resets every serial id sequence back to 1.
//
// Usage: npx tsx scripts/reset-all.mjs
// Prompts for confirmation unless run with --yes.
import "dotenv/config";
import readline from "node:readline/promises";
import pg from "pg";

const YES = process.argv.includes("--yes");

// Only tables that don't cascade from something else in this list need to be
// named explicitly — TRUNCATE ... CASCADE pulls in every dependent child table
// (sales_order_items, purchase_items, grn_items, invoice_items, payment_allocations,
// production_consumption, adjustment_items, stock_count_items, bom_items, bom_versions)
// automatically via their foreign keys.
const TABLES = [
  "customers",
  "suppliers",
  "products",
  "raw_materials",
  "sales_orders",
  "purchase_requests",
  "purchases",
  "goods_received",
  "production_runs",
  "invoices",
  "payments",
  "adjustments",
  "stock_counts",
  "lots",
  "stock_ledger",
  "audit_log",
];

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  if (!YES) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      `This will permanently delete ALL data in:\n  ${TABLES.join(", ")}\n` +
        `(and anything cascading from them), and reset id sequences.\n` +
        `Users, roles, and settings are kept.\nType "yes" to continue: `,
    );
    rl.close();
    if (answer.trim().toLowerCase() !== "yes") {
      console.log("Aborted.");
      await client.end();
      return;
    }
  }

  await client.query("BEGIN");
  await client.query(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
  await client.query(`UPDATE doc_counters SET value = 0`);
  await client.query("COMMIT");

  const chk = await client.query(
    "select (select count(*) from lots) lots, (select count(*) from stock_ledger) ledger, " +
      "(select count(*) from raw_materials) rm, (select count(*) from products) fg",
  );
  console.log("reset complete:", chk.rows[0]);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
