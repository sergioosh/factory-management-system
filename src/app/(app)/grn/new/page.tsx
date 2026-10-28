import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { purchaseRequests, purchaseRequestItems, rawMaterials, suppliers } from "@/db/schema";
import { requireView, can } from "@/lib/session";
import { GrnFormClient } from "../grn-form-client";

export const dynamic = "force-dynamic";

export default async function NewGrnPage({
  searchParams,
}: {
  searchParams: Promise<{ fromPr?: string }>;
}) {
  const session = await requireView("purchasing");
  if (!can(session, "purchasing", "create")) redirect("/grn");
  const { fromPr } = await searchParams;

  const [supplierList, materialList] = await Promise.all([
    db
      .select({ id: suppliers.id, name: suppliers.name, code: suppliers.code })
      .from(suppliers)
      .where(eq(suppliers.archived, false))
      .orderBy(asc(suppliers.name)),
    db
      .select({
        id: rawMaterials.id,
        code: rawMaterials.code,
        name: rawMaterials.name,
        unit: rawMaterials.unit,
        price: rawMaterials.price,
      })
      .from(rawMaterials)
      .where(eq(rawMaterials.archived, false))
      .orderBy(asc(rawMaterials.code)),
  ]);

  let from: { id: number; prNo: string; lines: { materialId: number; qty: number }[] } | null = null;
  const fromPrId = Number(fromPr);
  if (fromPr && Number.isInteger(fromPrId) && fromPrId > 0) {
    const [pr] = await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, fromPrId));
    if (pr && pr.status === "approved") {
      const items = await db
        .select({ materialId: purchaseRequestItems.materialId, qty: purchaseRequestItems.qty })
        .from(purchaseRequestItems)
        .where(eq(purchaseRequestItems.prId, fromPrId));
      from = { id: pr.id, prNo: pr.prNo, lines: items };
    }
  }

  return <GrnFormClient suppliers={supplierList} materials={materialList} fromPr={from} />;
}
