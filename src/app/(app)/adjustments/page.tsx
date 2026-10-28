import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { adjustmentItems, adjustments, products, rawMaterials, users } from "@/db/schema";
import { requireView, can } from "@/lib/session";
import { AdjustmentsClient } from "./adjustments-client";

export const dynamic = "force-dynamic";

export default async function AdjustmentsPage() {
  const session = await requireView("inventory");
  const [rows, rms, fgs] = await Promise.all([
    db
      .select({
        id: adjustments.id,
        adjNo: adjustments.adjNo,
        createdAt: adjustments.createdAt,
        reason: adjustments.reason,
        itemType: adjustmentItems.itemType,
        qtyDelta: adjustmentItems.qtyDelta,
        itemCode: sql<string>`coalesce(${rawMaterials.code}, ${products.code}, '')`,
        itemName: sql<string>`coalesce(${rawMaterials.name}, ${products.name}, '')`,
        unit: sql<string>`coalesce(${rawMaterials.unit}, ${products.unit}, '')`,
        by: users.name,
      })
      .from(adjustments)
      .leftJoin(adjustmentItems, eq(adjustmentItems.adjId, adjustments.id))
      .leftJoin(
        rawMaterials,
        and(eq(adjustmentItems.itemType, "rm"), eq(adjustmentItems.itemId, rawMaterials.id)),
      )
      .leftJoin(
        products,
        and(eq(adjustmentItems.itemType, "fg"), eq(adjustmentItems.itemId, products.id)),
      )
      .leftJoin(users, eq(users.id, adjustments.requestedBy))
      .orderBy(desc(adjustments.id)),
    db
      .select({ id: rawMaterials.id, code: rawMaterials.code, name: rawMaterials.name, unit: rawMaterials.unit })
      .from(rawMaterials)
      .where(eq(rawMaterials.archived, false))
      .orderBy(asc(rawMaterials.code)),
    db
      .select({ id: products.id, code: products.code, name: products.name, unit: products.unit })
      .from(products)
      .where(eq(products.archived, false))
      .orderBy(asc(products.code)),
  ]);

  return (
    <AdjustmentsClient rows={rows} rms={rms} fgs={fgs} canCreate={can(session, "inventory", "create")} />
  );
}
