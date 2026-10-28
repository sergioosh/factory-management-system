import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { goodsReceived, grnItems, lots, rawMaterials, suppliers, users } from "@/db/schema";
import { requireView, can } from "@/lib/session";
import { GrnClient } from "./grn-client";

export const dynamic = "force-dynamic";

export default async function GrnPage() {
  const session = await requireView("purchasing");

  const rows = await db
    .select({
      id: goodsReceived.id,
      grnNo: goodsReceived.grnNo,
      receivedDate: goodsReceived.receivedDate,
      status: goodsReceived.status,
      notes: goodsReceived.notes,
      createdAt: goodsReceived.createdAt,
      supplierName: suppliers.name,
      createdBy: users.name,
    })
    .from(goodsReceived)
    .leftJoin(suppliers, eq(goodsReceived.supplierId, suppliers.id))
    .leftJoin(users, eq(goodsReceived.createdBy, users.id))
    .orderBy(desc(goodsReceived.id));

  const items = await db
    .select({
      grnId: grnItems.grnId,
      materialCode: rawMaterials.code,
      materialName: rawMaterials.name,
      unit: rawMaterials.unit,
      qty: grnItems.qty,
      rate: grnItems.rate,
      lotNo: lots.lotNo,
    })
    .from(grnItems)
    .innerJoin(rawMaterials, eq(grnItems.materialId, rawMaterials.id))
    .leftJoin(lots, eq(grnItems.lotId, lots.id))
    .orderBy(asc(grnItems.id));

  return <GrnClient rows={rows} items={items} canCreate={can(session, "purchasing", "create")} />;
}
