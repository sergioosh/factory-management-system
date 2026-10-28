import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { goodsReceived, grnItems, purchases, rawMaterials, suppliers, users } from "@/db/schema";
import { requireView, can } from "@/lib/session";
import { PurchasesClient } from "./purchases-client";

export const dynamic = "force-dynamic";

export default async function PurchasesPage() {
  const session = await requireView("purchasing");

  const rows = await db
    .select({
      id: purchases.id,
      poNo: purchases.poNo,
      invoiceNo: purchases.invoiceNo,
      orderDate: purchases.orderDate,
      status: purchases.status,
      currency: purchases.currency,
      taxRate: purchases.taxRate,
      total: purchases.total,
      notes: purchases.notes,
      createdAt: purchases.createdAt,
      supplierName: suppliers.name,
      createdBy: users.name,
    })
    .from(purchases)
    .innerJoin(suppliers, eq(purchases.supplierId, suppliers.id))
    .leftJoin(users, eq(purchases.createdBy, users.id))
    .orderBy(desc(purchases.id));

  // GRN lines belonging to each invoice (via goods_received.purchase_id) for the detail sheet
  const items = await db
    .select({
      purchaseId: goodsReceived.purchaseId,
      grnNo: goodsReceived.grnNo,
      materialCode: rawMaterials.code,
      materialName: rawMaterials.name,
      unit: rawMaterials.unit,
      qty: grnItems.qty,
      rate: grnItems.rate,
    })
    .from(grnItems)
    .innerJoin(goodsReceived, eq(grnItems.grnId, goodsReceived.id))
    .innerJoin(rawMaterials, eq(grnItems.materialId, rawMaterials.id))
    .orderBy(asc(grnItems.id));

  return (
    <PurchasesClient rows={rows} items={items} canCreate={can(session, "purchasing", "create")} />
  );
}
