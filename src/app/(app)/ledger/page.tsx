import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { products, rawMaterials, stockLedger } from "@/db/schema";
import { requireView } from "@/lib/session";
import { LedgerClient } from "./ledger-client";

export const dynamic = "force-dynamic";

export default async function LedgerPage() {
  await requireView("inventory");
  const rows = await db
    .select({
      id: stockLedger.id,
      createdAt: stockLedger.createdAt,
      itemType: stockLedger.itemType,
      itemName: sql<string>`coalesce(${rawMaterials.name}, ${products.name}, '')`,
      unit: sql<string>`coalesce(${rawMaterials.unit}, ${products.unit}, '')`,
      txnType: stockLedger.txnType,
      refNo: stockLedger.refNo,
      qtyIn: stockLedger.qtyIn,
      qtyOut: stockLedger.qtyOut,
      balanceAfter: stockLedger.balanceAfter,
      unitCost: sql<number>`case
        when "stock_ledger"."item_type" = 'rm' then coalesce("raw_materials"."avg_cost", 0)
        else coalesce((
          select sum(bi.qty_per_unit * rm2.avg_cost)
          from bom_items bi join raw_materials rm2 on rm2.id = bi.material_id
          where bi.product_id = "stock_ledger"."item_id"
        ), 0)
      end`.mapWith(Number),
    })
    .from(stockLedger)
    .leftJoin(rawMaterials, and(eq(stockLedger.itemType, "rm"), eq(stockLedger.itemId, rawMaterials.id)))
    .leftJoin(products, and(eq(stockLedger.itemType, "fg"), eq(stockLedger.itemId, products.id)))
    .orderBy(desc(stockLedger.id))
    .limit(1000);
  return <LedgerClient rows={rows} />;
}
