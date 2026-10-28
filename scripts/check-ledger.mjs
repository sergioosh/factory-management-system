import "dotenv/config";
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query(`
  with led as (
    select item_type, item_id, sum(qty_in) - sum(qty_out) as bal from stock_ledger group by 1,2
  )
  select 'rm' t, count(*) bad from raw_materials m join led on led.item_type='rm' and led.item_id=m.id where abs(led.bal - m.current_stock) > 0.001
  union all
  select 'fg', count(*) from products p join led on led.item_type='fg' and led.item_id=p.id where abs(led.bal - p.current_stock) > 0.001
  union all
  select 'rm_no_ledger', count(*) from raw_materials m where current_stock <> 0 and not exists (select 1 from led where item_type='rm' and item_id=m.id)
`);
console.log("invariant mismatches:", r.rows);
const v = await c.query(`select r.name, sum(pc.standard_qty) std, sum(pc.actual_qty) act from production_consumption pc join raw_materials r on r.id=pc.material_id join production_runs pr on pr.id=pc.run_id where pr.status='completed' group by r.name having sum(pc.standard_qty) <> sum(pc.actual_qty)`);
console.log("variances:", v.rows);
await c.end();
