"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Add } from "iconsax-reactjs";
import { fmtDate, fmtMoney, fmtQty } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column, type FilterDef } from "@/components/ui/table";

type InvoiceRow = {
  id: number;
  poNo: string;
  invoiceNo: string | null;
  orderDate: string;
  status: string;
  currency: string | null;
  taxRate: number;
  total: number;
  notes: string | null;
  createdAt: Date;
  supplierName: string;
  createdBy: string | null;
};

type InvoiceItem = {
  purchaseId: number | null;
  grnNo: string;
  materialCode: string;
  materialName: string;
  unit: string;
  qty: number;
  rate: number;
};

export function PurchasesClient({
  rows,
  items,
  canCreate,
}: {
  rows: InvoiceRow[];
  items: InvoiceItem[];
  canCreate: boolean;
}) {
  const [detail, setDetail] = useState<InvoiceRow | null>(null);

  const filterDefs: FilterDef<InvoiceRow>[] = useMemo(() => {
    const supplierNames = [...new Set(rows.map((r) => r.supplierName))].sort();
    return [
      {
        key: "supplierName",
        label: "Supplier",
        options: supplierNames.map((s) => ({ value: s, label: s })),
        getValue: (r) => r.supplierName,
      },
    ];
  }, [rows]);

  const columns: Column<InvoiceRow>[] = [
    { key: "poNo", label: "Doc #", className: "num w-24", sortValue: (r) => r.poNo },
    { key: "invoiceNo", label: "Invoice", className: "num", render: (r) => r.invoiceNo ?? "—" },
    {
      key: "orderDate",
      label: "Date",
      sortValue: (r) => r.orderDate,
      render: (r) => fmtDate(r.orderDate),
    },
    { key: "supplierName", label: "Supplier" },
    { key: "currency", label: "CCY", className: "w-16 text-ink-soft", render: (r) => r.currency || "UGX" },
    {
      key: "total",
      label: "Total (UGX)",
      numeric: true,
      sortValue: (r) => r.total,
      render: (r) => fmtMoney(r.total),
    },
    {
      key: "status",
      label: "Status",
      className: "w-24",
      render: (r) => <Badge tone="ok">{r.status}</Badge>,
    },
    {
      key: "actions",
      label: "Actions",
      className: "w-20 text-right",
      noExport: true,
      render: (r) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setDetail(r);
          }}
          className="text-[12.5px] text-accent hover:underline cursor-pointer"
        >
          Open
        </button>
      ),
    },
  ];

  const detailItems = detail ? items.filter((it) => it.purchaseId === detail.id) : [];
  const detailSubtotal = detailItems.reduce((s, it) => s + it.qty * it.rate, 0);

  return (
    <>
      <PageHeader
        title="Purchase Invoices"
        actions={
          canCreate && (
            <Link href="/purchases/new">
              <Button>
                <Add size={16} /> New invoice
              </Button>
            </Link>
          )
        }
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        searchKeys={["poNo", "invoiceNo", "supplierName"]}
        searchPlaceholder="Search code or name"
        onRowClick={setDetail}
        empty="No purchase invoices yet"
        exportName="purchase-invoices"
        exportTitle="Purchase Invoices"
        filters={filterDefs}
      />
      <p className="mt-2 text-[11.5px] text-ink-faint">
        A purchase invoice records the supplier bill against goods already received. Stock moved at the
        GRN — posting the invoice does not move stock.
      </p>

      <Sheet
        open={detail != null}
        onOpenChange={(o) => !o && setDetail(null)}
        title={detail?.poNo ?? ""}
        description={
          detail
            ? `${detail.invoiceNo ? `Inv ${detail.invoiceNo} · ` : ""}${fmtDate(detail.orderDate)} · ${detail.supplierName}`
            : undefined
        }
        wide
      >
        {detail && (
          <div className="space-y-4">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
                  <th className="py-1.5 pr-2">GRN</th>
                  <th className="py-1.5 pr-2">Material</th>
                  <th className="py-1.5 pr-2 text-right">Qty</th>
                  <th className="py-1.5 pr-2 text-right">Cost</th>
                  <th className="py-1.5 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {detailItems.map((it, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="num py-1.5 pr-2 text-[11.5px] text-ink-soft">{it.grnNo}</td>
                    <td className="py-1.5 pr-2">
                      {it.materialName}{" "}
                      <span className="num text-[11px] text-ink-faint">{it.materialCode}</span>
                    </td>
                    <td className="num py-1.5 pr-2 text-right">
                      {fmtQty(it.qty)} {it.unit}
                    </td>
                    <td className="num py-1.5 pr-2 text-right">{fmtMoney(it.rate)}</td>
                    <td className="num py-1.5 text-right">{fmtMoney(it.qty * it.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="ml-auto w-56 space-y-1 text-[12.5px]">
              <div className="flex justify-between">
                <span className="text-ink-soft">Subtotal</span>
                <span className="num">{fmtMoney(detailSubtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-soft">Tax ({detail.taxRate}%)</span>
                <span className="num">{fmtMoney(detail.total - detailSubtotal)}</span>
              </div>
              <div className="flex justify-between border-t border-line pt-1 font-semibold">
                <span>Total</span>
                <span className="num">{fmtMoney(detail.total)}</span>
              </div>
            </div>
            {detail.notes && <p className="text-[12.5px] text-ink-soft">{detail.notes}</p>}
          </div>
        )}
      </Sheet>
    </>
  );
}
