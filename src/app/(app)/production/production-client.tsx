"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Add,
  SearchNormal1,
  DocumentDownload,
  ArrowDown2,
  ArrowLeft2,
  ArrowRight2,
  TickCircle,
  Eye,
} from "iconsax-reactjs";
import { fmtDate, fmtDateTime, fmtMoney, fmtQty } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input, NumberInput, Textarea, Field } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import { StatusBadge, Badge, type Tone } from "@/components/ui/badge";
import { Menu } from "@/components/ui/menu";
import { ConfirmDialog } from "@/components/ui/confirm";
import { exportData, type ExportFormat } from "@/lib/export";
import { cn } from "@/lib/cn";
import { startRun, cancelRun, completeRun, getRunDetail } from "./actions";

type Run = {
  id: number;
  runNo: string;
  runDate: string;
  status: string;
  plannedQty: number;
  producedQty: number | null;
  varianceQty: number | null;
  productId: number;
  productName: string;
  productUnit: string;
  orderNo: string | null;
  overUsed: boolean;
};
type Material = { id: number; code: string; name: string; unit: string; currentStock: number };
type BomLine = { productId: number; materialId: number; qtyPerUnit: number };

type GetRunDetailResult = Awaited<ReturnType<typeof getRunDetail>>;
type RunDetail = Extract<GetRunDetailResult, { ok: true }>["data"];

const OPEN_STATUSES = ["planned", "in_progress"];
const CLOSED_STATUSES = ["completed", "cancelled"];
const PAGE_SIZE = 50;

const TXN_LABELS: Record<string, string> = {
  production_out: "Raw material issued",
  production_in: "Finished goods received",
  production_return: "Raw material returned",
};

const ACTION_TONES: Record<string, Tone> = {
  create: "info",
  start: "info",
  complete: "ok",
  cancel: "danger",
};

function describeAuditDetail(action: string, detail: unknown): string {
  if (action === "complete" && detail && typeof detail === "object" && "producedQty" in detail) {
    return `Produced qty recorded: ${fmtQty((detail as { producedQty: number }).producedQty)}`;
  }
  if (!detail) return "—";
  try {
    return JSON.stringify(detail);
  } catch {
    return "—";
  }
}

// More used than the recipe called for is a cost overrun (red); on standard or
// under is a good outcome (green) — a small negative margin counts as green too.
function varianceTone(v: number): string {
  return v > 0 ? "bg-danger-soft text-danger" : "bg-ok-soft text-ok";
}

// Output variance is the opposite sense: short of plan (negative) is the
// problem (red), hitting or exceeding plan (positive) is fine (green).
function outputVarianceTone(v: number): string {
  return v < 0 ? "text-danger" : v > 0 ? "text-ok" : "text-ink-faint";
}
function fmtSigned(v: number | null | undefined, unit?: string): string {
  if (v == null) return "—";
  return `${v > 0 ? "+" : ""}${fmtQty(v, unit)}`;
}

// The workflow status is only ever "completed" once stock has posted, but
// that says nothing about how the run actually went — a completed run still
// shows green when every material stayed at or under its BOM standard, red
// the moment any material ran over.
function ProductionStatusBadge({ status, overUsed }: { status: string; overUsed: boolean }) {
  if (status === "completed") {
    return <Badge tone={overUsed ? "danger" : "ok"}>completed</Badge>;
  }
  return <StatusBadge status={status} />;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink-faint">{label}</span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  );
}

function QtyCard({
  label,
  value,
  unit,
  tone,
  signed,
}: {
  label: string;
  value: number | null | undefined;
  unit: string;
  tone?: "danger" | "ok";
  signed?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line px-3 py-2.5">
      <span className="block text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </span>
      <span
        className={cn(
          "num mt-1 block text-[16px] font-semibold",
          tone === "danger" ? "text-danger" : tone === "ok" ? "text-ok" : "text-ink",
        )}
      >
        {signed ? fmtSigned(value) : fmtQty(value)}{" "}
        <span className="text-[11.5px] font-normal text-ink-faint">{unit}</span>
      </span>
    </div>
  );
}

type SortKey = "runNo" | "runDate" | "productName" | "plannedQty" | "producedQty" | "varianceQty" | "status";

