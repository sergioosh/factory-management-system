import { and, asc, desc, eq, gte, lte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  customers,
  productionConsumption,
  productionRuns,
  products,
  rawMaterials,
  stockLedger,
  suppliers,
  purchases,
  invoices,
} from "@/db/schema";
import { requireView } from "@/lib/session";
import { fmtMoney, fmtQty, fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { OpTabs, OpRange, OpExport, StatCard } from "./op-client";
import { OP_TABS, type TabKey } from "./tabs";

export const dynamic = "force-dynamic";

type Col = {
  header: string;
  numeric?: boolean;
  cell: (r: Record<string, unknown>) => React.ReactNode;
  csv: (r: Record<string, unknown>) => string | number;
};

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
const pct = (n: number) => `${n.toFixed(1)}%`;

export default async function OperationalReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; from?: string; to?: string }>;
}) {
  await requireView("reports");
  const sp = await searchParams;
  const tab: TabKey = (OP_TABS.find((t) => t.key === sp.tab)?.key ?? "purchases") as TabKey;
  const from = sp.from ?? monthStart();
  const to = sp.to ?? new Date().toISOString().slice(0, 10);

  let title = "";
  let csvName = "report";
  let cols: Col[] = [];
  let data: Record<string, unknown>[] = [];
  let stats: { label: string; value: string | number }[] = [];
  const showRange = !["low-stock", "reorder"].includes(tab);

  // ------------------------------------------------------------ Purchases
  if (tab === "purchases") {
    title = "Purchase Register";
    csvName = `purchases_${from}_${to}`;
    const rows = await db
      .select({
        doc: purchases.poNo,
        date: purchases.orderDate,
        invoice: purchases.invoiceNo,
        supplier: suppliers.name,
        ccy: purchases.currency,
        taxRate: purchases.taxRate,
        total: purchases.total,
        status: purchases.status,
      })
      .from(purchases)
      .innerJoin(suppliers, eq(purchases.supplierId, suppliers.id))
      .where(and(gte(purchases.orderDate, from), lte(purchases.orderDate, to)))
      .orderBy(desc(purchases.id));
    data = rows.map((r) => {
      const subtotal = r.taxRate ? r.total / (1 + r.taxRate / 100) : r.total;
      return { ...r, subtotal, tax: r.total - subtotal };
    });
    const totalValue = rows.reduce((s, r) => s + r.total, 0);
    stats = [
      { label: "Records", value: rows.length },
      { label: "Total value", value: fmtMoney(totalValue) },
    ];
    cols = [
      { header: "Doc #", cell: (r) => <span className="num">{r.doc as string}</span>, csv: (r) => r.doc as string },
      { header: "Date", cell: (r) => fmtDate(r.date as string), csv: (r) => r.date as string },
      { header: "Invoice", cell: (r) => (r.invoice as string) ?? "—", csv: (r) => (r.invoice as string) ?? "" },
      { header: "Supplier", cell: (r) => r.supplier as string, csv: (r) => r.supplier as string },
      { header: "CCY", cell: (r) => (r.ccy as string) || "UGX", csv: (r) => (r.ccy as string) || "UGX" },
      { header: "Subtotal", numeric: true, cell: (r) => fmtMoney(r.subtotal as number), csv: (r) => r.subtotal as number },
      { header: "Tax", numeric: true, cell: (r) => fmtMoney(r.tax as number), csv: (r) => r.tax as number },
      { header: "Total", numeric: true, cell: (r) => fmtMoney(r.total as number), csv: (r) => r.total as number },
      { header: "Status", cell: (r) => <StatusBadge status={r.status as string} />, csv: (r) => r.status as string },
    ];
  }

  // ------------------------------------------------------------ Production
  else if (tab === "production") {
    title = "Production Register";
    csvName = `production_${from}_${to}`;
    const rows = await db
      .select({
        doc: productionRuns.runNo,
        date: productionRuns.runDate,
        product: products.name,
        shift: productionRuns.shift,
        planned: productionRuns.plannedQty,
        good: productionRuns.producedQty,
        variance: productionRuns.varianceQty,
        status: productionRuns.status,
      })
      .from(productionRuns)
      .innerJoin(products, eq(productionRuns.productId, products.id))
      .where(and(gte(productionRuns.runDate, from), lte(productionRuns.runDate, to)))
      .orderBy(desc(productionRuns.id));
    data = rows.map((r) => {
      const good = r.good ?? 0;
      const variance = r.variance ?? 0;
      const yield_ = r.planned > 0 ? (good / r.planned) * 100 : null;
      return { ...r, good, variance, yield_ };
    });
    // Short of plan (negative) is the problem (red); on or over plan is fine (green).
    const ocell = (r: Record<string, unknown>, node: React.ReactNode) => {
      const v = r.variance as number;
      return (
        <span
          className={cn(
            "inline-block rounded px-1.5 py-0.5 font-medium",
            v < 0 ? "bg-danger-soft text-danger" : v > 0 ? "bg-ok-soft text-ok" : "",
          )}
        >
          {node}
        </span>
      );
    };
    cols = [
      { header: "Doc #", cell: (r) => <span className="num">{r.doc as string}</span>, csv: (r) => r.doc as string },
      { header: "Date", cell: (r) => fmtDate(r.date as string), csv: (r) => r.date as string },
      { header: "Product", cell: (r) => r.product as string, csv: (r) => r.product as string },
      { header: "Shift", cell: (r) => (r.shift as string) ?? "—", csv: (r) => (r.shift as string) ?? "" },
      { header: "Planned", numeric: true, cell: (r) => fmtQty(r.planned as number), csv: (r) => r.planned as number },
      { header: "Good", numeric: true, cell: (r) => fmtQty(r.good as number), csv: (r) => r.good as number },
      {
        header: "Variance",
        numeric: true,
        cell: (r) => {
          const v = r.variance as number;
          return ocell(r, `${v > 0 ? "+" : ""}${fmtQty(v)}`);
        },
        csv: (r) => r.variance as number,
      },
      {
        header: "Yield %",
        numeric: true,
        cell: (r) => (r.yield_ == null ? "—" : pct(r.yield_ as number)),
        csv: (r) => (r.yield_ == null ? "" : (r.yield_ as number).toFixed(1)),
      },
      { header: "Status", cell: (r) => <StatusBadge status={r.status as string} />, csv: (r) => r.status as string },
    ];
  }

  // ------------------------------------------------------------ Sales
  else if (tab === "sales") {
    title = "Sales Register";
    csvName = `sales_${from}_${to}`;
    const rows = await db
      .select({
        doc: invoices.invoiceNo,
        date: invoices.invoiceDate,
        customer: customers.name,
        taxRate: invoices.taxRate,
        total: invoices.total,
        paid: sql<number>`coalesce((select sum(pa.amount) from payment_allocations pa where pa.invoice_id = "invoices"."id"), 0)::float`,
      })
      .from(invoices)
      .innerJoin(customers, eq(invoices.customerId, customers.id))
      .where(and(gte(invoices.invoiceDate, from), lte(invoices.invoiceDate, to)))
      .orderBy(desc(invoices.id));
    data = rows.map((r) => {
      const subtotal = r.taxRate ? r.total / (1 + r.taxRate / 100) : r.total;
      const status = r.paid >= r.total - 0.005 ? "paid" : r.paid > 0 ? "partial" : "unpaid";
      return { ...r, subtotal, tax: r.total - subtotal, status };
    });
    const totalValue = rows.reduce((s, r) => s + r.total, 0);
    stats = [
      { label: "Records", value: rows.length },
      { label: "Total value", value: fmtMoney(totalValue) },
    ];
    cols = [
      { header: "Doc #", cell: (r) => <span className="num">{r.doc as string}</span>, csv: (r) => r.doc as string },
      { header: "Date", cell: (r) => fmtDate(r.date as string), csv: (r) => r.date as string },
      { header: "Customer", cell: (r) => r.customer as string, csv: (r) => r.customer as string },
      { header: "CCY", cell: () => "UGX", csv: () => "UGX" },
      { header: "Subtotal", numeric: true, cell: (r) => fmtMoney(r.subtotal as number), csv: (r) => r.subtotal as number },
      { header: "Tax", numeric: true, cell: (r) => fmtMoney(r.tax as number), csv: (r) => r.tax as number },
      { header: "Total", numeric: true, cell: (r) => fmtMoney(r.total as number), csv: (r) => r.total as number },
      { header: "Status", cell: (r) => <StatusBadge status={r.status as string} />, csv: (r) => r.status as string },
    ];
  }

  // ------------------------------------------------------------ Variance
  else if (tab === "variance") {
    title = "BOM vs Actual Variance";
    csvName = `variance_${from}_${to}`;
    const rows = await db
      .select({
        doc: productionRuns.runNo,
        date: productionRuns.runDate,
        product: products.name,
        material: rawMaterials.name,
        standard: productionConsumption.standardQty,
        actual: productionConsumption.actualQty,
        cost: rawMaterials.avgCost,
      })
      .from(productionConsumption)
      .innerJoin(productionRuns, eq(productionConsumption.runId, productionRuns.id))
      .innerJoin(products, eq(productionRuns.productId, products.id))
      .innerJoin(rawMaterials, eq(productionConsumption.materialId, rawMaterials.id))
      .where(
        and(
          eq(productionRuns.status, "completed"),
          gte(productionRuns.runDate, from),
          lte(productionRuns.runDate, to),
        ),
      )
      .orderBy(desc(productionRuns.id), asc(rawMaterials.name));
    data = rows.map((r) => {
      const actual = r.actual ?? 0;
      const variance = actual - r.standard;
      return {
        ...r,
        actual,
        variance,
        variancePct: r.standard ? (variance / r.standard) * 100 : null,
        varianceValue: variance * r.cost,
      };
    });
    // More used than the recipe called for is a cost overrun (red); on
    // standard or under is a good outcome (green) — matches the tint used on
    // the production run's own variance table.
    const vcell = (r: Record<string, unknown>, node: React.ReactNode) => {
      const v = r.variance as number;
      return (
        <span
          className={cn(
            "inline-block rounded px-1.5 py-0.5 font-medium",
            v > 0 ? "bg-danger-soft text-danger" : "bg-ok-soft text-ok",
          )}
        >
          {node}
        </span>
      );
    };
    cols = [
      { header: "Production", cell: (r) => <span className="num">{r.doc as string}</span>, csv: (r) => r.doc as string },
      { header: "Date", cell: (r) => fmtDate(r.date as string), csv: (r) => r.date as string },
      { header: "Product", cell: (r) => r.product as string, csv: (r) => r.product as string },
      { header: "Material", cell: (r) => r.material as string, csv: (r) => r.material as string },
      { header: "Std qty", numeric: true, cell: (r) => fmtQty(r.standard as number), csv: (r) => r.standard as number },
      { header: "Actual qty", numeric: true, cell: (r) => fmtQty(r.actual as number), csv: (r) => r.actual as number },
      {
        header: "Variance",
        numeric: true,
        cell: (r) => vcell(r, `${(r.variance as number) > 0 ? "+" : ""}${fmtQty(r.variance as number)}`),
        csv: (r) => r.variance as number,
      },
      {
        header: "Variance %",
        numeric: true,
        cell: (r) => (r.variancePct == null ? "—" : vcell(r, pct(r.variancePct as number))),
        csv: (r) => (r.variancePct == null ? "" : (r.variancePct as number).toFixed(1)),
      },
      {
        header: "Variance value",
        numeric: true,
        cell: (r) => vcell(r, fmtMoney(r.varianceValue as number)),
        csv: (r) => Math.round(r.varianceValue as number),
      },
    ];
  }

  // ------------------------------------------------------------ Wastage by material
  else if (tab === "wastage-material") {
    title = "Wastage by Material";
    csvName = `wastage_material_${from}_${to}`;
    const rows = await db
      .select({
        code: rawMaterials.code,
        material: rawMaterials.name,
        unit: rawMaterials.unit,
        runs: sql<number>`count(distinct ${productionRuns.id})::int`,
        standard: sql<number>`coalesce(sum(${productionConsumption.standardQty}), 0)::float`,
        actual: sql<number>`coalesce(sum(${productionConsumption.actualQty}), 0)::float`,
        cost: rawMaterials.avgCost,
      })
      .from(productionConsumption)
      .innerJoin(productionRuns, eq(productionConsumption.runId, productionRuns.id))
      .innerJoin(rawMaterials, eq(productionConsumption.materialId, rawMaterials.id))
      .where(
        and(
          eq(productionRuns.status, "completed"),
          gte(productionRuns.runDate, from),
          lte(productionRuns.runDate, to),
        ),
      )
      .groupBy(rawMaterials.id)
      .orderBy(desc(sql`sum(${productionConsumption.actualQty}) - sum(${productionConsumption.standardQty})`));
    data = rows.map((r) => {
      const wasted = r.actual - r.standard;
      const consumedVal = r.actual * r.cost;
      const wastedVal = wasted * r.cost;
      return { ...r, wasted, consumedVal, wastedVal, wastePct: consumedVal ? (wastedVal / consumedVal) * 100 : 0 };
    });
    const totWasted = data.reduce((s, r) => s + (r.wastedVal as number), 0);
    const totConsumed = data.reduce((s, r) => s + (r.consumedVal as number), 0);
    stats = [
      { label: "Materials with waste", value: data.filter((r) => (r.wasted as number) > 0).length },
      { label: "Total wasted (UGX)", value: fmtMoney(totWasted) },
      { label: "Total consumed (UGX)", value: fmtMoney(totConsumed) },
      { label: "Waste % of consumed", value: totConsumed ? pct((totWasted / totConsumed) * 100) : "0.0%" },
    ];
    const wcell = (r: Record<string, unknown>, node: React.ReactNode) => (
      <span className={cn((r.wasted as number) > 0 && "text-danger")}>{node}</span>
    );
    cols = [
      { header: "Code", cell: (r) => <span className="num">{r.code as string}</span>, csv: (r) => r.code as string },
      { header: "Material", cell: (r) => r.material as string, csv: (r) => r.material as string },
      { header: "UOM", cell: (r) => r.unit as string, csv: (r) => r.unit as string },
      { header: "Runs", numeric: true, cell: (r) => r.runs as number, csv: (r) => r.runs as number },
      { header: "Standard qty", numeric: true, cell: (r) => fmtQty(r.standard as number), csv: (r) => r.standard as number },
      { header: "Actual qty", numeric: true, cell: (r) => fmtQty(r.actual as number), csv: (r) => r.actual as number },
      {
        header: "Wasted qty",
        numeric: true,
        cell: (r) => wcell(r, fmtQty(r.wasted as number)),
        csv: (r) => r.wasted as number,
      },
      {
        header: "Waste %",
        numeric: true,
        cell: (r) => wcell(r, pct(r.wastePct as number)),
        csv: (r) => (r.wastePct as number).toFixed(1),
      },
      {
        header: "Wasted (UGX)",
        numeric: true,
        cell: (r) => wcell(r, fmtMoney(r.wastedVal as number)),
        csv: (r) => Math.round(r.wastedVal as number),
      },
      { header: "Consumed (UGX)", numeric: true, cell: (r) => fmtMoney(r.consumedVal as number), csv: (r) => Math.round(r.consumedVal as number) },
    ];
  }

  // ------------------------------------------------------------ Wastage by product
  else if (tab === "wastage-product") {
    title = "Wastage by Product";
    csvName = `wastage_product_${from}_${to}`;
    const [runAgg, consAgg] = await Promise.all([
      db
        .select({
          productId: products.id,
          code: products.code,
          product: products.name,
          runs: sql<number>`count(*)::int`,
          good: sql<number>`coalesce(sum(${productionRuns.producedQty}), 0)::float`,
          variance: sql<number>`coalesce(sum(${productionRuns.varianceQty}), 0)::float`,
        })
        .from(productionRuns)
        .innerJoin(products, eq(productionRuns.productId, products.id))
        .where(
          and(
            eq(productionRuns.status, "completed"),
            gte(productionRuns.runDate, from),
            lte(productionRuns.runDate, to),
          ),
        )
        .groupBy(products.id),
      db
        .select({
          productId: productionRuns.productId,
          consumed: sql<number>`coalesce(sum(${productionConsumption.actualQty} * ${rawMaterials.avgCost}), 0)::float`,
          wasted: sql<number>`coalesce(sum((${productionConsumption.actualQty} - ${productionConsumption.standardQty}) * ${rawMaterials.avgCost}), 0)::float`,
        })
        .from(productionConsumption)
        .innerJoin(productionRuns, eq(productionConsumption.runId, productionRuns.id))
        .innerJoin(rawMaterials, eq(productionConsumption.materialId, rawMaterials.id))
        .where(
          and(
            eq(productionRuns.status, "completed"),
            gte(productionRuns.runDate, from),
            lte(productionRuns.runDate, to),
          ),
        )
        .groupBy(productionRuns.productId),
    ]);
    const consMap = new Map(consAgg.map((c) => [c.productId, c]));
    data = runAgg
      .map((r) => {
        const c = consMap.get(r.productId);
        const consumedVal = c?.consumed ?? 0;
        const wastedVal = c?.wasted ?? 0;
        return {
          ...r,
          consumedVal,
          wastedVal,
          wastePct: consumedVal ? (wastedVal / consumedVal) * 100 : 0,
          wastePerUnit: r.good ? wastedVal / r.good : 0,
        };
      })
      .sort((a, b) => (b.wastedVal as number) - (a.wastedVal as number));
    const totWasted = data.reduce((s, r) => s + (r.wastedVal as number), 0);
    const totConsumed = data.reduce((s, r) => s + (r.consumedVal as number), 0);
    stats = [
      { label: "Products with waste", value: data.filter((r) => (r.wastedVal as number) > 0).length },
      { label: "Total wasted (UGX)", value: fmtMoney(totWasted) },
      { label: "Total consumed (UGX)", value: fmtMoney(totConsumed) },
      { label: "Waste % of consumed", value: totConsumed ? pct((totWasted / totConsumed) * 100) : "0.0%" },
    ];
    const wcell = (r: Record<string, unknown>, node: React.ReactNode) => (
      <span className={cn((r.wastedVal as number) > 0 && "text-danger")}>{node}</span>
    );
    cols = [
      { header: "Code", cell: (r) => <span className="num">{r.code as string}</span>, csv: (r) => r.code as string },
      { header: "Product", cell: (r) => r.product as string, csv: (r) => r.product as string },
      { header: "Runs", numeric: true, cell: (r) => r.runs as number, csv: (r) => r.runs as number },
      { header: "Good output", numeric: true, cell: (r) => fmtQty(r.good as number), csv: (r) => r.good as number },
      {
        header: "Variance",
        numeric: true,
        cell: (r) => {
          const v = r.variance as number;
          return (
            <span
              className={cn(
                "inline-block rounded px-1.5 py-0.5 font-medium",
                v < 0 ? "bg-danger-soft text-danger" : v > 0 ? "bg-ok-soft text-ok" : "",
              )}
            >
              {v > 0 ? "+" : ""}
              {fmtQty(v)}
            </span>
          );
        },
        csv: (r) => r.variance as number,
      },
      {
        header: "Wasted (UGX)",
        numeric: true,
        cell: (r) => wcell(r, fmtMoney(r.wastedVal as number)),
        csv: (r) => Math.round(r.wastedVal as number),
      },
      { header: "Consumed (UGX)", numeric: true, cell: (r) => fmtMoney(r.consumedVal as number), csv: (r) => Math.round(r.consumedVal as number) },
      {
        header: "Waste %",
        numeric: true,
        cell: (r) => wcell(r, pct(r.wastePct as number)),
        csv: (r) => (r.wastePct as number).toFixed(1),
      },
      { header: "Waste / unit", numeric: true, cell: (r) => fmtMoney(r.wastePerUnit as number), csv: (r) => Math.round(r.wastePerUnit as number) },
    ];
  }

  // ------------------------------------------------------------ Low stock
  else if (tab === "low-stock") {
    title = "Low Stock";
    csvName = "low_stock";
    const rows = await db
      .select()
      .from(rawMaterials)
      .where(and(eq(rawMaterials.archived, false), lt(rawMaterials.currentStock, rawMaterials.minStock)))
      .orderBy(desc(sql`${rawMaterials.minStock} - ${rawMaterials.currentStock}`));
    data = rows.map((m) => ({
      code: m.code,
      material: m.name,
      unit: m.unit,
      balance: m.currentStock,
      reorder: m.minStock,
      shortfall: m.minStock - m.currentStock,
    }));
    stats = [{ label: "Records", value: data.length }];
    cols = [
      { header: "Code", cell: (r) => <span className="num">{r.code as string}</span>, csv: (r) => r.code as string },
      { header: "Material", cell: (r) => r.material as string, csv: (r) => r.material as string },
      { header: "UOM", cell: (r) => r.unit as string, csv: (r) => r.unit as string },
      { header: "Balance", numeric: true, cell: (r) => <span className="font-semibold text-danger">{fmtQty(r.balance as number)}</span>, csv: (r) => r.balance as number },
      { header: "Reorder level", numeric: true, cell: (r) => fmtQty(r.reorder as number), csv: (r) => r.reorder as number },
      { header: "Shortfall", numeric: true, cell: (r) => fmtQty(r.shortfall as number), csv: (r) => r.shortfall as number },
    ];
  }

  // ------------------------------------------------------------ Reorder suggestions
  else {
    title = "Reorder Suggestions";
    csvName = "reorder_suggestions";
    const WINDOW = 30;
    const LEAD = 7;
    const since = new Date(Date.now() - WINDOW * 86400000);
    const [consumed, mats] = await Promise.all([
      db
        .select({
          materialId: stockLedger.itemId,
          consumed: sql<number>`coalesce(sum(${stockLedger.qtyOut}), 0)::float`,
        })
        .from(stockLedger)
        .where(
          and(
            eq(stockLedger.itemType, "rm"),
            eq(stockLedger.txnType, "production_out"),
            gte(stockLedger.createdAt, since),
          ),
        )
        .groupBy(stockLedger.itemId),
      db
        .select()
        .from(rawMaterials)
        .where(eq(rawMaterials.archived, false))
        .orderBy(asc(rawMaterials.code)),
    ]);
    const consMap = new Map(consumed.map((c) => [c.materialId, c.consumed]));
    let critical = 0;
    let warning = 0;
    let suggestedValue = 0;
    data = mats
      .map((m) => {
        const consumed30 = consMap.get(m.id) ?? 0;
        const avgDay = consumed30 / WINDOW;
        const daysCover = avgDay > 0 ? m.currentStock / avgDay : Infinity;
        const reorderPoint = avgDay * LEAD;
        const suggested = avgDay > 0 && m.currentStock < avgDay * (WINDOW + LEAD)
          ? Math.ceil(avgDay * (WINDOW + LEAD) - m.currentStock)
          : 0;
        const orderValue = suggested * m.avgCost;
        let urgency: "critical" | "warning" | "ok" = "ok";
        if (avgDay > 0 && daysCover < LEAD) urgency = "critical";
        else if (avgDay > 0 && daysCover < WINDOW) urgency = "warning";
        return {
          code: m.code,
          material: m.name,
          unit: m.unit,
          balance: m.currentStock,
          consumed30,
          avgDay,
          daysCover,
          reorderPoint,
          suggested,
          orderValue,
          urgency,
        };
      })
      .filter((r) => r.suggested > 0);
    for (const r of data) {
      if (r.urgency === "critical") critical++;
      else if (r.urgency === "warning") warning++;
      suggestedValue += r.orderValue as number;
    }
    data.sort((a, b) => (a.daysCover as number) - (b.daysCover as number));
    stats = [
      { label: "Window (days)", value: WINDOW },
      { label: "Lead time (days)", value: LEAD },
      { label: "Critical", value: critical },
      { label: "Warning", value: warning },
      { label: "Suggested order value", value: fmtMoney(suggestedValue) },
    ];
    const urgTone = (u: string): "danger" | "warn" | "ok" =>
      u === "critical" ? "danger" : u === "warning" ? "warn" : "ok";
    cols = [
      { header: "Code", cell: (r) => <span className="num">{r.code as string}</span>, csv: (r) => r.code as string },
      { header: "Material", cell: (r) => r.material as string, csv: (r) => r.material as string },
      { header: "UOM", cell: (r) => r.unit as string, csv: (r) => r.unit as string },
      { header: "Balance", numeric: true, cell: (r) => fmtQty(r.balance as number), csv: (r) => r.balance as number },
      { header: "Consumed (30d)", numeric: true, cell: (r) => fmtQty(r.consumed30 as number), csv: (r) => r.consumed30 as number },
      { header: "Avg / day", numeric: true, cell: (r) => fmtQty(r.avgDay as number), csv: (r) => (r.avgDay as number).toFixed(2) },
      {
        header: "Days of cover",
        numeric: true,
        cell: (r) => ((r.daysCover as number) === Infinity ? "∞" : Math.round(r.daysCover as number)),
        csv: (r) => ((r.daysCover as number) === Infinity ? "" : Math.round(r.daysCover as number)),
      },
      { header: "Reorder point", numeric: true, cell: (r) => fmtQty(r.reorderPoint as number), csv: (r) => Math.round(r.reorderPoint as number) },
      { header: "Suggested order", numeric: true, cell: (r) => <span className="font-semibold">{fmtQty(r.suggested as number)}</span>, csv: (r) => r.suggested as number },
      { header: "Order value", numeric: true, cell: (r) => fmtMoney(r.orderValue as number), csv: (r) => Math.round(r.orderValue as number) },
      { header: "Urgency", cell: (r) => <Badge tone={urgTone(r.urgency as string)}>{r.urgency as string}</Badge>, csv: (r) => r.urgency as string },
    ];
  }

  const csvRows = data.map((r) => cols.map((c) => c.csv(r)));

  return (
    <>
      <PageHeader title="Operational reports" />
      <OpTabs active={tab} from={from} to={to} />

      <div className="mt-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold">{title}</h2>
          <OpExport
            filename={csvName}
            title={title}
            columns={cols.map((c) => ({ header: c.header, numeric: c.numeric }))}
            rows={csvRows}
          />
        </div>

        {showRange && <OpRange tab={tab} from={from} to={to} />}

        {stats.length > 0 && (
          <div
            className={cn(
              "grid gap-3",
              stats.length === 1 && "sm:grid-cols-2",
              stats.length === 2 && "sm:grid-cols-2",
              stats.length === 4 && "sm:grid-cols-2 lg:grid-cols-4",
              stats.length === 5 && "sm:grid-cols-2 lg:grid-cols-5",
            )}
          >
            {stats.map((s) => (
              <StatCard key={s.label} label={s.label} value={s.value} />
            ))}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line">
                {cols.map((c) => (
                  <th
                    key={c.header}
                    className={cn(
                      "whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint",
                      c.numeric ? "text-right" : "text-left",
                    )}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={cols.length} className="py-12 text-center text-[13px] text-ink-faint">
                    No data for this period.
                  </td>
                </tr>
              ) : (
                data.map((r, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    {cols.map((c) => (
                      <td
                        key={c.header}
                        className={cn("px-3 py-2", c.numeric ? "num text-right" : "text-[12.5px]")}
                      >
                        {c.cell(r)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="text-[12px] text-ink-faint">Showing {data.length} rows.</p>
      </div>
    </>
  );
}
