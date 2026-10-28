import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { lots, products, rawMaterials } from "@/db/schema";
import { requireView } from "@/lib/session";
import { LotsClient } from "./lots-client";

export const dynamic = "force-dynamic";

export default async function LotsPage() {
  await requireView("inventory");
  const rows = await db
    .select({
      id: lots.id,
      lotNo: lots.lotNo,
      itemType: lots.itemType,
      itemCode: sql<string>`coalesce(${rawMaterials.code}, ${products.code}, '')`,
      itemName: sql<string>`coalesce(${rawMaterials.name}, ${products.name}, '')`,
      unit: sql<string>`coalesce(${rawMaterials.unit}, ${products.unit}, '')`,
      initialQty: lots.initialQty,
      remainingQty: lots.remainingQty,
      sourceType: lots.sourceType,
      createdAt: lots.createdAt,
      unitCost: sql<number>`case
        when "lots"."item_type" = 'rm' then coalesce("raw_materials"."avg_cost", 0)
        else coalesce((
          select sum(bi.qty_per_unit * rm2.avg_cost)
          from bom_items bi join raw_materials rm2 on rm2.id = bi.material_id
          where bi.product_id = "lots"."item_id"
        ), 0)
      end`.mapWith(Number),
    })
    .from(lots)
    .leftJoin(rawMaterials, and(eq(lots.itemType, "rm"), eq(lots.itemId, rawMaterials.id)))
    .leftJoin(products, and(eq(lots.itemType, "fg"), eq(lots.itemId, products.id)))
    .orderBy(desc(lots.createdAt), desc(lots.id));
  return <LotsClient rows={rows} />;
}
