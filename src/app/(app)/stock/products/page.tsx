import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { requireView } from "@/lib/session";
import { StockProductsClient } from "./stock-products-client";

export const dynamic = "force-dynamic";

export default async function StockProductsPage() {
  await requireView("inventory");
  const rows = await db
    .select({
      id: products.id,
      code: products.code,
      name: products.name,
      unit: products.unit,
      currentStock: products.currentStock,
      sellingPrice: products.sellingPrice,
    })
    .from(products)
    .where(eq(products.archived, false))
    .orderBy(asc(products.code));
  return <StockProductsClient rows={rows} />;
}
