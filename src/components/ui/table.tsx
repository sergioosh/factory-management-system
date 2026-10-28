"use client";

import { useMemo, useState } from "react";
import { SearchNormal1, ArrowDown2, DocumentDownload, CloseCircle } from "iconsax-reactjs";
import { cn } from "@/lib/cn";
import { exportData, type ExportFormat } from "@/lib/export";
import { Checkbox } from "./checkbox";
import { Menu } from "./menu";
import { FilterSelect } from "./filter-select";

export type Column<T> = {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  numeric?: boolean;
  className?: string;
  /** disable sorting for this column (default: sortable when it has a label) */
  sortable?: boolean;
  /** exclude from Excel/PDF/CSV export (action columns etc.) */
  noExport?: boolean;
};

export type FilterDef<T> = {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  getValue: (row: T) => string | string[] | null | undefined;
};

const EXPORT_TITLE_MAX = 40;

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  searchKeys,
  searchPlaceholder = "Search",
  onRowClick,
  rowKey,
  empty = "Nothing here yet",
  toolbar,
  filter,
  filters,
  pageSize = 50,
  exportName,
  exportTitle,
  selectable,
  bulkActions,
}: {
  columns: Column<T>[];
  rows: T[];
  searchKeys?: (keyof T)[];
  searchPlaceholder?: string;
  onRowClick?: (row: T) => void;
  rowKey: (row: T) => string | number;
  empty?: string;
  toolbar?: React.ReactNode;
  filter?: (row: T) => boolean;
  /** organised multi-select filter bar */
  filters?: FilterDef<T>[];
  pageSize?: number;
  /** enables the Excel / PDF / CSV export menu; the file base name */
  exportName?: string;
  exportTitle?: string;
  /** show selection checkboxes */
  selectable?: boolean;
  /** render extra bulk actions; receives the selected rows and a clear fn */
  bulkActions?: (selected: T[], clear: () => void) => React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);
  const [active, setActive] = useState<Record<string, Set<string>>>({});
  const [selected, setSelected] = useState<Set<string | number>>(new Set());

  const filtered = useMemo(() => {
    let out = filter ? rows.filter(filter) : rows;
    if (filters?.length) {
      out = out.filter((r) =>
        filters.every((f) => {
          const set = active[f.key];
          if (!set || set.size === 0) return true;
          const v = f.getValue(r);
          const vals = Array.isArray(v) ? v : [v];
          return vals.some((x) => x != null && set.has(String(x)));
        }),
      );
    }
    if (q && searchKeys?.length) {
      const needle = q.toLowerCase();
      out = out.filter((r) =>
        searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(needle)),
      );
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      out = [...out].sort((a, b) => {
        const av = col?.sortValue ? col.sortValue(a) : (a[sort.key] as string | number) ?? "";
        const bv = col?.sortValue ? col.sortValue(b) : (b[sort.key] as string | number) ?? "";
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * sort.dir;
        return String(av).localeCompare(String(bv)) * sort.dir;
      });
    }
    return out;
  }, [rows, q, sort, filter, filters, active, searchKeys, columns]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const visible = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(rowKey(r))),
    [rows, selected, rowKey],
  );
  const filteredKeys = filtered.map(rowKey);
  const allSelected = filteredKeys.length > 0 && filteredKeys.every((k) => selected.has(k));
  const someSelected = filteredKeys.some((k) => selected.has(k));

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) filteredKeys.forEach((k) => next.delete(k));
      else filteredKeys.forEach((k) => next.add(k));
      return next;
    });
  }
  function toggleRow(k: string | number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  }
  const clearSelection = () => setSelected(new Set());

  function runExport(format: ExportFormat, onlySelected: boolean) {
    const cols = columns.filter((c) => c.label && !c.noExport);
    const source = onlySelected ? selectedRows : filtered;
    exportData(format, {
      filename: exportName!,
      title: (exportTitle ?? exportName!).slice(0, EXPORT_TITLE_MAX),
      subtitle: `${source.length} rows${onlySelected ? " (selected)" : ""}`,
      columns: cols.map((c) => ({ header: c.label, numeric: c.numeric })),
      rows: source.map((r) =>
        cols.map((c) => {
          const v = c.sortValue ? c.sortValue(r) : r[c.key];
          return typeof v === "string" || typeof v === "number" ? v : String(v ?? "");
        }),
      ),
    });
  }

  const activeFilterCount = filters
    ? filters.reduce((s, f) => s + (active[f.key]?.size ?? 0), 0)
    : 0;

  const totalCols = columns.length + (selectable ? 1 : 0);
  const hasHeaderBar = searchKeys || toolbar || exportName || filters?.length;

  const exportMenuItems = (onlySelected: boolean) => [
    { label: "Excel (.xlsx)", icon: DocumentDownload, onSelect: () => runExport("xlsx", onlySelected) },
    { label: "PDF (.pdf)", icon: DocumentDownload, onSelect: () => runExport("pdf", onlySelected) },
    { label: "CSV (.csv)", icon: DocumentDownload, onSelect: () => runExport("csv", onlySelected) },
  ];

  return (
    <div className="rounded-xl border border-line bg-surface">
      {hasHeaderBar && (
        <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-3 py-2.5">
          {searchKeys && (
            <div className="relative w-56">
              <SearchNormal1 size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(0);
                }}
                placeholder={searchPlaceholder}
                className="h-7.5 w-full rounded-lg border border-line bg-bg pl-8 pr-3 text-[12.5px] outline-none focus:border-accent focus:bg-surface transition-colors placeholder:text-ink-faint"
              />
            </div>
          )}
          {filters?.map((f) => (
            <FilterSelect
              key={f.key}
              label={f.label}
              options={f.options}
              selected={active[f.key] ?? new Set()}
              onChange={(next) => {
                setActive((a) => ({ ...a, [f.key]: next }));
                setPage(0);
              }}
            />
          ))}
          {activeFilterCount > 0 && (
            <button
              onClick={() => setActive({})}
              className="flex items-center gap-1 text-[11.5px] text-ink-soft hover:text-ink cursor-pointer"
            >
              <CloseCircle size={13} /> Clear filters
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {toolbar}
            {exportName && (
              <Menu
                label="Export"
                trigger={
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-lg border border-line-strong px-2.5 py-1.5 text-[12px] text-ink-soft hover:bg-bg hover:text-ink cursor-pointer"
                  >
                    <DocumentDownload size={14} /> Export
                    <ArrowDown2 size={12} className="opacity-60" />
                  </button>
                }
                items={exportMenuItems(false)}
              />
            )}
          </div>
        </div>
      )}

      {selectable && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-accent-soft/60 px-3 py-2">
          <span className="text-[12.5px] font-medium text-accent">{selected.size} selected</span>
          <div className="ml-auto flex items-center gap-2">
            {bulkActions?.(selectedRows, clearSelection)}
            {exportName && (
              <Menu
                label="Export selected"
                trigger={
                  <button className="flex items-center gap-1 rounded-lg border border-accent/30 bg-surface px-2.5 py-1 text-[12px] text-accent hover:bg-bg cursor-pointer">
                    <DocumentDownload size={13} /> Export
                  </button>
                }
                items={exportMenuItems(true)}
              />
            )}
            <button
              onClick={clearSelection}
              className="rounded-lg px-2 py-1 text-[12px] text-ink-soft hover:text-ink cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-line">
              {selectable && (
                <th className="w-9 px-3 py-2">
                  <Checkbox checked={allSelected} indeterminate={!allSelected && someSelected} onChange={toggleAll} />
                </th>
              )}
              {columns.map((c) => {
                const sortable = c.sortable ?? !!c.label;
                const activeSort = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    onClick={
                      sortable
                        ? () =>
                            setSort((s) =>
                              s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 },
                            )
                        : undefined
                    }
                    className={cn(
                      "group select-none whitespace-nowrap px-3 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint",
                      sortable && "cursor-pointer hover:text-ink-soft",
                      c.numeric && "text-right",
                      c.className,
                    )}
                  >
                    <span className={cn("inline-flex items-center gap-1", c.numeric && "flex-row-reverse")}>
                      {c.label}
                      {sortable && c.label && (
                        <ArrowDown2
                          size={11}
                          className={cn(
                            "transition-all",
                            activeSort
                              ? cn("text-accent opacity-100", sort!.dir === -1 && "rotate-180")
                              : "opacity-25 group-hover:opacity-50",
                          )}
                        />
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={totalCols} className="px-3 py-10 text-center text-[13px] text-ink-faint">
                  {empty}
                </td>
              </tr>
            )}
            {visible.map((row) => {
              const k = rowKey(row);
              const isSel = selected.has(k);
              return (
                <tr
                  key={k}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "border-b border-line last:border-0",
                    onRowClick && "cursor-pointer hover:bg-bg",
                    isSel && "bg-accent-soft/40",
                  )}
                >
                  {selectable && (
                    <td className="px-3 py-2">
                      <Checkbox checked={isSel} onChange={() => toggleRow(k)} stop />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn("px-3 py-2 align-middle", c.numeric && "num text-right", c.className)}
                    >
                      {c.render ? c.render(row) : String(row[c.key] ?? "")}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[12px] text-ink-soft">
          <span>
            {filtered.length} rows · page {safePage + 1}/{pages}
          </span>
          <div className="flex gap-1">
            <button
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
              className="rounded-md border border-line px-2 py-0.5 disabled:opacity-40 cursor-pointer hover:bg-bg"
            >
              Prev
            </button>
            <button
              disabled={safePage >= pages - 1}
              onClick={() => setPage(safePage + 1)}
              className="rounded-md border border-line px-2 py-0.5 disabled:opacity-40 cursor-pointer hover:bg-bg"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
