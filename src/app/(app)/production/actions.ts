"use server";

import { z } from "zod";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  auditLog,
  bomItems,
  lots,
  productionConsumption,
  productionRuns,
  products,
  rawMaterials,
  salesOrders,
  stockLedger,
  users,
} from "@/db/schema";
import { requirePerm, requireView } from "@/lib/session";
import { act } from "@/lib/action";
import { nextDocNo } from "@/lib/docno";
import { postStockMovement, createLot, consumeLotsFifo } from "@/lib/stock";
import { writeAudit } from "@/lib/audit";
import { notifyChange } from "@/lib/notify";

const runSchema = z.object({
  productId: z.number({ error: "Pick a product" }),
  salesOrderId: z.number().optional(),
  plannedQty: z.number().positive("Qty must be positive"),
  runDate: z.string().min(1),
  shift: z.string().optional(),
  machine: z.string().optional(),
  operator: z.string().optional(),
  notes: z.string().optional(),
});

export async function createRun(input: z.infer<typeof runSchema>) {
  return act(async () => {
    const s = await requirePerm("production", "create");
    const data = runSchema.parse(input);
    return db.transaction(async (tx) => {
      const runNo = await nextDocNo(tx, "PRD");
      const [run] = await tx
        .insert(productionRuns)
        .values({ ...data, runNo, status: "in_progress", createdBy: s.user.id })
        .returning();
      const bom = await tx.select().from(bomItems).where(eq(bomItems.productId, data.productId));
      if (bom.length) {
        await tx.insert(productionConsumption).values(
          bom.map((b) => ({
            runId: run.id,
            materialId: b.materialId,
            standardQty: b.qtyPerUnit * data.plannedQty,
          })),
        );
      }
      await writeAudit(
        { userId: s.user.id, action: "create", entity: "production_run", entityId: run.id },
        tx,
      );
      await notifyChange("production");
      revalidatePath("/production");
      return run.id;
    });
  });
}

export async function startRun(runId: number) {
  return act(async () => {
    const s = await requirePerm("production", "edit");
    const [run] = await db.select().from(productionRuns).where(eq(productionRuns.id, runId));
    if (!run) throw new Error("Run not found");
    if (run.status !== "planned") throw new Error(`Run is ${run.status}`);
    await db
      .update(productionRuns)
      .set({ status: "in_progress" })
      .where(eq(productionRuns.id, runId));
    await writeAudit({ userId: s.user.id, action: "start", entity: "production_run", entityId: runId });
    await notifyChange("production");
    revalidatePath("/production");
  });
}

export async function cancelRun(runId: number) {
  return act(async () => {
    const s = await requirePerm("production", "edit");
    const [run] = await db.select().from(productionRuns).where(eq(productionRuns.id, runId));
    if (!run) throw new Error("Run not found");
    if (run.status === "completed") throw new Error("Completed runs cannot be cancelled");
    await db
      .update(productionRuns)
      .set({ status: "cancelled" })
      .where(eq(productionRuns.id, runId));
    await writeAudit({ userId: s.user.id, action: "cancel", entity: "production_run", entityId: runId });
    await notifyChange("production");
    revalidatePath("/production");
  });
}

const completeSchema = z.object({
  runId: z.number(),
  producedQty: z.number().positive("Produced qty must be positive"),
  // why output came in above/below planned qty — the run-level counterpart
  // to each material's own remarks
  varianceRemarks: z.string().optional(),
  consumption: z.array(
    z.object({
      materialId: z.number(),
      actualQty: z.number().min(0),
      // manually entered by the user — how much of the shortfall against
      // standard (standard − actual) is actually good enough to go back to
      // raw material stock. Never computed automatically beyond that cap.
      returnedQty: z.number().min(0).optional(),
      remarks: z.string().optional(),
    }),
  ),
});

/**
 * Completing a run posts everything at once: raw material out (actuals),
 * finished goods in (produced qty + lot), and stores standard vs actual
 * for the variance report. Material only returns to stock in the exact
 * quantity the user manually enters (returnedQty), capped at the shortfall
 * against standard — never more, since part of an unused shortfall may be
 * unusable/damaged and not fit to return.
 */
