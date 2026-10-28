import { redirect } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { goodsReceived, suppliers } from "@/db/schema";
import { requireView, can } from "@/lib/session";
import { PurchaseFormClient } from "../purchase-form-client";

export const dynamic = "force-dynamic";

export default async function NewPurchaseInvoicePage() {
  const session = await requireView("purchasing");
  if (!can(session, "purchasing", "create")) redirect("/purchases");

  const supplierRows = await db
    .select({ id: suppliers.id, name: suppliers.name, code: suppliers.code, currency: suppliers.currency })
    .from(suppliers)
    .where(eq(suppliers.archived, false))
    .orderBy(asc(suppliers.name));

  // all GRNs still awaiting a supplier invoice, with their computed value
  const openGrns = await db
    .select({
      id: goodsReceived.id,
      grnNo: goodsReceived.grnNo,
      supplierId: goodsReceived.supplierId,
      receivedDate: goodsReceived.receivedDate,
      value: sql<number>`coalesce((select sum(gi.qty * gi.rate) from grn_items gi where gi.grn_id = "goods_received"."id"), 0)::float`,
    })
    .from(goodsReceived)
    .where(eq(goodsReceived.status, "received"))
    .orderBy(asc(goodsReceived.id));

  return <PurchaseFormClient suppliers={supplierRows} openGrns={openGrns} />;
}
