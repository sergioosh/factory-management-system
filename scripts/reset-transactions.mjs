import "dotenv/config";
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const tables = [
  "payments","invoice_items","invoices","grn_items","goods_received","purchase_items","purchases",
  "purchase_request_items","purchase_requests","production_consumption","production_runs",
  "sales_order_items","sales_orders","adjustment_items","adjustments","stock_count_items","stock_counts",
];
await c.query("BEGIN");
for (const t of tables) await c.query(`DELETE FROM ${t}`);
await c.query(`DELETE FROM stock_ledger WHERE txn_type <> 'opening'`);
await c.query(`DELETE FROM lots WHERE source_type <> 'opening'`);
await c.query(`UPDATE lots SET remaining_qty = initial_qty`);
await c.query(`UPDATE raw_materials SET current_stock = coalesce((SELECT l.initial_qty FROM lots l WHERE l.item_type='rm' AND l.item_id=raw_materials.id AND l.source_type='opening'), 0)`);
await c.query(`UPDATE products SET current_stock = 0`);
await c.query(`UPDATE doc_counters SET value = 0`);
await c.query(`DELETE FROM audit_log`);
await c.query(`DELETE FROM customers WHERE name = 'MUKWANO WHOLESALE'`);
await c.query("COMMIT");
const chk = await c.query("select (select count(*) from stock_ledger) l, (select sum(current_stock) from raw_materials) rm, (select sum(current_stock) from products) fg");
console.log("wiped:", chk.rows[0]);
await c.end();