export async function completeRun(input: z.infer<typeof completeSchema>) {
  return act(async () => {
    const s = await requirePerm("production", "edit");
    const data = completeSchema.parse(input);
    return db.transaction(async (tx) => {
      const [run] = await tx
        .select()
        .from(productionRuns)
        .where(eq(productionRuns.id, data.runId))
        .for("update");
      if (!run) throw new Error("Run not found");
      if (!["planned", "in_progress"].includes(run.status)) throw new Error(`Run is ${run.status}`);

      const [product] = await tx.select().from(products).where(eq(products.id, run.productId));
      const bom = await tx.select().from(bomItems).where(eq(bomItems.productId, run.productId));
      const bomByMaterial = new Map(bom.map((b) => [b.materialId, b.qtyPerUnit]));

      // consumption: refresh standard to produced qty, record actuals, move stock
      await tx.delete(productionConsumption).where(eq(productionConsumption.runId, data.runId));
      for (const c of data.consumption) {
        const stdPerUnit = bomByMaterial.get(c.materialId) ?? 0;
        const standardQty = stdPerUnit * data.producedQty;
        const returnedQty = c.returnedQty ?? 0;
        const maxReturnable = Math.max(0, standardQty - c.actualQty);
        if (returnedQty > maxReturnable) {
          throw new Error("Returned quantity cannot exceed the shortfall against standard for a material");
        }
        await tx.insert(productionConsumption).values({
          runId: data.runId,
          materialId: c.materialId,
          standardQty,
          actualQty: c.actualQty,
          returnedQty: returnedQty > 0 ? returnedQty : null,
          remarks: c.remarks?.trim() || null,
        });
        if (c.actualQty > 0) {
          await postStockMovement(tx, {
            itemType: "rm",
            itemId: c.materialId,
            txnType: "production_out",
            qtyOut: c.actualQty,
            refType: "production_run",
            refId: run.id,
            refNo: run.runNo,
            userId: s.user.id,
          });
          await consumeLotsFifo(tx, "rm", c.materialId, c.actualQty);
        }
        // manual return only — nothing goes back to stock unless the user typed a returned qty
        if (returnedQty > 0) {
          await postStockMovement(tx, {
            itemType: "rm",
            itemId: c.materialId,
            txnType: "production_return",
            qtyIn: returnedQty,
            refType: "production_run",
            refId: run.id,
            refNo: run.runNo,
            userId: s.user.id,
          });
        }
      }

      // finished goods in
      const lot = await createLot(tx, {
        lotNo: `${run.runNo}-${product.code}`,
        itemType: "fg",
        itemId: run.productId,
        qty: data.producedQty,
        sourceType: "production",
        sourceId: run.id,
      });
      await postStockMovement(tx, {
        itemType: "fg",
        itemId: run.productId,
        txnType: "production_in",
        qtyIn: data.producedQty,
        refType: "production_run",
        refId: run.id,
        refNo: run.runNo,
        lotId: lot.id,
        userId: s.user.id,
      });

      // Variance is derived, not typed in — actual vs planned. Negative means
      // short of plan, positive means more was produced than planned.
      const varianceQty = data.producedQty - run.plannedQty;
      await tx
        .update(productionRuns)
        .set({
          status: "completed",
          producedQty: data.producedQty,
          varianceQty,
          varianceRemarks: data.varianceRemarks?.trim() || null,
          completedAt: new Date(),
        })
        .where(eq(productionRuns.id, data.runId));

      // if this was the last open run of an order, the order is ready
      if (run.salesOrderId) {
        const openRuns = await tx
          .select()
          .from(productionRuns)
          .where(
            and(
              eq(productionRuns.salesOrderId, run.salesOrderId),
              ne(productionRuns.status, "completed"),
              ne(productionRuns.status, "cancelled"),
              ne(productionRuns.id, data.runId),
            ),
          );
        if (openRuns.length === 0) {
          await tx
            .update(salesOrders)
            .set({ status: "ready", updatedAt: new Date() })
            .where(
              and(eq(salesOrders.id, run.salesOrderId), eq(salesOrders.status, "in_production")),
            );
        }
      }

      await writeAudit(
        {
          userId: s.user.id,
          action: "complete",
          entity: "production_run",
          entityId: run.id,
          detail: { producedQty: data.producedQty },
        },
        tx,
      );
      await notifyChange("stock", "production", "orders");
      revalidatePath("/production");
      if (run.salesOrderId) revalidatePath(`/orders/${run.salesOrderId}`);
    });
  });
}

/**
 * Full read-only picture of a single run for the "View" sheet: header info,
 * material consumption (standard vs actual vs variance), every stock ledger
 * posting the run generated (RM out, RM return, FG in — the real audit trail
 * of what moved and when), and the audit log entries (created/started/
 * completed/cancelled) with who did it and when.
 */