export function ProductionClient({
  runs,
  materials,
  bom,
  canCreate,
  canEdit,
}: {
  runs: Run[];
  materials: Material[];
  bom: BomLine[];
  canCreate: boolean;
  canEdit: boolean;
}) {
  const [completing, setCompleting] = useState<Run | null>(null);
  const [cancelling, setCancelling] = useState<Run | null>(null);
  const [viewing, setViewing] = useState<Run | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [detailBusy, startDetailTransition] = useTransition();
  const [busy, startTransition] = useTransition();

  function openView(run: Run) {
    setViewing(run);
    setDetail(null);
    startDetailTransition(async () => {
      const res = await getRunDetail(run.id);
      if (!res.ok) {
        toast.error(res.error);
        setViewing(null);
        return;
      }
      setDetail(res.data);
    });
  }

  const matById = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);

  // ── toolbar state ────────────────────────────────────────────────────────
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [fromPending, setFromPending] = useState("");
  const [toPending, setToPending] = useState("");
  const [fromApplied, setFromApplied] = useState("");
  const [toApplied, setToApplied] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let out = runs;
    if (statusFilter === "active") out = out.filter((r) => OPEN_STATUSES.includes(r.status));
    if (statusFilter === "inactive") out = out.filter((r) => CLOSED_STATUSES.includes(r.status));
    if (fromApplied) out = out.filter((r) => r.runDate >= fromApplied);
    if (toApplied) out = out.filter((r) => r.runDate <= toApplied);
    if (q) {
      const needle = q.toLowerCase();
      out = out.filter(
        (r) =>
          r.runNo.toLowerCase().includes(needle) ||
          r.productName.toLowerCase().includes(needle) ||
          (r.orderNo ?? "").toLowerCase().includes(needle),
      );
    }
    if (sort) {
      out = [...out].sort((a, b) => {
        const av = a[sort.key] ?? "";
        const bv = b[sort.key] ?? "";
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * sort.dir;
        return String(av).localeCompare(String(bv)) * sort.dir;
      });
    }
    return out;
  }, [runs, statusFilter, fromApplied, toApplied, q, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  function toggleSort(key: SortKey) {
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  }

  function runExport(format: ExportFormat) {
    exportData(format, {
      filename: "production-runs",
      title: "Production Runs",
      subtitle: `${filtered.length} rows`,
      columns: [
        { header: "Doc #" },
        { header: "Date" },
        { header: "Product" },
        { header: "Planned", numeric: true },
        { header: "Good", numeric: true },
        { header: "Variance", numeric: true },
        { header: "Order" },
        { header: "Status" },
      ],
      rows: filtered.map((r) => [
        r.runNo,
        fmtDate(r.runDate),
        r.productName,
        r.plannedQty,
        r.producedQty ?? "",
        r.varianceQty ?? "",
        r.orderNo ?? "",
        r.status.replaceAll("_", " "),
      ]),
    });
  }

  // ── complete form ───────────────────────────────────────────────────────
  const [producedQty, setProducedQty] = useState(0);
  const [actuals, setActuals] = useState<Map<number, number>>(new Map());
  const [returned, setReturned] = useState<Map<number, number>>(new Map());
  const [remarks, setRemarks] = useState<Map<number, string>>(new Map());
  const [varianceRemarks, setVarianceRemarks] = useState("");

  function openComplete(run: Run) {
    setCompleting(run);
    setProducedQty(run.producedQty ?? run.plannedQty);
    // Actual usage is never assumed to match standard — every material
    // starts blank so the operator has to type what was really consumed.
    setActuals(new Map());
    setReturned(new Map());
    setRemarks(new Map());
    setVarianceRemarks("");
  }

  function onProducedChange(qty: number) {
    setProducedQty(qty);
    // Standard scales with produced qty automatically wherever it's shown —
    // actuals already typed in are real recorded usage and aren't touched.
  }

  function submitComplete() {
    if (!completing) return;
    if (producedQty <= 0) return void toast.error("Enter produced qty");
    const runBom = bom.filter((b) => b.productId === completing.productId);
    const missing = runBom.filter((b) => !actuals.has(b.materialId));
    if (missing.length > 0) {
      const label =
        missing.length === 1
          ? matById.get(missing[0].materialId)?.name ?? "1 material"
          : `${missing.length} materials`;
      return void toast.error(`Enter actual usage for ${label} before completing`);
    }
    for (const [materialId, ret] of returned) {
      if (ret <= 0) continue;
      const std = (runBom.find((b) => b.materialId === materialId)?.qtyPerUnit ?? 0) * producedQty;
      const maxReturnable = Math.max(0, std - (actuals.get(materialId) ?? 0));
      if (ret > maxReturnable) {
        return void toast.error("A returned quantity exceeds the shortfall against standard for that material");
      }
    }
    startTransition(async () => {
      const res = await completeRun({
        runId: completing.id,
        producedQty,
        varianceRemarks: varianceRemarks.trim() || undefined,
        consumption: [...actuals.entries()].map(([materialId, actualQty]) => ({
          materialId,
          actualQty,
          returnedQty: returned.get(materialId) || undefined,
          remarks: remarks.get(materialId) || undefined,
        })),
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success(`${completing.runNo} completed — stock updated`);
      setCompleting(null);
    });
  }

  const runBomMaterials = completing
    ? bom.filter((b) => b.productId === completing.productId)
    : [];
  const varianceQty = completing ? producedQty - completing.plannedQty : 0;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[17px] font-semibold leading-6">Production runs</h1>
      </div>

      {/* ── filter toolbar ──────────────────────────────────────────────────── */}
      <div className="mb-3 flex flex-wrap items-end gap-4">
        <div>
          <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">
            Search
          </span>
          <div className="relative w-56">
            <SearchNormal1 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
              placeholder="Search code or name"
              className="h-10 w-full rounded-lg border border-line-strong bg-surface pl-9 pr-3 text-[13.5px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-shadow placeholder:text-ink-faint"
            />
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">
            Status
          </span>
          <div className="flex h-10 items-center rounded-lg border border-line-strong bg-surface p-0.5">
            {(["all", "active", "inactive"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setStatusFilter(v);
                  setPage(0);
                }}
                className={cn(
                  "h-full rounded-md px-3 text-[12.5px] font-medium capitalize transition-colors cursor-pointer",
                  statusFilter === v ? "bg-ink text-white" : "text-ink-soft hover:text-ink",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">
            From
          </span>
          <input
            type="date"
            value={fromPending}
            onChange={(e) => setFromPending(e.target.value)}
            className="h-10 w-40 rounded-lg border border-line-strong bg-surface px-3 text-[13px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
          />
        </div>

        <div>
          <span className="mb-1.5 block text-[10.5px] font-semibold uppercase tracking-wide text-ink-faint">
            To
          </span>
          <input
            type="date"
            value={toPending}
            onChange={(e) => setToPending(e.target.value)}
            className="h-10 w-40 rounded-lg border border-line-strong bg-surface px-3 text-[13px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
          />
        </div>

        <Button
          variant="secondary"
          className="h-10"
          onClick={() => {
            setFromApplied(fromPending);
            setToApplied(toPending);
            setPage(0);
          }}
        >
          Apply
        </Button>

        <div className="ml-auto flex items-center gap-2">
          <Menu
            label="Export"
            trigger={
              <button
                type="button"
                className="flex h-10 items-center gap-1.5 rounded-lg border border-line-strong px-3.5 text-[13px] text-ink-soft hover:bg-bg hover:text-ink cursor-pointer"
              >
                <DocumentDownload size={15} /> Export
                <ArrowDown2 size={12} className="opacity-60" />
              </button>
            }
            items={[
              { label: "Excel (.xlsx)", icon: DocumentDownload, onSelect: () => runExport("xlsx") },
              { label: "PDF (.pdf)", icon: DocumentDownload, onSelect: () => runExport("pdf") },
              { label: "CSV (.csv)", icon: DocumentDownload, onSelect: () => runExport("csv") },
            ]}
          />
          {canCreate && (
            <Link href="/production/new">
              <Button className="h-10">
                <Add size={16} /> New production
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* ── table ────────────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-line">
              {(
                [
                  ["runNo", "Doc #"],
                  ["runDate", "Date"],
                  ["productName", "Product"],
                  ["plannedQty", "Planned"],
                  ["producedQty", "Good"],
                  ["varianceQty", "Variance"],
                ] as [SortKey, string][]
              ).map(([key, label]) => {
                const activeSort = sort?.key === key;
                const numeric = ["plannedQty", "producedQty", "varianceQty"].includes(key);
                return (
                  <th
                    key={key}
                    onClick={() => toggleSort(key)}
                    className={cn(
                      "group select-none whitespace-nowrap px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint cursor-pointer hover:text-ink-soft",
                      numeric && "text-right",
                    )}
                  >
                    <span className={cn("inline-flex items-center gap-1", numeric && "flex-row-reverse")}>
                      {label}
                      <ArrowDown2
                        size={11}
                        className={cn(
                          "transition-all",
                          activeSort
                            ? cn("text-accent opacity-100", sort!.dir === -1 && "rotate-180")
                            : "opacity-25 group-hover:opacity-50",
                        )}
                      />
                    </span>
                  </th>
                );
              })}
              <th className="px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
                Order
              </th>
              <th
                onClick={() => toggleSort("status")}
                className="group w-28 cursor-pointer select-none whitespace-nowrap px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint hover:text-ink-soft"
              >
                <span className="inline-flex items-center gap-1">
                  Status
                  <ArrowDown2
                    size={11}
                    className={cn(
                      "transition-all",
                      sort?.key === "status"
                        ? cn("text-accent opacity-100", sort.dir === -1 && "rotate-180")
                        : "opacity-25 group-hover:opacity-50",
                    )}
                  />
                </span>
              </th>
              <th className="w-48 px-3 py-2.5 text-right text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-[13px] text-ink-faint">
                  No production runs yet
                </td>
              </tr>
            )}
            {visible.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="num px-3 py-2.5 align-middle">{r.runNo}</td>
                <td className="px-3 py-2.5 align-middle text-ink-soft">{fmtDate(r.runDate)}</td>
                <td className="px-3 py-2.5 align-middle">{r.productName}</td>
                <td className="num px-3 py-2.5 text-right align-middle">{fmtQty(r.plannedQty)}</td>
                <td className="num px-3 py-2.5 text-right align-middle">{fmtQty(r.producedQty)}</td>
                <td className="num px-3 py-2.5 text-right align-middle">
                  <span className={outputVarianceTone(r.varianceQty ?? 0)}>
                    {fmtSigned(r.varianceQty)}
                  </span>
                </td>
                <td className="num px-3 py-2.5 align-middle">{r.orderNo ?? "—"}</td>
                <td className="px-3 py-2.5 align-middle">
                  <ProductionStatusBadge status={r.status} overUsed={r.overUsed} />
                </td>
                <td className="px-3 py-2.5 align-middle text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => openView(r)}
                      className="flex items-center gap-1 text-[12.5px] font-medium text-ink-soft hover:text-ink cursor-pointer"
                    >
                      <Eye size={13} /> View
                    </button>
                    {canEdit && OPEN_STATUSES.includes(r.status) && (
                      <Menu
                        align="end"
                        trigger={
                          <button
                            type="button"
                            className="text-[12.5px] font-medium text-ink-soft hover:text-ink cursor-pointer"
                          >
                            Open
                          </button>
                        }
                        items={[
                          ...(r.status === "planned"
                            ? [
                                {
                                  label: "Start",
                                  onSelect: () =>
                                    startTransition(async () => {
                                      const res = await startRun(r.id);
                                      if (!res.ok) toast.error(res.error);
                                    }),
                                },
                              ]
                            : []),
                          {
                            label: "Confirm — complete run",
                            onSelect: () => openComplete(r),
                          },
                          "separator" as const,
                          {
                            label: "Cancel run",
                            danger: true,
                            onSelect: () => setCancelling(r),
                          },
                        ]}
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── footer / pagination ─────────────────────────────────────────────── */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12.5px] text-ink-soft">
          Showing {filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1}–
          {Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
            className="flex items-center gap-1 rounded-md border border-line-strong px-2.5 py-1 text-[12.5px] text-ink-soft disabled:opacity-40 cursor-pointer hover:bg-bg disabled:cursor-default disabled:hover:bg-transparent"
          >
            <ArrowLeft2 size={12} /> Previous
          </button>
          <span className="num flex h-7 min-w-7 items-center justify-center rounded-md border border-accent bg-accent-soft px-2 text-[12.5px] font-semibold text-accent">
            {safePage + 1}
          </span>
          <button
            disabled={safePage >= pages - 1}
            onClick={() => setPage(safePage + 1)}
            className="flex items-center gap-1 rounded-md border border-line-strong px-2.5 py-1 text-[12.5px] text-ink-soft disabled:opacity-40 cursor-pointer hover:bg-bg disabled:cursor-default disabled:hover:bg-transparent"
          >
            Next <ArrowRight2 size={12} />
          </button>
        </div>
      </div>

      <p className="mt-2 text-[11.5px] text-ink-faint">
        A run starts as In progress (no stock posted yet). On confirm, materials are consumed and the
        finished good is added to FG stock.
      </p>

      {completing && (
        <Sheet
          open={!!completing}
          onOpenChange={(o) => !o && setCompleting(null)}
          title={`Complete ${completing.runNo}`}
          description={completing.productName}
          wide
          footer={
            <>
              <Button variant="secondary" onClick={() => setCompleting(null)}>Cancel</Button>
              <Button onClick={submitComplete} disabled={busy}>
                {busy ? "Posting…" : "Complete & post stock"}
              </Button>
            </>
          }
        >
          <div className="space-y-3.5">
            <div className="grid grid-cols-3 gap-3">
              <Field label={`Planned (${completing.productUnit})`}>
                <Input className="num" value={fmtQty(completing.plannedQty)} disabled />
              </Field>
              <Field label={`Actual (${completing.productUnit})`} required>
                <NumberInput
                  className="num"
                  value={producedQty}
                  onChange={onProducedChange}
                  autoFocus
                />
              </Field>
              <Field
                label={`Variance (${completing.productUnit})`}
                hint="Actual − planned"
              >
                <Input
                  className={cn("num", outputVarianceTone(varianceQty))}
                  value={fmtSigned(varianceQty)}
                  disabled
                />
              </Field>
            </div>

            <Field
              label="Remarks"
              hint="Why output came in above or below plan — optional either way"
            >
              <Textarea
                placeholder="e.g. extra good units from a longer shift, or a jam mid-run cost output"
                value={varianceRemarks}
                onChange={(e) => setVarianceRemarks(e.target.value)}
              />
            </Field>

            <div className="rounded-lg border border-line">
              <div className="grid grid-cols-[1fr_90px_100px_80px] items-center gap-2 border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                <span>Material</span>
                <span className="text-right">Standard</span>
                <span className="text-right">Actual used</span>
                <span className="text-right">In stock</span>
              </div>
              {runBomMaterials.length === 0 && (
                <p className="px-3 py-3 text-[12.5px] text-warn">
                  No BOM — no material consumption will be posted
                </p>
              )}
              {runBomMaterials.map((b) => {
                const m = matById.get(b.materialId);
                const std = b.qtyPerUnit * producedQty;
                const hasActual = actuals.has(b.materialId);
                const actual = actuals.get(b.materialId) ?? 0;
                const variance = actual - std;
                const ret = returned.get(b.materialId) ?? 0;
                const over = hasActual && m ? actual > m.currentStock : false;
                const maxReturnable = hasActual ? Math.max(0, std - actual) : 0;
                const overReturn = ret > maxReturnable;
                const newStock = (m?.currentStock ?? 0) + ret;
                return (
                  <div key={b.materialId} className="border-b border-line px-3 py-2 last:border-0">
                    <div className="grid grid-cols-[1fr_90px_100px_80px] items-center gap-2">
                      <span className="truncate text-[12.5px]">{m?.name}</span>
                      <span className="num text-right text-ink-faint">{fmtQty(std)}</span>
                      <NumberInput
                        placeholder="Required"
                        className={cn(
                          "num h-8 text-right",
                          !hasActual && "border-warn",
                          over && "border-danger",
                        )}
                        value={actuals.get(b.materialId)}
                        onChange={(n) =>
                          setActuals(new Map(actuals).set(b.materialId, n))
                        }
                      />
                      <span className={cn("num text-right", over ? "font-semibold text-danger" : "text-ink-faint")}>
                        {fmtQty(m?.currentStock)}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-bg px-2.5 py-2">
                      <label className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
                        Standard
                        <Input className="num h-7 w-20 text-right" value={fmtQty(std)} disabled />
                      </label>
                      <label className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
                        Variance
                        <Input
                          className={cn(
                            "num h-7 w-20 text-right",
                            hasActual ? varianceTone(variance) : "text-ink-faint",
                          )}
                          value={hasActual ? fmtSigned(variance) : "—"}
                          disabled
                        />
                      </label>
                      <label className="flex items-center gap-1.5 text-[11.5px] text-ink-soft">
                        Good qty to return
                        <NumberInput
                          disabled={maxReturnable <= 0}
                          className={cn("num h-7 w-20 text-right", overReturn && "border-danger")}
                          value={ret}
                          onChange={(n) =>
                            setReturned(new Map(returned).set(b.materialId, n))
                          }
                        />
                      </label>
                      {ret > 0 && (
                        <span className="ml-auto flex items-center gap-1 text-[11.5px] text-ok">
                          <TickCircle size={13} variant="Bold" />
                          New stock: {fmtQty(newStock)}
                        </span>
                      )}
                      <Input
                        placeholder="Remarks (optional)"
                        className="h-7 min-w-40 flex-1 text-[11.5px]"
                        value={remarks.get(b.materialId) ?? ""}
                        onChange={(e) =>
                          setRemarks(new Map(remarks).set(b.materialId, e.target.value))
                        }
                      />
                    </div>
                    {!hasActual && (
                      <p className="mt-1 text-[11px] text-warn">
                        Enter what was actually used — the recipe amount is not assumed
                      </p>
                    )}
                    {overReturn && (
                      <p className="mt-1 text-[11px] text-danger">
                        Returned quantity cannot exceed the shortfall against standard ({fmtQty(maxReturnable)})
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[12px] text-ink-faint">
              Actual used starts blank — nothing is assumed to match standard. Standard = BOM × qty
              produced. Variance = actual − standard. When actual is under standard, enter how much
              of that shortfall is good enough to go back to raw material stock under{" "}
              <span className="font-medium text-ink">Good qty to return</span> — damaged
              or unusable material should be left out.
            </p>
          </div>
        </Sheet>
      )}

      {cancelling && (
        <ConfirmDialog
          open={!!cancelling}
          onOpenChange={(o) => !o && setCancelling(null)}
          title={`Cancel ${cancelling.runNo}?`}
          body="The run is discarded. No stock has moved."
          confirmLabel="Cancel run"
          danger
          busy={busy}
          onConfirm={() =>
            startTransition(async () => {
              const res = await cancelRun(cancelling.id);
              if (!res.ok) return void toast.error(res.error);
              toast.success("Run cancelled");
              setCancelling(null);
            })
          }
        />
      )}

      {viewing && (
        <Sheet
          open={!!viewing}
          onOpenChange={(o) => !o && setViewing(null)}
          title={`${viewing.runNo} — full record`}
          description={`${viewing.productName} · everything recorded for this run, start to now`}
          wide
        >
          {detailBusy || !detail ? (
            <p className="py-10 text-center text-[13px] text-ink-faint">Loading…</p>
          ) : (
            <div className="space-y-5">
              {/* ── overview ─────────────────────────────────────────────── */}
              <section>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  Overview
                </h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-line p-3 text-[12.5px]">
                  <InfoRow
                    label="Status"
                    value={
                      <ProductionStatusBadge
                        status={detail.run.status}
                        overUsed={detail.consumption.some((c) => c.variance > 0)}
                      />
                    }
                  />
                  <InfoRow label="Run date" value={fmtDate(detail.run.runDate)} />
                  <InfoRow
                    label="Product"
                    value={`${detail.run.productName} (${detail.run.productCode})`}
                  />
                  <InfoRow label="Order" value={detail.run.orderNo ?? "—"} />
                  <InfoRow label="Shift" value={detail.run.shift ?? "—"} />
                  <InfoRow label="Machine" value={detail.run.machine ?? "—"} />
                  <InfoRow label="Operator" value={detail.run.operator ?? "—"} />
                  <InfoRow label="Created by" value={detail.run.createdByName ?? "—"} />
                  <InfoRow label="Created (started) at" value={fmtDateTime(detail.run.createdAt)} />
                  <InfoRow label="Completed at" value={fmtDateTime(detail.run.completedAt)} />
                </div>
                {detail.run.notes && (
                  <p className="mt-2 rounded-md bg-bg px-3 py-2 text-[12.5px] text-ink-soft">
                    {detail.run.notes}
                  </p>
                )}
              </section>

              {/* ── finished product quantities ─────────────────────────────── */}
              <section>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  Finished product — {detail.run.productName}
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  <QtyCard label="Planned" value={detail.run.plannedQty} unit={detail.run.productUnit} />
                  <QtyCard
                    label="Good (produced)"
                    value={detail.run.producedQty}
                    unit={detail.run.productUnit}
                  />
                  <QtyCard
                    label="Variance"
                    value={detail.run.varianceQty}
                    unit={detail.run.productUnit}
                    tone={(detail.run.varianceQty ?? 0) < 0 ? "danger" : (detail.run.varianceQty ?? 0) > 0 ? "ok" : undefined}
                    signed
                  />
                </div>
                {detail.run.varianceRemarks && (
                  <p className="mt-2 rounded-md bg-bg px-3 py-2 text-[12.5px] text-ink-soft">
                    <span className="font-medium text-ink">Remarks: </span>
                    {detail.run.varianceRemarks}
                  </p>
                )}
              </section>

              {/* ── raw material consumption ────────────────────────────────── */}
              <section>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  Raw materials — standard vs actual consumption
                </h3>
                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full text-left text-[12px]">
                    <thead>
                      <tr className="border-b border-line bg-bg">
                        <th className="px-2.5 py-2 font-semibold text-ink-faint">Material</th>
                        <th className="px-2.5 py-2 text-right font-semibold text-ink-faint">Unit</th>
                        <th className="px-2.5 py-2 text-right font-semibold text-ink-faint">Standard</th>
                        <th className="px-2.5 py-2 text-right font-semibold text-ink-faint">Actual</th>
                        <th className="px-2.5 py-2 text-right font-semibold text-ink-faint">Variance</th>
                        <th className="px-2.5 py-2 text-right font-semibold text-ink-faint">Unit cost</th>
                        <th className="px-2.5 py-2 text-right font-semibold text-ink-faint">Variance value</th>
                        <th className="px-2.5 py-2 font-semibold text-ink-faint">Remarks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.consumption.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-2.5 py-4 text-center text-ink-faint">
                            No BOM consumption recorded for this run
                          </td>
                        </tr>
                      )}
                      {detail.consumption.map((c) => (
                        <tr key={c.materialId} className="border-b border-line last:border-0">
                          <td className="px-2.5 py-2">
                            {c.materialName}{" "}
                            <span className="text-ink-faint">({c.materialCode})</span>
                          </td>
                          <td className="num px-2.5 py-2 text-right text-ink-faint">{c.unit}</td>
                          <td className="num px-2.5 py-2 text-right">{fmtQty(c.standardQty)}</td>
                          <td className="num px-2.5 py-2 text-right">{fmtQty(c.actualQty)}</td>
                          <td className="num px-2.5 py-2 text-right">
                            <span
                              className={cn(
                                "inline-block rounded px-1.5 py-0.5 font-medium",
                                varianceTone(c.variance),
                              )}
                            >
                              {c.variance > 0 ? "+" : ""}
                              {fmtQty(c.variance)}
                            </span>
                          </td>
                          <td className="num px-2.5 py-2 text-right text-ink-faint">{fmtMoney(c.unitCost)}</td>
                          <td className="num px-2.5 py-2 text-right">
                            <span
                              className={cn(
                                "inline-block rounded px-1.5 py-0.5 font-medium",
                                varianceTone(c.variance),
                              )}
                            >
                              {fmtMoney(c.varianceValue)}
                            </span>
                          </td>
                          <td className="px-2.5 py-2 text-ink-faint">{c.remarks || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1.5 text-[11px] text-ink-faint">
                  Standard = BOM × qty produced. Variance = actual − standard, valued at the
                  material&apos;s average cost — red means more was used than the recipe called for,
                  green means on standard or less.
                </p>
              </section>

              {/* ── stock movements ─────────────────────────────────────────── */}
              <section>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  Stock movements posted by this run
                </h3>
                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full text-left text-[12px]">
                    <thead>
                      <tr className="border-b border-line bg-bg">
                        <th className="px-2.5 py-2 font-semibold text-ink-faint">Time</th>
                        <th className="px-2.5 py-2 font-semibold text-ink-faint">Type</th>
                        <th className="px-2.5 py-2 font-semibold text-ink-faint">Item</th>
                        <th className="px-2.5 py-2 text-right font-semibold text-ink-faint">In</th>
                        <th className="px-2.5 py-2 text-right font-semibold text-ink-faint">Out</th>
                        <th className="px-2.5 py-2 text-right font-semibold text-ink-faint">Balance after</th>
                        <th className="px-2.5 py-2 font-semibold text-ink-faint">Lot</th>
                        <th className="px-2.5 py-2 font-semibold text-ink-faint">By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.movements.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-2.5 py-4 text-center text-ink-faint">
                            No stock has moved yet — the run has not been completed
                          </td>
                        </tr>
                      )}
                      {detail.movements.map((m) => {
                        const isRm = m.itemType === "rm";
                        const itemName = isRm ? m.materialName : m.productName;
                        const itemCode = isRm ? m.materialCode : m.productCode;
                        const unit = isRm ? m.materialUnit : m.productUnit;
                        return (
                          <tr key={m.id} className="border-b border-line last:border-0">
                            <td className="whitespace-nowrap px-2.5 py-2 text-ink-soft">
                              {fmtDateTime(m.createdAt)}
                            </td>
                            <td className="px-2.5 py-2">{TXN_LABELS[m.txnType] ?? m.txnType}</td>
                            <td className="px-2.5 py-2">
                              {itemName} <span className="text-ink-faint">({itemCode}) · {unit}</span>
                            </td>
                            <td className="num px-2.5 py-2 text-right text-ok">
                              {m.qtyIn ? fmtQty(m.qtyIn) : "—"}
                            </td>
                            <td className="num px-2.5 py-2 text-right text-danger">
                              {m.qtyOut ? fmtQty(m.qtyOut) : "—"}
                            </td>
                            <td className="num px-2.5 py-2 text-right">{fmtQty(m.balanceAfter)}</td>
                            <td className="px-2.5 py-2 text-ink-faint">{m.lotNo ?? "—"}</td>
                            <td className="px-2.5 py-2 text-ink-faint">{m.byName ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* ── change history / audit trail ────────────────────────────── */}
              <section>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  Change history
                </h3>
                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full text-left text-[12px]">
                    <thead>
                      <tr className="border-b border-line bg-bg">
                        <th className="px-2.5 py-2 font-semibold text-ink-faint">Time</th>
                        <th className="px-2.5 py-2 font-semibold text-ink-faint">User</th>
                        <th className="px-2.5 py-2 font-semibold text-ink-faint">Action</th>
                        <th className="px-2.5 py-2 font-semibold text-ink-faint">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.history.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-2.5 py-4 text-center text-ink-faint">
                            No history recorded
                          </td>
                        </tr>
                      )}
                      {detail.history.map((h) => (
                        <tr key={h.id} className="border-b border-line last:border-0">
                          <td className="whitespace-nowrap px-2.5 py-2 text-ink-soft">
                            {fmtDateTime(h.createdAt)}
                          </td>
                          <td className="px-2.5 py-2">{h.userName ?? "system"}</td>
                          <td className="px-2.5 py-2">
                            <Badge tone={ACTION_TONES[h.action] ?? "neutral"}>{h.action}</Badge>
                          </td>
                          <td className="px-2.5 py-2 text-ink-faint">
                            {describeAuditDetail(h.action, h.detail)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}
