import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bomItems,
  productionConsumption,
  productionRuns,
  products,
  rawMaterials,
  salesOrders,
} from "@/db/schema";
import { requireView, can } from "@/lib/session";
import { ProductionClient } from "./production-client";

export const dynamic = "force-dynamic";

export default async function ProductionPage() {
  const session = await requireView("production");

  // Which runs had at least one material go over its BOM standard — drives
  // the red/green tint on the completed status badge in the list.
  const [runs, materials, bom, overUsedRows] = await Promise.all([
    db
      .select({
        id: productionRuns.id,
        runNo: productionRuns.runNo,
        runDate: productionRuns.runDate,
        status: productionRuns.status,
        plannedQty: productionRuns.plannedQty,
        producedQty: productionRuns.producedQty,
        varianceQty: productionRuns.varianceQty,
        productId: productionRuns.productId,
        productName: products.name,
        productUnit: products.unit,
        orderNo: salesOrders.orderNo,
      })
      .from(productionRuns)
      .innerJoin(products, eq(productionRuns.productId, products.id))
      .leftJoin(salesOrders, eq(productionRuns.salesOrderId, salesOrders.id))
      .orderBy(desc(productionRuns.id)),
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
      .select({
        runId: productionConsumption.runId,
        overUsed: sql<boolean>`bool_or(${productionConsumption.actualQty} > ${productionConsumption.standardQty})`,
      })
      .from(productionConsumption)
      .groupBy(productionConsumption.runId),
  ]);
  const overUsedRunIds = new Set(overUsedRows.filter((r) => r.overUsed).map((r) => r.runId));
  const runsWithFlag = runs.map((r) => ({ ...r, overUsed: overUsedRunIds.has(r.id) }));

  return (
    <ProductionClient
      runs={runsWithFlag}
      materials={materials}
      bom={bom}
      canCreate={can(session, "production", "create")}
      canEdit={can(session, "production", "edit")}
    />
  );
}
