import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { requireView, can } from "@/lib/session";
import { BomClient } from "./bom-client";

export const dynamic = "force-dynamic";

export default async function BomPage() {
  const session = await requireView("masters");

  const rows = await db
    .select({
      id: products.id,
      code: products.code,
      name: products.name,
      unit: products.unit,
      archived: products.archived,
      materials: sql<number>`(select count(*) from bom_items bi where bi.product_id = "products"."id")::int`,
      version: sql<number | null>`(select max(version) from bom_versions bv where bv.product_id = "products"."id")`,
      effectiveDate: sql<string | null>`(select bv.effective_date from bom_versions bv where bv.product_id = "products"."id" order by bv.version desc limit 1)`,
    })
    .from(products)
    .orderBy(asc(products.code));

  return <BomClient rows={rows} canEdit={can(session, "masters", "edit")} />;
}
