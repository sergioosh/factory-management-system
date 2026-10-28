import Link from "next/link";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  invoiceItems,
  invoices,
  payments,
  productionConsumption,
  productionRuns,
  products,
  purchaseItems,
  purchases,
  rawMaterials,
  salesOrders,
  stockLedger,
} from "@/db/schema";
import { requireSession } from "@/lib/session";
import { fmtMoney, fmtQty, fmtDateTime } from "@/lib/format";
import { SparkBars } from "@/components/ui/spark-bars";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function DashboardPage() {
  const session = await requireSession();

  const now = new Date();
  const today = iso(now);
  const monthStart = `${today.slice(0, 8)}01`;
  const d30 = new Date(now.getTime() - 29 * 86400000);
  const from30 = iso(d30);

  const LEAD = 7;

  // None of these depend on each other's results, so they're built as query
  // objects (Drizzle doesn't run them until awaited) and fired together —
  // one round trip's worth of latency instead of fifteen sequential ones.
  const purchQ = db.select({
    todayN: sql<number>`count(distinct ${purchases.id}) filter (where ${purchases.orderDate} = ${today})::int`,
    todayV: sql<number>`coalesce(sum(${purchaseItems.qty} * ${purchaseItems.rate}) filter (where ${purchases.orderDate} = ${today}), 0)::float`,
    mtdV: sql<number>`coalesce(sum(${purchaseItems.qty} * ${purchaseItems.rate}) filter (where ${purchases.orderDate} >= ${monthStart}), 0)::float`,
  }).from(purchases).leftJoin(purchaseItems, eq(purchaseItems.purchaseId, purchases.id));

  const prodQ = db.select({
    todayN: sql<number>`count(*) filter (where ${productionRuns.runDate} = ${today})::int`,
    todayQ: sql<number>`coalesce(sum(${productionRuns.producedQty}) filter (where ${productionRuns.runDate} = ${today}), 0)::float`,
    mtdQ: sql<number>`coalesce(sum(${productionRuns.producedQty}) filter (where ${productionRuns.runDate} >= ${monthStart}), 0)::float`,
  }).from(productionRuns).where(eq(productionRuns.status, "completed"));

  const salesQ = db.select({
    todayN: sql<number>`count(*) filter (where ${invoices.invoiceDate} = ${today})::int`,
    todayV: sql<number>`coalesce(sum(${invoices.total}) filter (where ${invoices.invoiceDate} = ${today}), 0)::float`,
    mtdV: sql<number>`coalesce(sum(${invoices.total}) filter (where ${invoices.invoiceDate} >= ${monthStart}), 0)::float`,
  }).from(invoices);

  const rmQ = db.select({
    value: sql<number>`coalesce(sum(${rawMaterials.currentStock} * ${rawMaterials.price}), 0)::float`,
    active: sql<number>`count(*)::int`,
    low: sql<number>`count(*) filter (where ${rawMaterials.currentStock} < ${rawMaterials.minStock})::int`,
  }).from(rawMaterials).where(eq(rawMaterials.archived, false));

  const fgQ = db.select({
    value: sql<number>`coalesce(sum(${products.currentStock} * ${products.sellingPrice}), 0)::float`,
    qty: sql<number>`coalesce(sum(${products.currentStock}), 0)::float`,
  }).from(products).where(eq(products.archived, false));

  const arRowsQ = db.select({
    invoiceDate: invoices.invoiceDate,
    total: invoices.total,
    paid: sql<number>`coalesce((select sum(pa.amount) from payment_allocations pa where pa.invoice_id = "invoices"."id"), 0)::float`,
  }).from(invoices);

  const wasteQ = db.select({
    value: sql<number>`coalesce(sum(greatest(${productionConsumption.actualQty} - ${productionConsumption.standardQty}, 0) * ${rawMaterials.price}), 0)::float`,
  })
    .from(productionConsumption)
    .innerJoin(productionRuns, eq(productionConsumption.runId, productionRuns.id))
    .innerJoin(rawMaterials, eq(productionConsumption.materialId, rawMaterials.id))
    .where(and(eq(productionRuns.status, "completed"), gte(productionRuns.runDate, monthStart)));

  const salesDailyQ = db.select({
    day: invoices.invoiceDate,
    v: sql<number>`coalesce(sum(${invoices.total}), 0)::float`,
  }).from(invoices).where(gte(invoices.invoiceDate, from30)).groupBy(invoices.invoiceDate);

  const prodDailyQ = db.select({
    day: productionRuns.runDate,
    v: sql<number>`coalesce(sum(${productionRuns.producedQty}), 0)::float`,
  })
    .from(productionRuns)
    .where(and(eq(productionRuns.status, "completed"), gte(productionRuns.runDate, from30)))
    .groupBy(productionRuns.runDate);

  const usageQ = db.select({
    itemId: stockLedger.itemId,
    out: sql<number>`coalesce(sum(${stockLedger.qtyOut}), 0)::float`,
  })
    .from(stockLedger)
    .where(and(eq(stockLedger.itemType, "rm"), gte(stockLedger.createdAt, d30)))
    .groupBy(stockLedger.itemId);

  const allMaterialsQ = db.select().from(rawMaterials).where(eq(rawMaterials.archived, false));

  const lowStockQ = db
    .select()
    .from(rawMaterials)
    .where(and(eq(rawMaterials.archived, false), lt(rawMaterials.currentStock, rawMaterials.minStock)))
    .orderBy(sql`${rawMaterials.currentStock} / nullif(${rawMaterials.minStock}, 0)`)
    .limit(6);

  const topProductsQ = db.select({
    name: products.name,
    qty: sql<number>`coalesce(sum(${invoiceItems.qty}), 0)::float`,
    value: sql<number>`coalesce(sum(${invoiceItems.qty} * ${invoiceItems.rate}), 0)::float`,
  })
    .from(invoiceItems)
    .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
    .innerJoin(products, eq(invoiceItems.productId, products.id))
    .where(gte(invoices.invoiceDate, monthStart))
    .groupBy(products.name)
    .orderBy(sql`sum(${invoiceItems.qty} * ${invoiceItems.rate}) desc`)
    .limit(5);

  const recentLedgerQ = db.select({
    id: stockLedger.id,
    txnType: stockLedger.txnType,
    qtyIn: stockLedger.qtyIn,
    qtyOut: stockLedger.qtyOut,
    refNo: stockLedger.refNo,
    createdAt: stockLedger.createdAt,
    rmName: sql<string | null>`(select name from ${rawMaterials} where id = ${stockLedger.itemId} and ${stockLedger.itemType} = 'rm')`,
    fgName: sql<string | null>`(select name from ${products} where id = ${stockLedger.itemId} and ${stockLedger.itemType} = 'fg')`,
  }).from(stockLedger).orderBy(desc(stockLedger.id)).limit(7);

  const openOrdersQ = db.select({
    status: salesOrders.status,
    n: sql<number>`count(*)::int`,
  })
    .from(salesOrders)
    .where(inArray(salesOrders.status, ["draft", "confirmed", "in_production", "ready", "invoiced"]))
    .groupBy(salesOrders.status);

  const [
    [purch],
    [prod],
    [sales],
    [rm],
    [fg],
    arRows,
    [waste],
    salesDaily,
    prodDaily,
    usage,
    allMaterials,
    lowStock,
    topProducts,
    recentLedger,
    openOrders,
  ] = await Promise.all([
    purchQ,
    prodQ,
    salesQ,
    rmQ,
    fgQ,
    arRowsQ,
    wasteQ,
    salesDailyQ,
    prodDailyQ,
    usageQ,
    allMaterialsQ,
    lowStockQ,
    topProductsQ,
    recentLedgerQ,
    openOrdersQ,
  ]);

  let arOpen = 0, arValue = 0, arOverdue = 0;
  for (const r of arRows) {
    const bal = r.total - r.paid;
    if (bal <= 0.005) continue;
    arOpen++;
    arValue += bal;
    if ((now.getTime() - new Date(r.invoiceDate).getTime()) / 86400000 > 30) arOverdue++;
  }

  // ---- 30-day series
  const series = (rows: { day: string; v: number }[]) => {
    const map = new Map(rows.map((r) => [r.day, r.v]));
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(d30.getTime() + i * 86400000);
      const key = iso(d);
      return { label: String(d.getDate()).padStart(2, "0"), value: map.get(key) ?? 0 };
    });
  };
  const salesSeries = series(salesDaily);
  const prodSeries = series(prodDaily);

  // ---- reorder suggestions: consumption rate (30d) vs stock, 7-day lead time
  const usageById = new Map(usage.map((u) => [u.itemId, u.out]));
  const reorder = allMaterials
    .map((m) => {
      const rate = (usageById.get(m.id) ?? 0) / 30;
      const daysLeft = rate > 0 ? m.currentStock / rate : Infinity;
      const level =
        daysLeft < LEAD || m.currentStock <= 0
          ? "critical"
          : daysLeft < LEAD * 2 || m.currentStock < m.minStock
            ? "warning"
            : null;
      return { ...m, rate, daysLeft, level };
    })
    .filter((m) => m.level)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const critical = reorder.filter((m) => m.level === "critical").length;
  const warning = reorder.filter((m) => m.level === "warning").length;
  const openOrderCount = openOrders.reduce((s, o) => s + o.n, 0);

  const Card = ({ className, children }: { className?: string; children: React.ReactNode }) => (
    <div className={cn("rounded-xl border border-line bg-surface", className)}>{children}</div>
  );

  return (
    <>
      <div className="mb-4">
        <h1 className="text-[18px] font-semibold leading-6">Welcome, {session.user.name}</h1>
        <p className="mt-0.5 text-[12.5px] text-ink-soft">
          {now.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })} ·
          numbers update live
        </p>
      </div>

      {/* today */}
      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Today’s purchases</div>
          <div className="num mt-1 text-[19px] font-semibold">UGX {fmtMoney(purch.todayV)}</div>
          <div className="text-[11.5px] text-ink-faint">{purch.todayN} POs · MTD UGX {fmtMoney(purch.mtdV)}</div>
        </Card>
        <Card className="border-warn/25 bg-warn-soft/50 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Today’s production</div>
          <div className="num mt-1 text-[19px] font-semibold">{fmtQty(prod.todayQ)}</div>
          <div className="text-[11.5px] text-ink-faint">{prod.todayN} runs · MTD {fmtQty(prod.mtdQ)}</div>
        </Card>
        <Card className="border-ok/25 bg-ok-soft/50 px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Today’s sales</div>
          <div className="num mt-1 text-[19px] font-semibold">UGX {fmtMoney(sales.todayV)}</div>
          <div className="text-[11.5px] text-ink-faint">{sales.todayN} invoices · MTD UGX {fmtMoney(sales.mtdV)}</div>
        </Card>
        <Link href="/stock/materials">
          <Card className={cn("px-4 py-3 hover:border-line-strong", rm.low > 0 && "border-danger/30 bg-danger-soft/40")}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Low-stock alerts</div>
            <div className={cn("num mt-1 text-[19px] font-semibold", rm.low > 0 && "text-danger")}>{rm.low}</div>
            <div className="text-[11.5px] text-ink-faint">materials at or below minimum</div>
          </Card>
        </Link>
      </div>

      {/* values */}
      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/stock/materials">
          <Card className="px-4 py-3 hover:border-line-strong">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Raw material stock value</div>
            <div className="num mt-1 text-[19px] font-semibold">UGX {fmtMoney(rm.value)}</div>
            <div className="text-[11.5px] text-ink-faint">across {rm.active} active materials</div>
          </Card>
        </Link>
        <Link href="/stock/products">
          <Card className="px-4 py-3 hover:border-line-strong">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Finished goods (at sell price)</div>
            <div className="num mt-1 text-[19px] font-semibold">UGX {fmtMoney(fg.value)}</div>
            <div className="text-[11.5px] text-ink-faint">{fmtQty(fg.qty)} units on hand</div>
          </Card>
        </Link>
        <Link href="/payments">
          <Card className={cn("px-4 py-3 hover:border-line-strong", arValue > 0 && "border-danger/20")}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Accounts receivable</div>
            <div className={cn("num mt-1 text-[19px] font-semibold", arValue > 0 && "text-danger")}>
              UGX {fmtMoney(arValue)}
            </div>
            <div className="text-[11.5px] text-ink-faint">{arOpen} open · {arOverdue} overdue (&gt;30d)</div>
          </Card>
        </Link>
        <Card className="px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Material waste this month</div>
          <div className={cn("num mt-1 text-[19px] font-semibold", waste.value > 0 && "text-warn")}>
            UGX {fmtMoney(waste.value)}
          </div>
          <div className="text-[11.5px] text-ink-faint">actual consumption above BOM standard</div>
        </Card>
      </div>

      {/* charts */}
      <div className="mb-3 grid gap-3 lg:grid-cols-2">
        {[
          { title: "Sales — 30 days", sub: "Invoiced totals per day (UGX)", data: salesSeries, total: fmtMoney(salesSeries.reduce((s, p) => s + p.value, 0)) },
          { title: "Production — 30 days", sub: "Completed output per day (qty)", data: prodSeries, total: fmtQty(prodSeries.reduce((s, p) => s + p.value, 0)) },
        ].map((c) => (
          <Card key={c.title} className="p-4">
            <div className="mb-2 flex items-start justify-between">
              <div>
                <h2 className="text-[13px] font-semibold">{c.title}</h2>
                <p className="text-[11.5px] text-ink-faint">{c.sub}</p>
              </div>
              <div className="text-right">
                <div className="text-[10.5px] uppercase tracking-wide text-ink-faint">30-day total</div>
                <div className="num text-[14px] font-semibold">{c.total}</div>
              </div>
            </div>
            <SparkBars points={c.data} />
          </Card>
        ))}
      </div>

      {/* lists */}
      <div className="mb-3 grid gap-3 lg:grid-cols-3">
        <Card>
          <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">Recent activity</h2>
            <Link href="/ledger" className="text-[11.5px] text-accent hover:underline">Full ledger</Link>
          </header>
          {recentLedger.length === 0 ? (
            <p className="px-4 py-7 text-center text-[12.5px] text-ink-faint">No movements yet</p>
          ) : (
            <div className="divide-y divide-(--color-line)">
              {recentLedger.map((l) => (
                <div key={l.id} className="px-4 py-2 text-[12.5px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">{l.rmName ?? l.fgName}</span>
                    <span className={cn("num shrink-0", l.qtyIn > 0 ? "text-ok" : "text-danger")}>
                      {l.qtyIn > 0 ? `+${fmtQty(l.qtyIn)}` : `−${fmtQty(l.qtyOut)}`}
                    </span>
                  </div>
                  <div className="text-[11px] text-ink-faint">
                    <span className="num">{l.refNo}</span> · {fmtDateTime(l.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">Low stock</h2>
            <Link href="/stock/materials" className="text-[11.5px] text-accent hover:underline">Open all</Link>
          </header>
          {lowStock.length === 0 ? (
            <p className="px-4 py-7 text-center text-[12.5px] text-ink-faint">
              All raw materials are above their minimum
            </p>
          ) : (
            <table className="w-full">
              <tbody>
                {lowStock.map((m) => (
                  <tr key={m.id} className="border-b border-line last:border-0">
                    <td className="max-w-0 truncate px-4 py-2 text-[12.5px]">{m.name}</td>
                    <td className="num px-2 py-2 text-right font-semibold text-danger">{fmtQty(m.currentStock, m.unit)}</td>
                    <td className="num px-4 py-2 text-right text-ink-faint">min {fmtQty(m.minStock)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">Top products this month</h2>
            <Link href="/reports/financial" className="text-[11.5px] text-accent hover:underline">Report</Link>
          </header>
          {topProducts.length === 0 ? (
            <p className="px-4 py-7 text-center text-[12.5px] text-ink-faint">No sales this month yet</p>
          ) : (
            <table className="w-full">
              <tbody>
                {topProducts.map((p) => (
                  <tr key={p.name} className="border-b border-line last:border-0">
                    <td className="max-w-0 truncate px-4 py-2 text-[12.5px]">{p.name}</td>
                    <td className="num px-2 py-2 text-right text-ink-soft">{fmtQty(p.qty)}</td>
                    <td className="num px-4 py-2 text-right">{fmtMoney(p.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {/* reorder + orders by stage */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">Reorder suggestions</h2>
            <Link href="/reports/operational" className="text-[11.5px] text-accent hover:underline">
              Full report
            </Link>
          </header>
          <div className="grid grid-cols-4 gap-2 border-b border-line px-4 py-2.5">
            <div className="rounded-lg bg-bg px-3 py-1.5">
              <div className="text-[10.5px] text-ink-faint">Window</div>
              <div className="text-[12.5px] font-semibold">30 days</div>
            </div>
            <div className="rounded-lg bg-bg px-3 py-1.5">
              <div className="text-[10.5px] text-ink-faint">Lead time</div>
              <div className="text-[12.5px] font-semibold">{LEAD} days</div>
            </div>
            <div className={cn("rounded-lg px-3 py-1.5", critical > 0 ? "bg-danger-soft" : "bg-bg")}>
              <div className="text-[10.5px] text-ink-faint">Critical</div>
              <div className={cn("num text-[12.5px] font-semibold", critical > 0 && "text-danger")}>{critical}</div>
            </div>
            <div className={cn("rounded-lg px-3 py-1.5", warning > 0 ? "bg-warn-soft" : "bg-bg")}>
              <div className="text-[10.5px] text-ink-faint">Warning</div>
              <div className={cn("num text-[12.5px] font-semibold", warning > 0 && "text-warn")}>{warning}</div>
            </div>
          </div>
          {reorder.length === 0 ? (
            <p className="px-4 py-5 text-[12.5px] text-ink-faint">
              No critical or warning items right now — consumption is comfortably within stock.
            </p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-line text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">
                  <th className="px-4 py-1.5 text-left">Material</th>
                  <th className="px-2 py-1.5 text-right">Stock</th>
                  <th className="px-2 py-1.5 text-right">Use / day</th>
                  <th className="px-2 py-1.5 text-right">Days left</th>
                  <th className="px-4 py-1.5 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {reorder.slice(0, 6).map((m) => (
                  <tr key={m.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-1.5 text-[12.5px]">{m.name}</td>
                    <td className="num px-2 py-1.5 text-right">{fmtQty(m.currentStock, m.unit)}</td>
                    <td className="num px-2 py-1.5 text-right text-ink-soft">{fmtQty(Math.round(m.rate * 1000) / 1000)}</td>
                    <td className={cn("num px-2 py-1.5 text-right font-semibold", m.level === "critical" ? "text-danger" : "text-warn")}>
                      {Number.isFinite(m.daysLeft) ? Math.floor(m.daysLeft) : "—"}
                    </td>
                    <td className="px-4 py-1.5 text-right">
                      <Badge tone={m.level === "critical" ? "danger" : "warn"}>{m.level}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card>
          <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <h2 className="text-[13px] font-semibold">Orders by stage</h2>
            <Link href="/orders" className="text-[11.5px] text-accent hover:underline">All orders</Link>
          </header>
          {openOrderCount === 0 ? (
            <p className="px-4 py-7 text-center text-[12.5px] text-ink-faint">No open orders</p>
          ) : (
            <div className="divide-y divide-(--color-line)">
              {["draft", "confirmed", "in_production", "ready", "invoiced"]
                .map((st) => ({ st, n: openOrders.find((o) => o.status === st)?.n ?? 0 }))
                .filter((x) => x.n > 0)
                .map(({ st, n }) => (
                  <div key={st} className="flex items-center justify-between px-4 py-2">
                    <StatusBadge status={st} />
                    <span className="num text-[13px]">{n}</span>
                  </div>
                ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