export async function getRunDetail(runId: number) {
  return act(async () => {
    await requireView("production");

    const [run] = await db
      .select({
        id: productionRuns.id,
        runNo: productionRuns.runNo,
        runDate: productionRuns.runDate,
        status: productionRuns.status,
        plannedQty: productionRuns.plannedQty,
        producedQty: productionRuns.producedQty,
        varianceQty: productionRuns.varianceQty,
        varianceRemarks: productionRuns.varianceRemarks,
        shift: productionRuns.shift,
        machine: productionRuns.machine,
        operator: productionRuns.operator,
        notes: productionRuns.notes,
        completedAt: productionRuns.completedAt,
        createdAt: productionRuns.createdAt,
        productId: productionRuns.productId,
        productCode: products.code,
        productName: products.name,
        productUnit: products.unit,
        orderId: salesOrders.id,
        orderNo: salesOrders.orderNo,
        createdByName: users.name,
      })
      .from(productionRuns)
      .innerJoin(products, eq(productionRuns.productId, products.id))
      .leftJoin(salesOrders, eq(productionRuns.salesOrderId, salesOrders.id))
      .leftJoin(users, eq(productionRuns.createdBy, users.id))
      .where(eq(productionRuns.id, runId));
    if (!run) throw new Error("Run not found");

    const consumption = await db
      .select({
        materialId: productionConsumption.materialId,
        materialCode: rawMaterials.code,
        materialName: rawMaterials.name,
        unit: rawMaterials.unit,
        standardQty: productionConsumption.standardQty,
        actualQty: productionConsumption.actualQty,
        returnedQty: productionConsumption.returnedQty,
        remarks: productionConsumption.remarks,
        unitCost: rawMaterials.avgCost,
      })
      .from(productionConsumption)
      .innerJoin(rawMaterials, eq(productionConsumption.materialId, rawMaterials.id))
      .where(eq(productionConsumption.runId, runId))
      .orderBy(asc(rawMaterials.name));

    const movements = await db
      .select({
        id: stockLedger.id,
        createdAt: stockLedger.createdAt,
        itemType: stockLedger.itemType,
        txnType: stockLedger.txnType,
        qtyIn: stockLedger.qtyIn,
        qtyOut: stockLedger.qtyOut,
        balanceAfter: stockLedger.balanceAfter,
        itemId: stockLedger.itemId,
        lotNo: lots.lotNo,
        byName: users.name,
        materialCode: rawMaterials.code,
        materialName: rawMaterials.name,
        materialUnit: rawMaterials.unit,
        productCode: products.code,
        productName: products.name,
        productUnit: products.unit,
      })
      .from(stockLedger)
      .leftJoin(lots, eq(stockLedger.lotId, lots.id))
      .leftJoin(users, eq(stockLedger.createdBy, users.id))
      .leftJoin(
        rawMaterials,
        and(eq(stockLedger.itemType, "rm"), eq(stockLedger.itemId, rawMaterials.id)),
      )
      .leftJoin(
        products,
        and(eq(stockLedger.itemType, "fg"), eq(stockLedger.itemId, products.id)),
      )
      .where(and(eq(stockLedger.refType, "production_run"), eq(stockLedger.refId, runId)))
      .orderBy(asc(stockLedger.createdAt), asc(stockLedger.id));

    const history = await db
      .select({
        id: auditLog.id,
        createdAt: auditLog.createdAt,
        userName: users.name,
        action: auditLog.action,
        detail: auditLog.detail,
      })
      .from(auditLog)
      .leftJoin(users, eq(auditLog.userId, users.id))
      .where(and(eq(auditLog.entity, "production_run"), eq(auditLog.entityId, String(runId))))
      .orderBy(desc(auditLog.createdAt));

    return {
      run,
      consumption: consumption.map((c) => {
        // actualQty is null until the material has actually been consumed
        // (the run isn't completed yet) — that's "nothing to report", not a
        // real saving of the whole standard qty, so variance stays 0 for it.
        // A completed run's actualQty of exactly 0 is a real recorded value.
        const variance = c.actualQty == null ? 0 : c.actualQty - c.standardQty;
        const varianceValue = c.actualQty == null ? 0 : variance * c.unitCost;
        return { ...c, variance, varianceValue };
      }),
      movements,
      history,
    };
  });
}
