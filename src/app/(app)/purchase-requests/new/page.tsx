import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { rawMaterials } from "@/db/schema";
import { requireView, can } from "@/lib/session";
import { PrFormClient } from "../pr-form-client";

export const dynamic = "force-dynamic";

export default async function NewPurchaseRequestPage() {
  const session = await requireView("purchasing");
  if (!can(session, "purchasing", "create")) redirect("/purchase-requests");

  const materials = await db
    .select({
      id: rawMaterials.id,
      code: rawMaterials.code,
      name: rawMaterials.name,
      unit: rawMaterials.unit,
      currentStock: rawMaterials.currentStock,
    })
    .from(rawMaterials)
    .where(eq(rawMaterials.archived, false))
    .orderBy(asc(rawMaterials.code));

  return <PrFormClient materials={materials} />;
}
