import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bomItems, products, rawMaterials, salesOrders } from "@/db/schema";
import { requireView, can } from "@/lib/session";
import { RunFormClient } from "../run-form-client";

export const dynamic = "force-dynamic";

export default async function NewRunPage() {
  const session = await requireView("production");
  if (!can(session, "production", "create")) redirect("/production");

  const [productList, materials, bom, openOrders] = await Promise.all([
    db
      .select({ id: products.id, code: products.code, name: products.name })
      .from(products)
      .where(eq(products.archived, false)),
    db
      .select({
        id: rawMaterials.id,
        code: rawMaterials.code,
        name: rawMaterials.name,
        unit: rawMaterials.unit,
        currentStock: rawMaterials.currentStock,
      })
      .from(rawMaterials),
    db.select().from(bomItems),
    db
      .select({ id: salesOrders.id, orderNo: salesOrders.orderNo })
      .from(salesOrders)
      .where(inArray(salesOrders.status, ["confirmed", "in_production"])),
  ]);

  return (
    <RunFormClient
      products={productList}
      materials={materials}
      bom={bom}
      salesOrders={openOrders}
    />
  );
}

