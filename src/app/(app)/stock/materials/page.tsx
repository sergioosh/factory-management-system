import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { rawMaterials } from "@/db/schema";
import { requireView } from "@/lib/session";
import { StockMaterialsClient } from "./stock-materials-client";

export const dynamic = "force-dynamic";

export default async function StockMaterialsPage() {
  await requireView("inventory");
  const rows = await db
    .select()
    .from(rawMaterials)
    .where(eq(rawMaterials.archived, false))
    .orderBy(asc(rawMaterials.code));
  return <StockMaterialsClient rows={rows} />;
}
