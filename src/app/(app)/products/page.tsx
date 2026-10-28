import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { products, bomItems, rawMaterials } from "@/db/schema";
import { requireView, can } from "@/lib/session";
import { ProductsClient } from "./products-client";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const session = await requireView("masters");
  const [rows, bom, materials] = await Promise.all([
    db.select().from(products).orderBy(asc(products.code)),
    db.select().from(bomItems),
    db.select().from(rawMaterials).where(eq(rawMaterials.archived, false)),
  ]);
  return (
    <ProductsClient
      rows={rows}
      bom={bom}
      materialOptions={materials.map((m) => ({ value: m.id, label: m.name, hint: m.code }))}
      canCreate={can(session, "masters", "create")}
      canEdit={can(session, "masters", "edit")}
    />
  );
}
