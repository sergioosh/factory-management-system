import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bomItems,
  customers,
  invoiceItems,
  invoices,
  products,
  rawMaterials,
  stockLedger,
} from "@/db/schema";
import { requireView } from "@/lib/session";
import { fmtMoney, fmtQty, fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { FinTabs, FinRange, FinAsOf, FinExport, StatCard } from "./fin-client";
import { FIN_TABS, type ReportKey } from "./fin-tabs";

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
const todayIso = () => new Date().toISOString().slice(0, 10);
const pct = (n: number) => `${n.toFixed(1)}%`;

export default async function FinancialReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ report?: string; from?: string; to?: string; asOf?: string }>;
}) {
  await requireView("reports");
  const sp = await searchParams;
  const report: ReportKey = (FIN_TABS.find((t) => t.key === sp.report)?.key ?? "valuation") as ReportKey;
  const from = sp.from ?? monthStart();
  const to = sp.to ?? todayIso();
  const asOf = sp.asOf ?? todayIso();

  // Standard unit cost per finished product = Σ (BOM qty per unit × material moving-average cost)
  const bomRows = await db
    .select({
      productId: bomItems.productId,
      cost: sql<number>`coalesce(sum(${bomItems.qtyPerUnit} * ${rawMaterials.avgCost}), 0)::float`,
    })
    .from(bomItems)
    .innerJoin(rawMaterials, eq(bomItems.materialId, rawMaterials.id))
    .groupBy(bomItems.productId);
  const costMap = new Map(bomRows.map((b) => [b.productId, b.cost]));

  let title = "";
  let csvName = "report";
  let cols: Col[] = [];
  let data: Record<string, unknown>[] = [];
  let stats: { label: string; value: string | number }[] = [];
  let control: "range" | "asof" = "range";

  // ------------------------------------------------------------ Valuation
  if (report === "valuation") {
    control = "asof";
    title = "Stock Valuation";
    csvName = `valuation_${asOf}`;
    const asOfEnd = new Date(`${asOf}T23:59:59`);
    const bal = await db
      .select({
        itemType: stockLedger.itemType,
        itemId: stockLedger.itemId,
        bal: sql<number>`coalesce(sum(${stockLedger.qtyIn} - ${stockLedger.qtyOut}), 0)::float`,
      })
      .from(stockLedger)
      .where(lte(stockLedger.createdAt, asOfEnd))
      .groupBy(stockLedger.itemType, stockLedger.itemId);
    const balMap = new Map(bal.map((b) => [`${b.itemType}:${b.itemId}`, b.bal]));
    const [rms, fgs] = await Promise.all([
      db
        .select({ id: rawMaterials.id, code: rawMaterials.code, name: rawMaterials.name, unit: rawMaterials.unit, cost: rawMaterials.avgCost })
        .from(rawMaterials)
        .where(eq(rawMaterials.archived, false))
        .orderBy(asc(rawMaterials.code)),
      db
        .select({ id: products.id, code: products.code, name: products.name, unit: products.unit })
        .from(products)
        .where(eq(products.archived, false))
        .orderBy(asc(products.code)),
    ]);
    const rmRows = rms.map((m) => {
      const balance = balMap.get(`rm:${m.id}`) ?? 0;
      return { type: "RM", code: m.code, item: m.name, uom: m.unit, balance, unitCost: m.cost, value: balance * m.cost };
    });
    const fgRows = fgs.map((p) => {
      const balance = balMap.get(`fg:${p.id}`) ?? 0;
      const unitCost = costMap.get(p.id) ?? 0;
      return { type: "FG", code: p.code, item: p.name, uom: p.unit, balance, unitCost, value: balance * unitCost };
    });
    data = [...rmRows, ...fgRows];
    const rmValue = rmRows.reduce((s, r) => s + r.value, 0);
    const fgValue = fgRows.reduce((s, r) => s + r.value, 0);
    stats = [
      { label: "RM stock value", value: fmtMoney(rmValue) },
      { label: "FG stock value", value: fmtMoney(fgValue) },
      { label: "Total value", value: fmtMoney(rmValue + fgValue) },
    ];
    cols = [
      { header: "Type", cell: (r) => <Badge tone={r.type === "RM" ? "info" : "accent"}>{r.type as string}</Badge>, csv: (r) => r.type as string },
      { header: "Code", cell: (r) => <span className="num">{r.code as string}</span>, csv: (r) => r.code as string },
      { header: "Item", cell: (r) => r.item as string, csv: (r) => r.item as string },
      { header: "UOM", cell: (r) => r.uom as string, csv: (r) => r.uom as string },
      { header: "Balance", numeric: true, cell: (r) => fmtQty(r.balance as number), csv: (r) => r.balance as number },
      { header: "Unit cost", numeric: true, cell: (r) => fmtMoney(r.unitCost as number), csv: (r) => Math.round(r.unitCost as number) },
      { header: "Value", numeric: true, cell: (r) => fmtMoney(r.value as number), csv: (r) => Math.round(r.value as number) },
    ];
  }

  // ------------------------------------------------------------ Profit summary
  else if (report === "profit") {
    title = "Profit Summary";
    csvName = `profit_${from}_${to}`;
    const [rev] = await db
      .select({ v: sql<number>`coalesce(sum(${invoices.total}), 0)::float` })
      .from(invoices)
      .where(and(gte(invoices.invoiceDate, from), lte(invoices.invoiceDate, to)));
    const items = await db
      .select({
        productId: invoiceItems.productId,
        qty: sql<number>`coalesce(sum(${invoiceItems.qty}), 0)::float`,
        net: sql<number>`coalesce(sum(${invoiceItems.qty} * ${invoiceItems.rate}), 0)::float`,
      })
      .from(invoiceItems)
      .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
      .where(and(gte(invoices.invoiceDate, from), lte(invoices.invoiceDate, to)))
      .groupBy(invoiceItems.productId);
    const netRevenue = items.reduce((s, r) => s + r.net, 0);
    const cogs = items.reduce((s, r) => s + r.qty * (costMap.get(r.productId) ?? 0), 0);
    const revenue = rev.v;
    const grossProfit = netRevenue - cogs;
    const margin = netRevenue ? (grossProfit / netRevenue) * 100 : 0;
    data = [
      { metric: "Revenue (incl. tax)", value: revenue, display: fmtMoney(revenue) },
      { metric: "Tax collected", value: revenue - netRevenue, display: fmtMoney(revenue - netRevenue) },
      { metric: "Net revenue (ex-tax)", value: netRevenue, display: fmtMoney(netRevenue) },
      { metric: "Cost of goods sold", value: cogs, display: fmtMoney(cogs) },
      { metric: "Gross profit", value: grossProfit, display: fmtMoney(grossProfit) },
      { metric: "Gross margin %", value: +margin.toFixed(1), display: pct(margin) },
    ];
    cols = [
      { header: "Metric", cell: (r) => r.metric as string, csv: (r) => r.metric as string },
      { header: "Value", numeric: true, cell: (r) => r.display as string, csv: (r) => r.value as number },
    ];
  }

  // ------------------------------------------------------------ Profit by product
  else if (report === "profit_by_product") {
    title = "Profit by Product";
    csvName = `profit_product_${from}_${to}`;
    const items = await db
      .select({
        productId: invoiceItems.productId,
        code: products.code,
        product: products.name,
        qty: sql<number>`coalesce(sum(${invoiceItems.qty}), 0)::float`,
        revenue: sql<number>`coalesce(sum(${invoiceItems.qty} * ${invoiceItems.rate}), 0)::float`,
      })
      .from(invoiceItems)
      .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
      .innerJoin(products, eq(invoiceItems.productId, products.id))
      .where(and(gte(invoices.invoiceDate, from), lte(invoices.invoiceDate, to)))
      .groupBy(invoiceItems.productId, products.code, products.name);
    data = items
      .map((r) => {
        const cogs = r.qty * (costMap.get(r.productId) ?? 0);
        const gp = r.revenue - cogs;
        return { ...r, cogs, gp, margin: r.revenue ? (gp / r.revenue) * 100 : 0 };
      })
      .sort((a, b) => (b.gp as number) - (a.gp as number));
    const tRev = data.reduce((s, r) => s + (r.revenue as number), 0);
    const tCogs = data.reduce((s, r) => s + (r.cogs as number), 0);
    const tGp = tRev - tCogs;
    stats = [
      { label: "Products", value: data.length },
      { label: "Revenue", value: fmtMoney(tRev) },
      { label: "COGS", value: fmtMoney(tCogs) },
      { label: "Gross profit", value: fmtMoney(tGp) },
      { label: "Margin %", value: tRev ? pct((tGp / tRev) * 100) : "0.0%" },
    ];
    cols = profitCols("Product");
  }

  // ------------------------------------------------------------ Profit by customer
  else if (report === "profit_by_customer") {
    title = "Profit by Customer";
    csvName = `profit_customer_${from}_${to}`;
    const rows = await db
      .select({
        customerId: invoices.customerId,
        code: customers.code,
        customer: customers.name,
        invoiceId: invoiceItems.invoiceId,
        productId: invoiceItems.productId,
        qty: invoiceItems.qty,
        rate: invoiceItems.rate,
      })
      .from(invoiceItems)
      .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
      .innerJoin(customers, eq(invoices.customerId, customers.id))
      .where(and(gte(invoices.invoiceDate, from), lte(invoices.invoiceDate, to)));
    const byCust = new Map<
      number,
      { code: string | null; customer: string; revenue: number; cogs: number; invoices: Set<number> }
    >();
    for (const r of rows) {
      const a =
        byCust.get(r.customerId) ??
        { code: r.code, customer: r.customer, revenue: 0, cogs: 0, invoices: new Set<number>() };
      a.revenue += r.qty * r.rate;
      a.cogs += r.qty * (costMap.get(r.productId) ?? 0);
      a.invoices.add(r.invoiceId);
      byCust.set(r.customerId, a);
    }
    data = [...byCust.values()]
      .map((a) => ({
        code: a.code,
        customer: a.customer,
        sales: a.invoices.size,
        revenue: a.revenue,
        cogs: a.cogs,
        gp: a.revenue - a.cogs,
        margin: a.revenue ? ((a.revenue - a.cogs) / a.revenue) * 100 : 0,
      }))
      .sort((x, y) => y.gp - x.gp);
    const tRev = data.reduce((s, r) => s + (r.revenue as number), 0);
    const tCogs = data.reduce((s, r) => s + (r.cogs as number), 0);
    const tGp = tRev - tCogs;
    stats = [
      { label: "Customers", value: data.length },
      { label: "Revenue", value: fmtMoney(tRev) },
      { label: "COGS", value: fmtMoney(tCogs) },
      { label: "Gross profit", value: fmtMoney(tGp) },
      { label: "Margin %", value: tRev ? pct((tGp / tRev) * 100) : "0.0%" },
    ];
    cols = profitCols("Customer", true);
  }

  // ------------------------------------------------------------ AR aging
  else {
    control = "asof";
    title = "AR Aging";
    csvName = `ar_aging_${asOf}`;
    const rows = await db
      .select({
        invoiceDate: invoices.invoiceDate,
        total: invoices.total,
        customerId: invoices.customerId,
        code: customers.code,
        customer: customers.name,
        creditLimit: customers.creditLimit,
        paid: sql<number>`coalesce((select sum(pa.amount) from payment_allocations pa where pa.invoice_id = "invoices"."id"), 0)::float`,
      })
      .from(invoices)
      .innerJoin(customers, eq(invoices.customerId, customers.id));
    const asOfDate = new Date(`${asOf}T23:59:59`);
    const byCust = new Map<
      number,
      { code: string | null; customer: string; creditLimit: number; b: number[]; outstanding: number }
    >();
    for (const r of rows) {
      const balance = r.total - r.paid;
      if (balance <= 0.005) continue;
      if (new Date(`${r.invoiceDate}T00:00:00`) > asOfDate) continue;
      const age = Math.floor((asOfDate.getTime() - new Date(`${r.invoiceDate}T00:00:00`).getTime()) / 86400000);
      const idx = age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3;
      const a =
        byCust.get(r.customerId) ??
        { code: r.code, customer: r.customer, creditLimit: r.creditLimit, b: [0, 0, 0, 0], outstanding: 0 };
      a.b[idx] += balance;
      a.outstanding += balance;
      byCust.set(r.customerId, a);
    }
    data = [...byCust.values()]
      .map((a) => ({
        code: a.code,
        customer: a.customer,
        creditLimit: a.creditLimit,
        b0: a.b[0],
        b1: a.b[1],
        b2: a.b[2],
        b3: a.b[3],
        outstanding: a.outstanding,
        overLimit: a.creditLimit > 0 ? Math.max(0, a.outstanding - a.creditLimit) : 0,
      }))
      .sort((x, y) => y.outstanding - x.outstanding);
    const sum = (k: string) => data.reduce((s, r) => s + (r[k] as number), 0);
    stats = [
      { label: "Customers", value: data.length },
      { label: "0-30 days", value: fmtMoney(sum("b0")) },
      { label: "31-60 days", value: fmtMoney(sum("b1")) },
      { label: "61-90 days", value: fmtMoney(sum("b2")) },
      { label: "90+ days", value: fmtMoney(sum("b3")) },
      { label: "Outstanding", value: fmtMoney(sum("outstanding")) },
    ];
    const m = (r: Record<string, unknown>, k: string) => {
      const v = r[k] as number;
      return v ? fmtMoney(v) : "—";
    };
    cols = [
      { header: "Code", cell: (r) => <span className="num">{(r.code as string) ?? "—"}</span>, csv: (r) => (r.code as string) ?? "" },
      { header: "Customer", cell: (r) => r.customer as string, csv: (r) => r.customer as string },
      { header: "Credit limit", numeric: true, cell: (r) => ((r.creditLimit as number) > 0 ? fmtMoney(r.creditLimit as number) : "—"), csv: (r) => r.creditLimit as number },
      { header: "0-30 days", numeric: true, cell: (r) => m(r, "b0"), csv: (r) => Math.round(r.b0 as number) },
      { header: "31-60 days", numeric: true, cell: (r) => m(r, "b1"), csv: (r) => Math.round(r.b1 as number) },
      { header: "61-90 days", numeric: true, cell: (r) => m(r, "b2"), csv: (r) => Math.round(r.b2 as number) },
      { header: "90+ days", numeric: true, cell: (r) => <span className={cn((r.b3 as number) > 0 && "text-danger")}>{m(r, "b3")}</span>, csv: (r) => Math.round(r.b3 as number) },
      { header: "Outstanding", numeric: true, cell: (r) => <span className="font-semibold">{fmtMoney(r.outstanding as number)}</span>, csv: (r) => Math.round(r.outstanding as number) },
      { header: "Over limit", numeric: true, cell: (r) => ((r.overLimit as number) > 0 ? <span className="font-semibold text-danger">{fmtMoney(r.overLimit as number)}</span> : "—"), csv: (r) => Math.round(r.overLimit as number) },
    ];
  }

  const csvRows = data.map((r) => cols.map((c) => c.csv(r)));

  return (
    <>
      <PageHeader title="Financial reports" />
      <FinTabs active={report} from={from} to={to} asOf={asOf} />

      <div className="mt-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[16px] font-semibold">{title}</h2>
          <FinExport
            filename={csvName}
            title={title}
            columns={cols.map((c) => ({ header: c.header, numeric: c.numeric }))}
            rows={csvRows}
          />
        </div>

        {control === "range" ? (
          <FinRange report={report} from={from} to={to} />
        ) : (
          <FinAsOf report={report} asOf={asOf} />
        )}

        {stats.length > 0 && (
          <div
            className={cn(
              "grid gap-3",
              stats.length === 3 && "sm:grid-cols-3",
              stats.length === 5 && "sm:grid-cols-2 lg:grid-cols-5",
              stats.length === 6 && "sm:grid-cols-3 lg:grid-cols-6",
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
                      <td key={c.header} className={cn("px-3 py-2", c.numeric ? "num text-right" : "text-[12.5px]")}>
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

function profitCols(entity: "Product" | "Customer", customer = false): Col[] {
  return [
    { header: "Code", cell: (r) => <span className="num">{(r.code as string) ?? "—"}</span>, csv: (r) => (r.code as string) ?? "" },
    { header: entity, cell: (r) => (customer ? (r.customer as string) : (r.product as string)), csv: (r) => (customer ? (r.customer as string) : (r.product as string)) },
    customer
      ? { header: "Sales", numeric: true, cell: (r) => r.sales as number, csv: (r) => r.sales as number }
      : { header: "Qty sold", numeric: true, cell: (r) => fmtQty(r.qty as number), csv: (r) => r.qty as number },
    { header: "Revenue (ex-tax)", numeric: true, cell: (r) => fmtMoney(r.revenue as number), csv: (r) => Math.round(r.revenue as number) },
    { header: "COGS", numeric: true, cell: (r) => fmtMoney(r.cogs as number), csv: (r) => Math.round(r.cogs as number) },
    {
      header: "Gross profit",
      numeric: true,
      cell: (r) => <span className={cn((r.gp as number) < 0 && "text-danger")}>{fmtMoney(r.gp as number)}</span>,
      csv: (r) => Math.round(r.gp as number),
    },
    { header: "Margin %", numeric: true, cell: (r) => `${(r.margin as number).toFixed(1)}%`, csv: (r) => (r.margin as number).toFixed(1) },
  ];
}
